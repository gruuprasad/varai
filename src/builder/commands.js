import fs from "node:fs";
import path from "node:path";
import { getAdapter } from "./adapter.js";
import { createProcessAdapter } from "./process-adapter.js";
import {
  clearLiveBuilderRun,
  getLiveBuilderRun,
  hasLiveBuilderRun,
  setLiveBuilderRun,
} from "./runtime.js";
import { createBuilderStore } from "./store.js";
import {
  failBuildSession,
  markBuildSuperseded,
  runBuildBegin,
  runBuildClose,
  runBuildStatus,
  setBuildLifecycle,
} from "../build-session/commands.js";
import { createBuildSessionStore } from "../build-session/store.js";
import { BUILD_STATES } from "../build-session/state.js";
import { loadRepoConfig } from "../scanners/config.js";
import { readSeed } from "../seed/store.js";

export { getLiveBuilderRun } from "./runtime.js";
export { clearLiveBuilderRuns } from "./runtime.js";

export async function resolveConfiguredAdapter(repoPath, adapterId, { sourceEnv = process.env } = {}) {
  if (!adapterId || typeof adapterId !== "string") throw new Error("Build run requires --adapter <configured-id>");
  const registered = getAdapter(adapterId);
  if (registered) return registered;

  const config = await loadRepoConfig(repoPath);
  const entry = config.builders?.[adapterId];
  if (!entry) throw new Error(`Unknown adapter "${adapterId}": not configured in varai.config.json builders`);
  return createProcessAdapter({
    id: adapterId,
    executable: entry.executable,
    args: entry.args ?? [],
    envAllowlist: entry.envAllowlist ?? [],
    sourceEnv,
  });
}

function seedChanged(repoPath, session) {
  const input = readSeed(repoPath);
  return !input?.ratified || input.contentHash !== session.seedHash;
}

/**
 * Seed change mid-build always wins over cancel/non-zero/crash as the terminal
 * recorded state — superseded is inspectable and must not be overwritten by
 * build_failed from a later stop.
 */
async function failOrSupersede(repoPath, sessionId, failure = {}) {
  const store = createBuildSessionStore(repoPath);
  const session = await store.getSession(sessionId);
  if (seedChanged(repoPath, session) || session.lifecycleState === BUILD_STATES.SUPERSEDED) {
    return markBuildSuperseded(repoPath, sessionId, {
      reason: "Approved Seed changed during the build session",
    });
  }
  return failBuildSession(repoPath, sessionId, failure);
}

/** Paths the managed builder is expected to write; not human interventions. */
const BUILDER_OWNED_BASENAMES = new Set([
  "varai.realization.json",
  "varai.runtime.json",
]);

function isBuilderOwnedPath(relPath) {
  if (typeof relPath !== "string" || !relPath) return false;
  return BUILDER_OWNED_BASENAMES.has(path.basename(relPath));
}

function resolveInterventionSource(source, relPath, live) {
  if (source === "builder") return "builder";
  if (source === "human") return "human";
  // Unsigned watcher/file edits default to human. Only known builder-owned
  // artifacts are treated as builder activity without an explicit tag.
  if (live && isBuilderOwnedPath(relPath)) return "builder";
  return "human";
}

export async function recordBuildIntervention(repoPath, {
  path: relPath,
  reason = "manual_edit",
  source,
} = {}) {
  const store = createBuildSessionStore(repoPath);
  const live = getLiveBuilderRun(repoPath);
  const active = await store.getActive();
  const attributed = resolveInterventionSource(source, relPath, live);

  if (active) {
    const session = await store.getSession(active.id);
    if (!session.completedAt) {
      if (attributed === "builder") {
        const builderStore = createBuilderStore(repoPath);
        await builderStore.appendEvent(session.id, {
          type: "builder_write",
          path: relPath,
          reason,
          source: "builder",
          at: new Date().toISOString(),
        });
        return session;
      }
      const intervention = {
        path: relPath,
        reason,
        source: "human",
        at: new Date().toISOString(),
      };
      const interventions = [...(session.interventions ?? []), intervention];
      const updated = { ...session, interventions };
      await store.putSession(updated);
      const builderStore = createBuilderStore(repoPath);
      await builderStore.appendEvent(session.id, { type: "intervention", ...intervention });
      return updated;
    }
  }

  // Edits after completion → unattested (status reports this; does not invent a gate).
  const sessions = await store.listSessions();
  const latest = sessions.find((session) => session.completedAt);
  if (!latest) return null;
  const updated = {
    ...latest,
    unattested: true,
    provenanceHint: { state: "unattested", sessionId: latest.id, path: relPath, at: new Date().toISOString() },
  };
  await store.putSession(updated);
  return updated;
}

async function writePacketFile(repoPath, sessionId, packet) {
  const dir = path.join(repoPath, ".varai", "build-v1", "sessions", sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const packetPath = path.join(dir, "packet.md");
  fs.writeFileSync(packetPath, packet, "utf8");
  return packetPath;
}

function createEventDrain(builderStore, sessionId) {
  const pending = [];
  return {
    onEvent(event) {
      pending.push(Promise.resolve(builderStore.appendEvent(sessionId, event)));
    },
    async flush() {
      await Promise.all(pending.splice(0, pending.length));
    },
  };
}

export async function runBuildRun(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const adapterId = options.adapter;
  if (!adapterId) throw new Error("Build run requires --adapter <configured-id>");
  if (hasLiveBuilderRun(repoPath)) throw new Error("A builder process is already running for this repository");

  // Register a cancelable handle *before* the session is observable as active,
  // so early `build stop` can prevent spawn.
  const runHandle = {
    adapter: null,
    sessionId: null,
    stopping: false,
    cancelRequested: false,
  };
  setLiveBuilderRun(repoPath, runHandle);

  let session;
  let packet;
  let builderStore;
  let drain;

  try {
    const adapter = await resolveConfiguredAdapter(repoPath, adapterId, { sourceEnv: options.env ?? process.env });
    const store = createBuildSessionStore(repoPath);
    let active = await store.getActive();

    if (runHandle.cancelRequested) {
      clearLiveBuilderRun(repoPath);
      if (active) {
        const canceled = await failOrSupersede(repoPath, active.id, {
          reason: "Build canceled before the builder process started",
        });
        return { session: { ...canceled, builder: { ...(canceled.builder ?? {}), canceled: true } }, exitCode: 1, canceled: true };
      }
      return { session: null, exitCode: 1, canceled: true };
    }

    if (active) {
      session = await store.getSession(active.id);
      if (session.completedAt) throw new Error("Active build session pointer is stale; clear it before running");
      if (session.lifecycleState === BUILD_STATES.BUILDING && session.builder?.running && !session.builder?.orphaned) {
        throw new Error("A build session is already building");
      }
      const packetObj = await store.getObject(session.packetHash);
      packet = packetObj.packet;
    } else {
      const begun = await runBuildBegin({ ...options, repo: repoPath, json: true, quiet: true });
      session = begun.session;
      packet = begun.packet;
    }

    runHandle.sessionId = session.id;

    // Yield so an early `build stop` that observed the active session can set
    // cancelRequested before we mark BUILDING / spawn.
    await new Promise((resolve) => setTimeout(resolve, 0));

    if (runHandle.cancelRequested) {
      const canceled = await failOrSupersede(repoPath, session.id, {
        reason: "Build canceled before the builder process started",
      });
      clearLiveBuilderRun(repoPath);
      if (options.json && !options.quiet) {
        process.stdout.write(`${JSON.stringify({ session: canceled, exitCode: 1, canceled: true }, null, 2)}\n`);
      } else if (!options.quiet) {
        process.stdout.write(`Build canceled before the builder started.\n`);
      }
      return { session: { ...canceled, builder: { ...(canceled.builder ?? {}), canceled: true } }, exitCode: 1, canceled: true };
    }

    const packetPath = await writePacketFile(repoPath, session.id, packet);
    builderStore = createBuilderStore(repoPath);
    await builderStore.putMeta(session.id, {
      adapterId,
      packetPath,
      startedAt: new Date().toISOString(),
    });

    session = await setBuildLifecycle(repoPath, session.id, {
      lifecycleState: BUILD_STATES.BUILDING,
      builder: {
        adapterId,
        running: true,
        orphaned: false,
        packetPath,
        startedAt: new Date().toISOString(),
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    if (runHandle.cancelRequested) {
      const canceled = await failOrSupersede(repoPath, session.id, {
        reason: "Build canceled before the builder process started",
      });
      clearLiveBuilderRun(repoPath);
      return { session: { ...canceled, builder: { ...(canceled.builder ?? {}), canceled: true } }, exitCode: 1, canceled: true };
    }

    drain = createEventDrain(builderStore, session.id);
    runHandle.adapter = adapter;

    let exitResult;
    try {
      exitResult = await adapter.start({
        cwd: repoPath,
        packetPath,
        onEvent: (event) => drain.onEvent(event),
      });
    } catch (err) {
      await drain.flush();
      clearLiveBuilderRun(repoPath);
      const failed = await failOrSupersede(repoPath, session.id, {
        reason: err.message,
        exitCode: null,
      });
      if (options.json) {
        if (!options.quiet) process.stdout.write(`${JSON.stringify({ session: failed, exitCode: 1 }, null, 2)}\n`);
      } else if (!options.quiet) {
        process.stdout.write(`Build failed: ${err.message}\n`);
      }
      return { session: failed, exitCode: 1 };
    } finally {
      await drain.flush();
      clearLiveBuilderRun(repoPath);
    }

    // Refresh session (interventions / supersession markers may have landed).
    session = await store.getSession(session.id);

    if (seedChanged(repoPath, session) || session.lifecycleState === BUILD_STATES.SUPERSEDED) {
      const superseded = await markBuildSuperseded(repoPath, session.id, {
        reason: "Approved Seed changed during the build session",
      });
      if (options.json) {
        if (!options.quiet) process.stdout.write(`${JSON.stringify({ session: superseded, exitCode: 1 }, null, 2)}\n`);
      } else if (!options.quiet) {
        process.stdout.write(`Build session ${superseded.id} superseded.\n`);
      }
      return { session: superseded, exitCode: 1 };
    }

    if (exitResult.exitCode !== 0) {
      const failed = await failOrSupersede(repoPath, session.id, {
        reason: `Builder exited with code ${exitResult.exitCode}${exitResult.signal ? ` (${exitResult.signal})` : ""}`,
        exitCode: exitResult.exitCode,
        signal: exitResult.signal,
      });
      if (options.json) {
        if (!options.quiet) process.stdout.write(`${JSON.stringify({ session: failed, exitCode: 1 }, null, 2)}\n`);
      } else if (!options.quiet) {
        process.stdout.write(`Build failed (${failed.gate.reasons?.[0] ?? "non-zero exit"}).\n`);
      }
      return { session: failed, exitCode: 1 };
    }

    session = await setBuildLifecycle(repoPath, session.id, {
      lifecycleState: BUILD_STATES.VERIFYING,
      builder: {
        ...(session.builder ?? {}),
        adapterId,
        running: false,
        orphaned: false,
        exitCode: 0,
        finishedAt: new Date().toISOString(),
      },
    });

    try {
      const closed = await runBuildClose({ ...options, repo: repoPath, mode: "built", json: true, quiet: true });
      const completed = await setBuildLifecycle(repoPath, closed.session.id, {
        lifecycleState: closed.session.gate?.state ?? BUILD_STATES.NEEDS_ATTENTION,
        builder: {
          ...(closed.session.builder ?? session.builder ?? {}),
          running: false,
          orphaned: false,
        },
      }, { completedSession: closed.session });
      if (options.json) {
        if (!options.quiet) {
          process.stdout.write(`${JSON.stringify({
            session: completed,
            report: closed.report,
            exitCode: closed.exitCode ?? 0,
          }, null, 2)}\n`);
        }
      } else if (!options.quiet) {
        process.stdout.write(`Build session ${completed.id} verified. Gate ${completed.gate?.state}.\n`);
      }
      return { session: completed, report: closed.report, exitCode: closed.exitCode ?? 0 };
    } catch (err) {
      if (/Seed changed|approve/i.test(err.message) || seedChanged(repoPath, session)) {
        const superseded = await markBuildSuperseded(repoPath, session.id, {
          reason: seedChanged(repoPath, session)
            ? "Approved Seed changed during the build session"
            : err.message,
        });
        return { session: superseded, exitCode: 1 };
      }
      const failed = await failOrSupersede(repoPath, session.id, { reason: err.message });
      if (options.json) {
        if (!options.quiet) process.stdout.write(`${JSON.stringify({ session: failed, exitCode: 1, error: err.message }, null, 2)}\n`);
      } else if (!options.quiet) {
        process.stdout.write(`Verification failed: ${err.message}\n`);
      }
      return { session: failed, exitCode: 1 };
    }
  } catch (err) {
    clearLiveBuilderRun(repoPath);
    throw err;
  }
}

export async function runBuildMessage(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const message = options.message;
  if (typeof message !== "string" || !message.trim()) throw new Error("Build message requires a non-empty product clarification");
  const live = getLiveBuilderRun(repoPath);
  if (!live?.adapter) throw new Error("No running builder process; start one with varai build run");
  await live.adapter.send({ sessionId: live.sessionId, message });
  const builderStore = createBuilderStore(repoPath);
  await builderStore.appendEvent(live.sessionId, {
    type: "message",
    direction: "to_builder",
    text: message,
    at: new Date().toISOString(),
  });
  if (options.json && !options.quiet) process.stdout.write(`${JSON.stringify({ ok: true, sessionId: live.sessionId }, null, 2)}\n`);
  else if (!options.quiet) process.stdout.write(`Message sent to builder session ${live.sessionId}.\n`);
  return { ok: true, sessionId: live.sessionId };
}

export async function runBuildStop(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const live = getLiveBuilderRun(repoPath);
  if (live) {
    live.stopping = true;
    live.cancelRequested = true;
    if (live.adapter) {
      await live.adapter.stop({ sessionId: live.sessionId });
      if (options.json && !options.quiet) process.stdout.write(`${JSON.stringify({ ok: true, stopped: true, sessionId: live.sessionId }, null, 2)}\n`);
      else if (!options.quiet) process.stdout.write(`Stopped builder session ${live.sessionId}.\n`);
      return { ok: true, stopped: true, sessionId: live.sessionId, cancelRequested: true };
    }
    // Handle registered but process not spawned yet — cancel flag prevents spawn.
    if (options.json && !options.quiet) {
      process.stdout.write(`${JSON.stringify({ ok: true, stopped: true, cancelRequested: true, sessionId: live.sessionId }, null, 2)}\n`);
    } else if (!options.quiet) {
      process.stdout.write("Canceled builder before process start.\n");
    }
    return { ok: true, stopped: true, cancelRequested: true, sessionId: live.sessionId };
  }

  // Orphaned / recovered session: heal disk so a new run is not blocked.
  const store = createBuildSessionStore(repoPath);
  const active = await store.getActive();
  if (active) {
    const session = await store.getSession(active.id);
    if (session.lifecycleState === BUILD_STATES.BUILDING && (session.builder?.running || !session.builder?.orphaned)) {
      await setBuildLifecycle(repoPath, session.id, {
        lifecycleState: BUILD_STATES.BUILDING,
        builder: {
          ...(session.builder ?? {}),
          running: false,
          orphaned: true,
          note: "stop requested but no live process was attached",
        },
      });
    }
  }
  if (options.json && !options.quiet) process.stdout.write(`${JSON.stringify({ ok: true, stopped: false, orphaned: true }, null, 2)}\n`);
  else if (!options.quiet) process.stdout.write("No live builder process to stop.\n");
  return { ok: true, stopped: false, orphaned: true };
}

export { runBuildStatus };
