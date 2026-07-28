import { spawn } from "node:child_process";

// Process adapter: one explicitly configured local CLI. Executable and fixed
// args come from local Varai config — never from a browser request body.

export const BUILDER_ENV_BASE_KEYS = Object.freeze(["PATH", "HOME", "TERM", "LANG", "LC_ALL"]);
export const MAX_EVENT_BYTES = 64 * 1024;
export const DEFAULT_MAX_EVENT_BYTES = 8 * 1024;
export const DEFAULT_STOP_GRACE_MS = 2000;
export const DEFAULT_STOP_KILL_WAIT_MS = 2000;

export function buildBuilderEnv(sourceEnv = {}, { envAllowlist = [] } = {}) {
  const allow = new Set(BUILDER_ENV_BASE_KEYS);
  for (const key of envAllowlist) {
    if (typeof key === "string" && key) allow.add(key);
  }
  const out = {};
  for (const key of allow) {
    if (sourceEnv[key] !== undefined && sourceEnv[key] !== null) out[key] = sourceEnv[key];
  }
  for (const key of Object.keys(sourceEnv)) {
    if (key.startsWith("LC_") && sourceEnv[key] != null) out[key] = sourceEnv[key];
  }
  return out;
}

function truncateText(text, maxBytes) {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return { text, truncated: false };
  return { text: buf.subarray(0, maxBytes).toString("utf8"), truncated: true };
}

function emitChunk(onEvent, stream, chunk, maxEventBytes) {
  if (!onEvent) return;
  const raw = chunk.toString("utf8");
  const { text, truncated } = truncateText(raw, maxEventBytes);
  onEvent({
    type: "output",
    stream,
    text,
    truncated,
    at: new Date().toISOString(),
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function killProcessTree(child, signal) {
  if (!child?.pid) return;
  try {
    // Negative PID targets the process group when the child is a group leader.
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // already gone
    }
  }
}

function hasExited(child) {
  return !child || child.exitCode != null || child.signalCode != null;
}

export function createProcessAdapter({
  id,
  executable,
  args = [],
  sourceEnv = process.env,
  envAllowlist = [],
  maxEventBytes = DEFAULT_MAX_EVENT_BYTES,
  stopGraceMs = DEFAULT_STOP_GRACE_MS,
  stopKillWaitMs = DEFAULT_STOP_KILL_WAIT_MS,
} = {}) {
  if (!id) throw new Error("Process adapter requires id");
  if (!executable || typeof executable !== "string") throw new Error("Process adapter requires executable");
  if (!Array.isArray(args) || args.some((a) => typeof a !== "string")) {
    throw new Error("Process adapter args must be an array of strings");
  }

  let child = null;
  let stopRequested = false;

  const adapter = {
    id,
    executable,
    args: [...args],
    envAllowlist: [...envAllowlist],
    maxEventBytes,
    async start({ cwd, packetPath, signal, onEvent } = {}) {
      if (child && !hasExited(child)) {
        throw new Error("Builder process is already running");
      }
      stopRequested = false;
      const env = buildBuilderEnv(sourceEnv, { envAllowlist });
      const argv = [...args, packetPath].filter((part) => part !== undefined && part !== null);
      // detached → new process group so stop can kill the whole tree.
      const spawned = spawn(executable, argv, {
        cwd,
        env,
        shell: false,
        signal,
        detached: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      child = spawned;

      spawned.stdout.on("data", (chunk) => emitChunk(onEvent, "stdout", chunk, maxEventBytes));
      spawned.stderr.on("data", (chunk) => emitChunk(onEvent, "stderr", chunk, maxEventBytes));

      const result = await new Promise((resolve, reject) => {
        spawned.once("error", reject);
        spawned.once("exit", (exitCode, sig) => {
          resolve({
            exitCode: exitCode ?? (sig ? 1 : 0),
            signal: sig ?? null,
            stopped: stopRequested,
            shell: false,
            pid: spawned.pid ?? null,
          });
        });
      });
      if (child === spawned) child = null;
      onEvent?.({
        type: "exit",
        exitCode: result.exitCode,
        signal: result.signal,
        at: new Date().toISOString(),
      });
      return result;
    },
    async send({ message } = {}) {
      if (!child || child.killed || hasExited(child)) {
        throw new Error("No running builder process to receive a message");
      }
      const line = typeof message === "string" ? message : JSON.stringify(message);
      child.stdin.write(`${line}\n`);
    },
    async stop() {
      if (hasExited(child)) return;
      stopRequested = true;
      const target = child;
      killProcessTree(target, "SIGTERM");
      await Promise.race([
        new Promise((resolve) => target.once("exit", resolve)),
        sleep(stopGraceMs),
      ]);
      if (!hasExited(target)) {
        killProcessTree(target, "SIGKILL");
        await Promise.race([
          new Promise((resolve) => target.once("exit", resolve)),
          sleep(stopKillWaitMs),
        ]);
      }
      // Bound wait: never hang forever even if the OS retains a zombie briefly.
    },
  };

  return adapter;
}
