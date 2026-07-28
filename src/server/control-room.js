import { projectBlueprint } from "../product-blueprint/project.js";
import { createBuilderStore } from "../builder/store.js";
import { runBuildStatus } from "../build-session/commands.js";
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

function decisionFromGate(gate, report) {
  const decisions = [];
  if (!gate) return decisions;

  for (const item of gate.requirementRegressions ?? []) {
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
      });
    }
  }
  for (const item of gate.scenarioProblems ?? []) {
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
    decisions.push({
      kind: "unaccounted_surface",
      id,
      label: item.elementName ?? id,
      evidenceIds: [id],
    });
  }
  for (const item of gate.coverageRegressions ?? []) {
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
  if (report?.provenance?.state === "unattested") {
    decisions.push({
      kind: "unattested",
      id: "repo",
      label: "Repository changed after ready",
      evidenceIds: ["provenance"],
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

export async function loadControlRoom({ repoPath, model = null } = {}) {
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

  let report = null;
  if (seedInput?.seed && model) {
    report = reconcile({
      model,
      seed: seedInput.seed,
      realization,
      provenance: { state: "unattested", sessionId: null },
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

  const sessionStore = createBuildSessionStore(repoPath);
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

  const decisions = decisionFromGate(gate ?? {
    state: report && (report.summary?.violated || report.surfaces?.missing?.length || report.surfaces?.unaccounted?.length)
      ? "needs_attention"
      : null,
    reasons: [],
    coverageRegressions: [],
    requirementRegressions: [],
    scenarioProblems: (completionReport?.scenarios?.results ?? [])
      .filter((item) => item.result === "failed" || item.result === "could_not_run")
      .map((item) => ({ id: item.id, result: item.result, reasons: item.reasons ?? [] })),
    surfaceProblems: null,
  }, completionReport);

  // Synthesize a gate-shaped object for verify UI when we only have live report issues.
  let verificationGate = gate;
  if (!verificationGate && decisions.length) {
    verificationGate = {
      state: "needs_attention",
      reasons: decisions.map((d) => `${d.kind}:${d.id}`),
      coverageRegressions: [],
      requirementRegressions: [],
      surfaceProblems: {
        missing: completionReport?.surfaces?.missing?.length ?? 0,
        unaccounted: completionReport?.surfaces?.unaccounted?.length ?? 0,
        ambiguous: completionReport?.surfaces?.ambiguous?.length ?? 0,
        stale: completionReport?.surfaces?.stale?.length ?? 0,
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
    },
  };
}

export function createControlRoomHandlers({ repoPath, getModel }) {
  return {
    async handle(req, res, url) {
      if (req.method !== "GET" || url.pathname !== "/api/control-room") return false;
      const model = typeof getModel === "function" ? await getModel() : null;
      const payload = await loadControlRoom({ repoPath, model });
      send(res, 200, payload);
      return true;
    },
  };
}
