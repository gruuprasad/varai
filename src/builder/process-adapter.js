import { spawn } from "node:child_process";

// Process adapter: one explicitly configured local CLI. Executable and fixed
// args come from local Varai config — never from a browser request body.

export const BUILDER_ENV_BASE_KEYS = Object.freeze(["PATH", "HOME", "TERM", "LANG", "LC_ALL"]);
export const MAX_EVENT_BYTES = 64 * 1024;
export const DEFAULT_MAX_EVENT_BYTES = 8 * 1024;

export function buildBuilderEnv(sourceEnv = {}) {
  const out = {};
  for (const key of BUILDER_ENV_BASE_KEYS) {
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

export function createProcessAdapter({
  id,
  executable,
  args = [],
  sourceEnv = process.env,
  maxEventBytes = DEFAULT_MAX_EVENT_BYTES,
  stopGraceMs = 2000,
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
    maxEventBytes,
    async start({ cwd, packetPath, signal, onEvent } = {}) {
      if (child && child.exitCode == null && child.signalCode == null) {
        throw new Error("Builder process is already running");
      }
      stopRequested = false;
      const env = buildBuilderEnv(sourceEnv);
      const argv = [...args, packetPath].filter((part) => part !== undefined && part !== null);
      const spawned = spawn(executable, argv, {
        cwd,
        env,
        shell: false,
        signal,
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
      if (!child || child.killed || child.exitCode != null) {
        throw new Error("No running builder process to receive a message");
      }
      const line = typeof message === "string" ? message : JSON.stringify(message);
      child.stdin.write(`${line}\n`);
    },
    async stop() {
      if (!child || child.exitCode != null || child.signalCode != null) return;
      stopRequested = true;
      child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, stopGraceMs)),
      ]);
      if (child && child.exitCode == null && child.signalCode == null) {
        child.kill("SIGKILL");
        await new Promise((resolve) => child.once("exit", resolve));
      }
    },
  };

  return adapter;
}
