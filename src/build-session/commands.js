import fs from "node:fs";
import path from "node:path";
import { canonicalStringify } from "../system-model/canonicalize.js";
import { semanticHash } from "../system-model/identity.js";
import { analyzeCurrent, persistCurrentModel } from "../snapshots/snapshot.js";
import { reconcile } from "../reconciliation/check.js";
import { readRealization } from "../reconciliation/witness-store.js";
import { renderBuildPacket } from "../seed/handoff.js";
import { readSeed } from "../seed/store.js";
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
  };
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
  };
  await store.putSession(session);
  await store.setActive({ id: session.id });
  if (options.json) process.stdout.write(`${JSON.stringify({ session: statusSummary(session), packet }, null, 2)}\n`);
  else process.stdout.write(`${packet}\nBuild session ${session.id} recorded. Close it after the builder changes the repository.\n`);
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
  const report = reconcile({
    model: snapshot.model,
    seed: input.seed,
    realization,
    provenance: {
      state: options.mode === "carry-forward" ? "recorded_carry_forward" : "recorded_build",
      sessionId: session.id,
    },
  });
  const reportHash = await store.putObject(report);
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
    },
    completedAt: new Date().toISOString(),
  };
  await store.putSession(completed);
  await store.clearActive();
  if (options.json) process.stdout.write(`${JSON.stringify({ session: statusSummary(completed), report }, null, 2)}\n`);
  else process.stdout.write(`Build session ${completed.id} closed as ${options.mode}.\n`);
  return { session: completed, report };
}

export async function runBuildStatus(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const store = createBuildSessionStore(repoPath);
  const active = await store.getActive();
  const sessions = await store.listSessions();
  const result = { active: active ? statusSummary(await store.getSession(active.id)) : null, sessions: sessions.map(statusSummary) };
  process.stdout.write(`${options.json ? JSON.stringify(result, null, 2) : JSON.stringify(result)}\n`);
  return result;
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
