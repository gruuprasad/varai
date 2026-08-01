import { projectBlueprint } from "../product-blueprint/project.js";
import { createBuilderStore } from "../builder/store.js";
import { findBuildProvenance, runBuildStatus } from "../build-session/commands.js";
import { createBuildSessionStore } from "../build-session/store.js";
import { getLiveBuilderRun } from "../builder/runtime.js";
import { loadRepoConfig } from "../scanners/config.js";
import { readSeed } from "../seed/store.js";
import { readAuthoringSession } from "../seed/authoring-session.js";
import { seedContentHash } from "../seed/identity.js";
import { reconcile } from "../reconciliation/check.js";
import { readRealization } from "../reconciliation/witness-store.js";
import { BUILD_STATES } from "../build-session/state.js";

function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(JSON.stringify(data));
}

function unresolvedFromReview(review) {
  const items = [];
  for (const [index, question] of (review?.questions ?? []).entries()) {
    items.push({ kind: "question", index, text: question });
  }
  for (const [index, text] of (review?.unsupported ?? []).entries()) {
    items.push({ kind: "unsupported", index, text });
  }
  return items;
}

function buildChangeProjection({ seedInput, authoring }) {
  const review = authoring?.review ?? null;
  const unresolved = unresolvedFromReview(review);
  const problems = review?.problems ?? [];
  const approvalAllowed = Boolean(review?.draft)
    && unresolved.length === 0
    && problems.length === 0;
  let approvalBlockedReason = null;
  if (!review?.draft) approvalBlockedReason = "No draft under review.";
  else if (problems.length) approvalBlockedReason = "Fix validation problems before approving.";
  else if (unresolved.length) approvalBlockedReason = "Resolve unresolved questions and unsupported statements before approving.";
  return {
    ratified: seedInput?.ratified ?? false,
    contentHash: seedInput?.contentHash ?? null,
    draft: review,
    unresolved,
    approvalAllowed,
    approvalBlockedReason,
  };
}

/**
 * Unattested/stale is a regression only after a ready/recorded build for the
 * *current* Seed. Never invent it for a never-built seed, and never borrow
 * readiness from another Seed's sessions.
 */
export function shouldSurfaceUnattested(liveProvenance, {
  seedHash = null,
  sessions = [],
  focusSession = null,
} = {}) {
  if (!seedHash) return false;

  const forSeed = sessions.filter((session) => session.seedHash === seedHash);
  if (focusSession?.seedHash === seedHash && !forSeed.some((s) => s.id === focusSession.id)) {
    forSeed.push(focusSession);
  }

  const hadReadyOrRecorded = forSeed.some((session) =>
    session.gate?.state === "ready"
    || session.lifecycleState === "ready"
    || session.completion?.mode === "built"
    || session.completion?.mode === "carry-forward");
  if (!hadReadyOrRecorded) return false;

  // Post-ready human/edit flag on the session (may keep matching tree hashes).
  if (forSeed.some((session) =>
    session.unattested === true || session.provenanceHint?.state === "unattested")) {
    return true;
  }

  if (!liveProvenance) return false;
  return liveProvenance.state === "stale" || liveProvenance.state === "unattested";
}

function decisionFromGate(gate, report, {
  sessions = [],
  seedHash = null,
  focusSession = null,
  liveProvenance = null,
  liveReport = null,
} = {}) {
  const decisions = [];
  if (!gate && !report && !liveProvenance) return decisions;

  const evidenceLocations = (evidence) => (evidence ?? [])
    .map((entry) => `${entry.file}${entry.line != null ? `:${entry.line}` : ""}`)
    .join(", ");

  for (const item of gate?.requirementRegressions ?? []) {
    decisions.push({
      kind: "missing_behavior",
      id: item.id,
      label: `${item.from} → ${item.to}`,
      evidenceIds: [item.id],
    });
  }
  for (const item of report?.commitments ?? []) {
    if (item.verdict === "violated" && !decisions.some((d) => d.id === item.id)) {
      decisions.push({
        kind: "missing_behavior",
        id: item.id,
        label: `${item.source} ${item.relation}`,
        evidenceIds: [item.id, ...(item.reasons ?? [])],
        detail: evidenceLocations(item.evidence ?? []),
      });
    }
  }
  for (const item of gate?.scenarioProblems ?? []) {
    decisions.push({
      kind: "failed_scenario",
      id: item.id,
      label: item.id,
      evidenceIds: [item.id, ...(item.reasons ?? [])],
    });
  }
  for (const item of report?.surfaces?.missing ?? []) {
    decisions.push({
      kind: "missing_behavior",
      id: item.surfaceId,
      label: item.surfaceName ?? item.surfaceId,
      evidenceIds: [item.surfaceId, item.reason].filter(Boolean),
    });
  }
  for (const item of report?.surfaces?.unaccounted ?? []) {
    const id = item.key ?? item.elementId;
    // Frozen close reports predate evidence on unaccounted entries; enrich
    // from the live projection so the verifier can always navigate.
    const liveItem = (liveReport?.surfaces?.unaccounted ?? []).find((entry) =>
      (entry.key ?? entry.elementId) === (item.key ?? item.elementId));
    const evidence = liveItem?.evidence?.length ? liveItem.evidence : (item.evidence ?? []);
    decisions.push({
      kind: "unaccounted_surface",
      id,
      label: item.elementName ?? id,
      evidenceIds: [id],
      detail: evidenceLocations(evidence),
    });
  }
  for (const item of gate?.coverageRegressions ?? []) {
    decisions.push({
      kind: "coverage_degradation",
      id: `${item.capability}:${item.scopeId}`,
      label: `${item.capability} on ${item.scopeId}`,
      evidenceIds: [item.scopeId, item.capability],
    });
  }
  for (const item of [...(report?.surfaces?.ambiguous ?? []), ...(report?.surfaces?.stale ?? [])]) {
    decisions.push({
      kind: "stale_binding",
      id: item.surfaceId ?? item.bindingId,
      label: item.surfaceName ?? item.surfaceId ?? item.bindingId,
      evidenceIds: [item.surfaceId, item.bindingId, item.reason].filter(Boolean),
    });
  }

  // Live provenance + session unattested flags — never the frozen close report alone.
  if (shouldSurfaceUnattested(liveProvenance, { seedHash, sessions, focusSession })) {
    const sessionId = liveProvenance?.sessionId
      ?? focusSession?.provenanceHint?.sessionId
      ?? focusSession?.id
      ?? "repo";
    const state = liveProvenance?.state
      ?? (focusSession?.provenanceHint?.state ?? "unattested");
    decisions.push({
      kind: "unattested",
      id: sessionId,
      label: state === "stale"
        ? "Recorded build no longer matches the repository"
        : "Repository changed after ready",
      evidenceIds: ["provenance", sessionId].filter(Boolean),
    });
  }
  return decisions;
}

function derivePhase({ seedInput, authoring, buildStatus, gate }) {
  if (!seedInput?.seed && !authoring?.review?.draft) return "empty";
  if (authoring?.review?.draft) return BUILD_STATES.DRAFT;
  if (buildStatus?.active) {
    return buildStatus.active.lifecycleState
      ?? (buildStatus.live?.running ? BUILD_STATES.BUILDING : BUILD_STATES.APPROVED);
  }
  if (gate?.state) return gate.state;
  if (seedInput?.ratified) return BUILD_STATES.APPROVED;
  return BUILD_STATES.DRAFT;
}

export async function loadControlRoom({
  repoPath,
  model = null,
  scannedTreeHash = null,
  scanConfigHash = null,
} = {}) {
  let seedInput = null;
  try {
    seedInput = readSeed(repoPath);
  } catch {
    seedInput = null;
  }

  const authoring = (() => {
    try {
      const session = readAuthoringSession(repoPath);
      if (!session) return null;
      const baseSeedHash = seedInput ? seedContentHash(seedInput.seed) : null;
      return { ...session, stale: session.baseSeedHash !== baseSeedHash };
    } catch {
      return null;
    }
  })();

  const realization = seedInput?.seed
    ? readRealization(repoPath, { seed: seedInput.seed })?.realization ?? null
    : null;

  const sessionStore = createBuildSessionStore(repoPath);
  const listedSessions = await sessionStore.listSessions();

  const provenance = seedInput?.seed
    ? await findBuildProvenance(repoPath, {
      seedHash: seedInput.contentHash,
      scannedTreeHash,
      scanConfigHash,
      realization,
    })
    : { state: "unattested", sessionId: null };

  let report = null;
  if (seedInput?.seed && model) {
    report = reconcile({
      model,
      seed: seedInput.seed,
      realization,
      provenance,
    });
  }

  const blueprint = projectBlueprint({
    seed: authoring?.review?.draft ?? seedInput?.seed ?? null,
    report,
  });

  const buildStatus = await runBuildStatus({ repo: repoPath, json: true, quiet: true });
  const live = getLiveBuilderRun(repoPath);
  const status = {
    ...buildStatus,
    live: live ? { sessionId: live.sessionId, running: true } : { running: false },
  };

  const active = status.active ? await sessionStore.getSession(status.active.id).catch(() => null) : null;
  const latestCompleted = (status.sessions ?? []).find((session) => session.completedAt) ?? null;
  const focusSession = active
    ?? (latestCompleted ? await sessionStore.getSession(latestCompleted.id).catch(() => null) : null);

  let events = [];
  if (focusSession?.id) {
    events = await createBuilderStore(repoPath).listEvents(focusSession.id);
  }

  const config = await loadRepoConfig(repoPath).catch(() => ({}));
  const adapters = Object.keys(config?.builders ?? {}).sort();

  const gate = focusSession?.gate ?? null;
  const completionReport = focusSession?.completion?.reportHash
    ? await sessionStore.getObject(focusSession.completion.reportHash).catch(() => report)
    : report;

  // Prefer live reconcile report when present; overlay live provenance so a
  // frozen close blob cannot hide post-ready unattested edits.
  const decisionReport = completionReport
    ? { ...completionReport, provenance: provenance ?? completionReport.provenance }
    : report;

  const seedHash = seedInput?.contentHash ?? null;
  const decisionSessions = focusSession ? [focusSession, ...listedSessions] : listedSessions;
  const decisions = decisionFromGate(gate ?? {
    state: report && (report.summary?.violated || report.surfaces?.missing?.length || report.surfaces?.unaccounted?.length)
      ? "needs_attention"
      : null,
    reasons: [],
    coverageRegressions: [],
    requirementRegressions: [],
    scenarioProblems: (decisionReport?.scenarios?.results ?? [])
      .filter((item) => item.result === "failed" || item.result === "could_not_run")
      .map((item) => ({ id: item.id, result: item.result, reasons: item.reasons ?? [] })),
    surfaceProblems: null,
  }, decisionReport, {
    sessions: decisionSessions,
    seedHash,
    focusSession,
    liveProvenance: provenance,
    liveReport: report,
  });

  let verificationGate = gate;
  const blockedByUnattested = decisions.some((d) => d.kind === "unattested");
  if (blockedByUnattested) {
    verificationGate = {
      ...(gate ?? {}),
      state: BUILD_STATES.NEEDS_ATTENTION,
      reasons: [...new Set([
        ...(gate?.reasons ?? []),
        ...decisions.filter((d) => d.kind === "unattested").map((d) => `unattested:${d.id}`),
      ])],
      coverageRegressions: gate?.coverageRegressions ?? [],
      requirementRegressions: gate?.requirementRegressions ?? [],
      surfaceProblems: gate?.surfaceProblems ?? {
        missing: decisionReport?.surfaces?.missing?.length ?? 0,
        unaccounted: decisionReport?.surfaces?.unaccounted?.length ?? 0,
        ambiguous: decisionReport?.surfaces?.ambiguous?.length ?? 0,
        stale: decisionReport?.surfaces?.stale?.length ?? 0,
      },
      scenarioProblems: gate?.scenarioProblems ?? [],
    };
  } else if (!verificationGate && decisions.length) {
    verificationGate = {
      state: "needs_attention",
      reasons: decisions.map((d) => `${d.kind}:${d.id}`),
      coverageRegressions: [],
      requirementRegressions: [],
      surfaceProblems: {
        missing: decisionReport?.surfaces?.missing?.length ?? 0,
        unaccounted: decisionReport?.surfaces?.unaccounted?.length ?? 0,
        ambiguous: decisionReport?.surfaces?.ambiguous?.length ?? 0,
        stale: decisionReport?.surfaces?.stale?.length ?? 0,
      },
      scenarioProblems: decisions.filter((d) => d.kind === "failed_scenario").map((d) => ({
        id: d.id, result: "failed", reasons: d.evidenceIds.slice(1),
      })),
    };
  } else if (!verificationGate && seedInput?.ratified && !decisions.length && !focusSession) {
    verificationGate = null;
  }

  const phase = derivePhase({ seedInput, authoring, buildStatus: status, gate: verificationGate });
  const change = buildChangeProjection({ seedInput, authoring });

  return {
    phase,
    blueprint,
    change,
    build: {
      session: focusSession
        ? {
          id: focusSession.id,
          seedHash: focusSession.seedHash,
          lifecycleState: focusSession.lifecycleState ?? focusSession.gate?.state ?? null,
          builder: focusSession.builder ?? null,
          interventions: focusSession.interventions ?? [],
          previewUrl: focusSession.builder?.previewUrl ?? null,
          changedFiles: focusSession.completion
            ? []
            : (focusSession.interventions ?? []).map((item) => item.path),
          gate: focusSession.gate ?? null,
        }
        : null,
      live: status.live,
      events,
      adapters,
      recent: (status.sessions ?? []).filter((session) => session.completedAt).slice(0, 5),
    },
    verification: {
      phase: verificationGate?.state ?? (seedInput?.ratified ? "approved" : "empty"),
      gate: verificationGate,
      decisions,
      reportSummary: completionReport?.summary ?? null,
      provenance,
    },
  };
}

export function createControlRoomHandlers({ repoPath, getModel, getScanMeta }) {
  return {
    async handle(req, res, url) {
      if (req.method !== "GET" || url.pathname !== "/api/control-room") return false;
      const model = typeof getModel === "function" ? await getModel() : null;
      const meta = typeof getScanMeta === "function" ? await getScanMeta() : null;
      const payload = await loadControlRoom({
        repoPath,
        model,
        scannedTreeHash: meta?.scannedTreeHash ?? null,
        scanConfigHash: meta?.scanConfigHash ?? null,
      });
      send(res, 200, payload);
      return true;
    },
  };
}
