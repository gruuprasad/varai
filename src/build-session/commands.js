import fs from "node:fs";
import path from "node:path";
import { canonicalStringify } from "../system-model/canonicalize.js";
import { semanticHash } from "../system-model/identity.js";
import { analyzeCurrent, persistCurrentModel } from "../snapshots/snapshot.js";
import { createSnapshotStore } from "../snapshots/store.js";
import { reconcile } from "../reconciliation/check.js";
import { projectContinuity } from "../reconciliation/continuity.js";
import { readRealization } from "../reconciliation/witness-store.js";
import { renderBuildPacket } from "../seed/handoff.js";
import { readSeed } from "../seed/store.js";
import { runVerifyScenarios } from "../runtime/commands.js";
import { evaluateBuildGate } from "./evaluate.js";
import { BUILD_STATES, GATE_STATES, isNonZeroExitGate } from "./state.js";
import { createBuildSessionStore } from "./store.js";

function sessionId({ seedHash, packetHash, start }) {
  return `build:${semanticHash(canonicalStringify({ seedHash, packetHash, start })).slice(0, 20)}`;
}

function statusSummary(session) {
  return {
    id: session.id,
    seedHash: session.seedHash,
    startedAt: session.startedAt,
    completedAt: session.completedAt ?? null,
    mode: session.completion?.mode ?? null,
    startTree: session.start.implementationTreeHash,
    endTree: session.completion?.implementationTreeHash ?? null,
    gate: session.gate ?? null,
    lifecycleState: session.lifecycleState ?? (session.completedAt ? session.gate?.state ?? null : null),
    builder: session.builder ?? null,
    interventions: session.interventions ?? [],
    provenanceHint: session.provenanceHint ?? null,
  };
}

function writeOutput(options, jsonValue, textValue) {
  if (options.quiet) return;
  if (options.json) process.stdout.write(`${JSON.stringify(jsonValue, null, 2)}\n`);
  else process.stdout.write(textValue);
}

async function loadSnapshotModel(repoPath, snapshotId) {
  const store = createSnapshotStore(repoPath);
  const manifest = await store.getSnapshot(snapshotId);
  return store.getObject(manifest.modelObjectHash);
}

export async function runBuildBegin(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const input = readSeed(repoPath);
  if (!input?.ratified) throw new Error("Build begin requires an approved varai.seed.json");
  const store = createBuildSessionStore(repoPath);
  if (await store.getActive()) throw new Error("A build session is already active; close it before beginning another");
  const brief = options.brief ? fs.readFileSync(path.resolve(options.brief), "utf8") : undefined;
  const packet = renderBuildPacket({ seed: input.seed, brief });
  const current = await analyzeCurrent(repoPath, options);
  const snapshot = await persistCurrentModel(repoPath, current);
  const seedObjectHash = await store.putObject(input.seed);
  const packetHash = await store.putObject({ packet });
  const start = {
    snapshotId: snapshot.manifest.id,
    git: current.git,
    scannedTreeHash: current.scannedTreeHash,
    implementationTreeHash: current.implementationTreeHash,
    scanConfigHash: current.scanConfigHash,
  };
  const session = {
    formatVersion: 1,
    id: sessionId({ seedHash: input.contentHash, packetHash, start }),
    seedHash: input.contentHash,
    seedObjectHash,
    packetHash,
    start,
    startedAt: new Date().toISOString(),
    lifecycleState: BUILD_STATES.APPROVED,
    builder: null,
    interventions: [],
  };
  await store.putSession(session);
  await store.setActive({ id: session.id });
  writeOutput(
    options,
    { session: statusSummary(session), packet },
    `${packet}\nBuild session ${session.id} recorded. Close it after the builder changes the repository.\n`,
  );
  return { session, packet };
}

export async function runBuildClose(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  if (!options.mode || !["built", "carry-forward"].includes(options.mode)) throw new Error("Build close requires --mode built or --mode carry-forward");
  const store = createBuildSessionStore(repoPath);
  const active = await store.getActive();
  if (!active) throw new Error("No active build session");
  const session = await store.getSession(active.id);
  const input = readSeed(repoPath);
  if (!input?.ratified || input.contentHash !== session.seedHash) throw new Error("The approved Seed changed during this build session; begin a new session");
  const current = await analyzeCurrent(repoPath, options);
  if (current.scanConfigHash !== session.start.scanConfigHash) throw new Error("Scan configuration changed during this build session; begin a new session");
  if (options.mode === "carry-forward" && current.implementationTreeHash !== session.start.implementationTreeHash) {
    throw new Error("Carry-forward requires an unchanged scanned implementation tree");
  }
  const realization = readRealization(repoPath, { seed: input.seed })?.realization;
  if (!realization) throw new Error("Build close requires varai.realization.json");
  const snapshot = await persistCurrentModel(repoPath, current);
  const realizationObjectHash = await store.putObject(realization);

  let scenarioRun = null;
  if ((input.seed.scenarios ?? []).length > 0) {
    try {
      const verified = await runVerifyScenarios({
        repo: repoPath,
        current,
        quiet: true,
      });
      scenarioRun = verified.run;
    } catch (err) {
      scenarioRun = {
        id: null,
        seedHash: input.contentHash,
        scenarios: (input.seed.scenarios ?? []).map((scenario) => ({
          id: scenario.id,
          name: scenario.name,
          result: "could_not_run",
          reasons: [err.message],
        })),
      };
    }
  }
  // Empty-scenario seeds must not inherit unrelated historical scenario evidence.

  const startModel = await loadSnapshotModel(repoPath, session.start.snapshotId);
  const startReport = reconcile({
    model: startModel,
    seed: input.seed,
    realization,
    provenance: { state: "recorded_build", sessionId: session.id },
  });
  const report = reconcile({
    model: snapshot.model,
    seed: input.seed,
    realization,
    provenance: {
      state: options.mode === "carry-forward" ? "recorded_carry_forward" : "recorded_build",
      sessionId: session.id,
    },
    scenarioRun,
  });
  const gate = evaluateBuildGate({
    startModel,
    completionModel: snapshot.model,
    startReport,
    completionReport: report,
    scenarioRun,
  });
  const reportHash = await store.putObject(report);
  const scenarioRunHash = scenarioRun ? await store.putObject(scenarioRun) : null;
  const completed = {
    ...session,
    completion: {
      mode: options.mode,
      snapshotId: snapshot.manifest.id,
      git: current.git,
      scannedTreeHash: current.scannedTreeHash,
      implementationTreeHash: current.implementationTreeHash,
      scanConfigHash: current.scanConfigHash,
      realizationObjectHash,
      reportHash,
      ...(scenarioRunHash ? { scenarioRunHash } : {}),
    },
    gate,
    lifecycleState: gate.state,
    completedAt: new Date().toISOString(),
    builder: {
      ...(session.builder ?? {}),
      running: false,
      orphaned: false,
    },
  };
  await store.putSession(completed);
  await store.clearActive();
  const exitCode = isNonZeroExitGate(gate.state) ? 1 : 0;
  writeOutput(
    options,
    { session: statusSummary(completed), report, exitCode },
    `Build session ${completed.id} closed as ${options.mode}.\nGate ${gate.state}` +
      (gate.reasons.length ? ` (${gate.reasons.length} reason${gate.reasons.length === 1 ? "" : "s"})` : "") +
      `.\n`,
  );
  return { session: completed, report, exitCode };
}

function formatStatusText(result) {
  const lines = [];
  if (result.active) {
    lines.push(`Active ${result.active.id}`);
  } else {
    lines.push("No active build session");
  }
  for (const session of result.sessions) {
    const gate = session.gate;
    const gateText = gate
      ? ` gate ${gate.state} (${gate.reasons?.length ?? 0} reasons, ${gate.coverageRegressions?.length ?? 0} coverage regressions, ${gate.requirementRegressions?.length ?? 0} requirement regressions)`
      : " gate —";
    lines.push(`${session.id}${session.completedAt ? " completed" : " open"}${gateText}`);
  }
  if (result.continuity) {
    const s = result.continuity.summary;
    lines.push(`binding continuity: ${s.carried} carried, ${s.rebound} rebound, ${s.new} new, ${s.unresolvable} unresolvable`);
    for (const entry of result.continuity.entries) {
      if (entry.state === "rebound") {
        const fates = (entry.oldElementFates ?? []).map((item) => `${item.elementId} (${item.fate})`).join(", ");
        lines.push(`  rebound ${entry.id} -> ${entry.to?.join(", ") ?? ""}; old: ${fates}`);
      } else if (entry.state === "unresolvable") {
        lines.push(`  unresolvable ${entry.id} (${entry.reason})`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

export async function runBuildStatus(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const store = createBuildSessionStore(repoPath);
  const active = await store.getActive();
  const sessions = await store.listSessions();
  let activeSession = active ? await store.getSession(active.id) : null;
  let activeSummary = activeSession ? statusSummary(activeSession) : null;
  if (activeSummary?.builder) {
    const { getLiveBuilderRun } = await import("../builder/runtime.js");
    const live = getLiveBuilderRun(repoPath);
    if (!live) {
      const healedBuilder = {
        ...activeSummary.builder,
        running: false,
        orphaned: activeSummary.builder.orphaned || Boolean(activeSummary.builder.running),
      };
      // Persist heal so a subsequent build run is not blocked by stale running:true.
      if (activeSession.builder?.running || !activeSession.builder?.orphaned) {
        activeSession = await setBuildLifecycle(repoPath, activeSession.id, {
          builder: {
            ...(activeSession.builder ?? {}),
            ...healedBuilder,
            note: activeSession.builder?.note ?? "process not attached after restart",
          },
        });
      }
      activeSummary = {
        ...statusSummary(activeSession),
        builder: healedBuilder,
      };
    }
  }
  const latestCompleted = sessions.find((session) => session.completedAt) ?? null;
  const provenanceHint = latestCompleted?.provenanceHint
    ?? (latestCompleted?.unattested ? { state: "unattested", sessionId: latestCompleted.id } : null);

  // Binding continuity (plan §3.5): compare the current mapping with the
  // latest prior `ready` session on demand. Computed only when such a
  // baseline exists; otherwise explicitly absent.
  let continuity = null;
  const priorReady = sessions.find((session) =>
    session.gate?.state === GATE_STATES.READY && session.completion && session.id !== active?.id);
  if (priorReady && priorReady.completion?.snapshotId) {
    const baselineSeed = await store.getObject(priorReady.seedObjectHash);
    const baselineRealization = priorReady.completion?.realizationObjectHash
      ? await store.getObject(priorReady.completion.realizationObjectHash)
      : null;
    const priorModel = await loadSnapshotModel(repoPath, priorReady.completion.snapshotId);
    const seedInput = readSeed(repoPath);
    const realizationInput = seedInput ? readRealization(repoPath, { seed: seedInput.seed }) : null;
    if (seedInput && realizationInput) {
      const current = await analyzeCurrent(repoPath, options);
      continuity = projectContinuity({
        currentModel: current.scan.model,
        currentSeed: seedInput.seed,
        currentRealization: realizationInput.realization,
        priorModel,
        priorSeed: baselineSeed,
        priorRealization: baselineRealization,
      });
    }
  }

  const result = {
    active: activeSummary,
    sessions: (await store.listSessions()).map(statusSummary),
    provenanceHint,
    continuity,
  };
  writeOutput(options, result, formatStatusText(result));
  return result;
}

export async function setBuildLifecycle(repoPath, sessionId, patch, { completedSession } = {}) {
  const store = createBuildSessionStore(repoPath);
  const base = completedSession ?? await store.getSession(sessionId);
  const updated = {
    ...base,
    ...patch,
    builder: patch.builder !== undefined ? patch.builder : base.builder,
  };
  await store.putSession(updated);
  return updated;
}

export async function failBuildSession(repoPath, sessionId, { reason, exitCode = null, signal = null } = {}) {
  const store = createBuildSessionStore(repoPath);
  const session = await store.getSession(sessionId);
  const gate = {
    state: GATE_STATES.BUILD_FAILED,
    reasons: [reason ?? "Builder failed"],
    coverageRegressions: [],
    requirementRegressions: [],
    coverageTransitions: [],
  };
  const failed = {
    ...session,
    lifecycleState: BUILD_STATES.BUILD_FAILED,
    gate,
    builder: {
      ...(session.builder ?? {}),
      running: false,
      orphaned: false,
      exitCode,
      signal,
      finishedAt: new Date().toISOString(),
    },
    completedAt: new Date().toISOString(),
    completion: session.completion ?? {
      mode: "build_failed",
      exitCode,
      signal,
    },
  };
  await store.putSession(failed);
  await store.clearActive();
  return failed;
}

export async function markBuildSuperseded(repoPath, sessionId, { reason } = {}) {
  const store = createBuildSessionStore(repoPath);
  const session = await store.getSession(sessionId);
  const gate = {
    state: GATE_STATES.SUPERSEDED,
    reasons: [reason ?? "Approved Seed changed during the build session"],
    coverageRegressions: [],
    requirementRegressions: [],
    coverageTransitions: [],
  };
  const superseded = {
    ...session,
    lifecycleState: BUILD_STATES.SUPERSEDED,
    gate,
    builder: {
      ...(session.builder ?? {}),
      running: false,
      orphaned: false,
      finishedAt: new Date().toISOString(),
    },
    completedAt: new Date().toISOString(),
    completion: session.completion ?? { mode: "superseded" },
  };
  await store.putSession(superseded);
  await store.clearActive();
  return superseded;
}

export async function findBuildProvenance(repoPath, { seedHash, scannedTreeHash, scanConfigHash, realization } = {}) {
  const store = createBuildSessionStore(repoPath);
  const realizationObjectHash = realization ? semanticHash(canonicalStringify(realization)) : null;
  const sessions = await store.listSessions();
  const matching = sessions.find((session) => session.seedHash === seedHash &&
    session.completion?.scannedTreeHash === scannedTreeHash &&
    session.completion?.scanConfigHash === scanConfigHash &&
    session.completion?.realizationObjectHash === realizationObjectHash);
  if (matching) return { state: matching.completion.mode === "carry-forward" ? "recorded_carry_forward" : "recorded_build", sessionId: matching.id };
  const related = sessions.find((session) => session.seedHash === seedHash);
  return related ? { state: "stale", sessionId: related.id } : { state: "unattested", sessionId: null };
}


// Baseline for handoff changes / carry-forward candidates and binding
// continuity: the latest completed build session whose gate is `ready`. The
// session store already persists the approved Seed and the builder's
// realization by object hash — no separate ledger is added (plan §3.5).
export async function loadLatestReadyBaseline(repoPath) {
  const store = createBuildSessionStore(repoPath);
  const sessions = await store.listSessions();
  const ready = sessions.find((session) => session.gate?.state === GATE_STATES.READY && session.completion);
  if (!ready) return null;
  const seed = await store.getObject(ready.seedObjectHash);
  const realization = ready.completion?.realizationObjectHash
    ? await store.getObject(ready.completion.realizationObjectHash)
    : null;
  return { sessionId: ready.id, seed, realization };
}
