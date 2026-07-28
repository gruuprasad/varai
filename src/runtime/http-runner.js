import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
import path from "node:path";
import { SCENARIO_CAPTURE_REF_PATTERN } from "../seed/scenarios.js";
import { CHILD_ENV_BASE_KEYS, ENV_HEADER_TOKEN_PATTERN, PORT_PLACEHOLDER, RUNTIME_BOUNDS } from "./schema.js";
import { isLoopbackHostname, isSafeAbsolutePath } from "./validate.js";
import { resolveScenarioPrincipals } from "./resolve.js";

export { isLoopbackHostname, isSafeAbsolutePath };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function allocateEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((err) => {
        if (err) reject(err);
        else if (!port) reject(new Error("Failed to allocate an ephemeral port"));
        else resolve(port);
      });
    });
    server.on("error", reject);
  });
}

function replacePort(value, port) {
  if (typeof value !== "string") return value;
  return value.split(PORT_PLACEHOLDER).join(String(port));
}

export function assertLoopbackUrl(requestUrl, baseUrl) {
  let request;
  let base;
  try {
    request = new URL(requestUrl);
    base = new URL(baseUrl);
  } catch {
    throw new Error("Request URL is not a valid absolute URL");
  }
  if (!isLoopbackHostname(request.hostname) || !isLoopbackHostname(base.hostname)) {
    throw new Error(`Refusing non-loopback request host ${request.hostname}`);
  }
  if (request.origin !== base.origin) {
    throw new Error(`Request origin ${request.origin} does not match loopback base ${base.origin}`);
  }
}

export function buildChildEnv({ sourceEnv = {}, personas = [] } = {}) {
  const allow = new Set(CHILD_ENV_BASE_KEYS);
  for (const key of Object.keys(sourceEnv)) {
    if (key.startsWith("UV_")) allow.add(key);
  }
  for (const persona of personas) {
    if (typeof persona?.credentialEnv === "string" && persona.credentialEnv) {
      allow.add(persona.credentialEnv);
    }
  }
  const out = {};
  for (const key of allow) {
    if (sourceEnv[key] !== undefined && sourceEnv[key] !== null) out[key] = sourceEnv[key];
  }
  for (const persona of personas) {
    const name = persona?.credentialEnv;
    if (name && (out[name] === undefined || out[name] === "")) {
      out[name] = `varai-fixture-${persona.id}-token`;
    }
  }
  return out;
}

export async function stopChildProcess(child, { graceMs = 2000 } = {}) {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(graceMs),
  ]);
  if (child.exitCode != null || child.signalCode != null) return;
  child.kill("SIGKILL");
  await new Promise((resolve) => child.once("exit", resolve));
}

function resolveExecutableSync(executable, env = {}) {
  if (path.isAbsolute(executable)) return executable;
  const pathEnv = env.PATH ?? "";
  for (const dir of pathEnv.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, executable);
    try {
      accessSync(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // continue
    }
  }
  const fallback = path.join(env.HOME ?? "", ".local", "bin", executable);
  try {
    accessSync(fallback, fsConstants.X_OK);
    return fallback;
  } catch {
    return executable;
  }
}

export function materializeHeaders(headers, env) {
  const out = {};
  for (const [name, template] of Object.entries(headers ?? {})) {
    out[name] = String(template).replace(ENV_HEADER_TOKEN_PATTERN, (_, envName) => {
      const value = env[envName];
      if (value === undefined || value === "") {
        throw new Error(`Missing credential environment variable ${envName}`);
      }
      return value;
    });
  }
  return out;
}

export function collectSecretValues(personas, env) {
  const secrets = new Set();
  for (const persona of personas ?? []) {
    const value = env[persona.credentialEnv];
    if (typeof value === "string" && value) secrets.add(value);
  }
  return [...secrets];
}

export function redactValue(value, secrets) {
  if (typeof value === "string") {
    let text = value;
    for (const secret of secrets) {
      if (secret) text = text.split(secret).join("[REDACTED]");
    }
    return text;
  }
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) out[key] = redactValue(nested, secrets);
    return out;
  }
  return value;
}

function camelToSnake(name) {
  return String(name).replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/-/g, "_").toLowerCase();
}

function lookupInput(input, paramName) {
  if (!input || typeof input !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(input, paramName)) return input[paramName];
  const snake = camelToSnake(paramName);
  if (Object.prototype.hasOwnProperty.call(input, snake)) return input[snake];
  const camel = String(paramName).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  if (Object.prototype.hasOwnProperty.call(input, camel)) return input[camel];
  return undefined;
}

export function resolveCapturePath(captures, ref) {
  if (typeof ref !== "string" || !ref.startsWith("$")) return ref;
  if (!SCENARIO_CAPTURE_REF_PATTERN.test(ref)) {
    throw new Error(`Invalid capture reference ${ref}`);
  }
  const parts = ref.slice(1).split(".");
  const [captureName, ...pathParts] = parts;
  if (!Object.prototype.hasOwnProperty.call(captures, captureName)) {
    throw new Error(`Unknown capture ${captureName}`);
  }
  let current = captures[captureName];
  for (const part of pathParts) {
    if (current == null || typeof current !== "object") {
      throw new Error(`Capture path ${ref} could not be resolved`);
    }
    current = current[part];
  }
  return current;
}

export function resolveInputValue(value, captures) {
  if (typeof value === "string" && value.startsWith("$")) return resolveCapturePath(captures, value);
  if (Array.isArray(value)) return value.map((item) => resolveInputValue(item, captures));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) out[key] = resolveInputValue(nested, captures);
    return out;
  }
  return value;
}

export function buildRequestFromStep({ operation, input, captures }) {
  if (typeof operation.path !== "string" || !operation.path.startsWith("/") || operation.path.startsWith("//")) {
    throw new Error(`Unsafe operation path ${operation.path}`);
  }
  const resolvedInput = input === undefined ? undefined : resolveInputValue(input, captures);
  let routePath = operation.path;
  const usedKeys = new Set();
  routePath = routePath.replace(/\{([^}/]+)\}/g, (_, name) => {
    const value = lookupInput(resolvedInput, name);
    if (value === undefined || value === null) {
      throw new Error(`Missing path parameter ${name} for ${operation.behavior}`);
    }
    usedKeys.add(name);
    usedKeys.add(camelToSnake(name));
    usedKeys.add(String(name).replace(/_([a-z])/g, (_, c) => c.toUpperCase()));
    return encodeURIComponent(String(value));
  });
  if (!isSafeAbsolutePath(routePath)) {
    throw new Error(`Resolved path is not a safe absolute path: ${routePath}`);
  }
  let body;
  let query;
  if (resolvedInput && typeof resolvedInput === "object" && !Array.isArray(resolvedInput)) {
    const remainder = {};
    for (const [key, value] of Object.entries(resolvedInput)) {
      if (usedKeys.has(key) || usedKeys.has(camelToSnake(key))) continue;
      remainder[key] = value;
    }
    if (Object.keys(remainder).length) {
      if (["GET", "HEAD"].includes(operation.method)) query = remainder;
      else body = remainder;
    }
  } else if (resolvedInput !== undefined && !["GET", "HEAD"].includes(operation.method)) {
    body = resolvedInput;
  }
  return { path: routePath, body, query };
}

function partialMatch(actual, expected, pathLabel = "$") {
  if (expected === null || ["string", "number", "boolean"].includes(typeof expected)) {
    if (actual !== expected) {
      return { ok: false, message: `body ${pathLabel} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}` };
    }
    return { ok: true };
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return { ok: false, message: `body ${pathLabel} expected array` };
    }
    if (actual.length < expected.length) {
      return { ok: false, message: `body ${pathLabel} expected at least ${expected.length} items` };
    }
    for (let i = 0; i < expected.length; i++) {
      const nested = partialMatch(actual[i], expected[i], `${pathLabel}[${i}]`);
      if (!nested.ok) return nested;
    }
    return { ok: true };
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
      return { ok: false, message: `body ${pathLabel} expected object` };
    }
    for (const [key, value] of Object.entries(expected)) {
      const nested = partialMatch(actual[key], value, `${pathLabel}.${key}`);
      if (!nested.ok) return nested;
    }
    return { ok: true };
  }
  return { ok: false, message: `unsupported expect body at ${pathLabel}` };
}

async function waitForHealth(baseUrl, healthPath, { timeoutMs, pollMs }) {
  if (!isSafeAbsolutePath(healthPath)) {
    throw new Error(`Unsafe healthPath ${healthPath}`);
  }
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const healthUrl = new URL(healthPath, baseUrl).toString();
      assertLoopbackUrl(healthUrl, baseUrl);
      const response = await fetch(healthUrl, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(RUNTIME_BOUNDS.requestTimeoutMs),
      });
      if (response.ok) return;
      lastError = new Error(`health status ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    await sleep(pollMs);
  }
  throw new Error(`Health check did not become ready: ${lastError?.message ?? "unknown error"}`);
}

async function readBoundedJson(response) {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > RUNTIME_BOUNDS.maxBodyBytes) {
    throw new Error(`Response body exceeds ${RUNTIME_BOUNDS.maxBodyBytes} bytes`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { __nonJson: true, text };
  }
}

export async function startAppProcess({ repoPath, runtime, port, env }) {
  const executable = resolveExecutableSync(runtime.start.executable, env);
  const args = runtime.start.args.map((arg) => replacePort(arg, port));
  const child = spawn(executable, args, {
    cwd: repoPath,
    env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
    if (stdout.length > RUNTIME_BOUNDS.maxBodyBytes) stdout = stdout.slice(-RUNTIME_BOUNDS.maxBodyBytes);
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
    if (stderr.length > RUNTIME_BOUNDS.maxBodyBytes) stderr = stderr.slice(-RUNTIME_BOUNDS.maxBodyBytes);
  });
  const baseUrl = replacePort(runtime.baseUrl, port);
  assertLoopbackUrl(`${baseUrl}/`, baseUrl);
  const stop = async () => stopChildProcess(child);
  try {
    await waitForHealth(baseUrl, runtime.healthPath, {
      timeoutMs: RUNTIME_BOUNDS.healthTimeoutMs,
      pollMs: RUNTIME_BOUNDS.healthPollMs,
    });
  } catch (err) {
    await stop();
    throw new Error(`${err.message}\nstdout: ${stdout}\nstderr: ${stderr}`);
  }
  return { child, baseUrl, stdout, stderr, stop };
}

export async function executeScenario({
  scenario,
  operations,
  personas,
  baseUrl,
  env,
  secrets,
}) {
  const startedAt = new Date().toISOString();
  const principalResult = resolveScenarioPrincipals({
    principals: scenario.principals,
    personas,
  });
  if (!principalResult.ok) {
    return {
      id: scenario.id,
      name: scenario.name,
      result: "could_not_run",
      reasons: principalResult.problems.map((p) => p.message),
      steps: [],
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  const captures = {};
  const stepRecords = [];
  const deadline = Date.now() + RUNTIME_BOUNDS.maxScenarioDurationMs;

  for (const step of scenario.steps) {
    if (Date.now() > deadline) {
      return {
        id: scenario.id,
        name: scenario.name,
        result: "failed",
        reasons: ["scenario-duration-exceeded"],
        steps: stepRecords,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }
    const operation = operations.get(step.invoke);
    if (!operation) {
      return {
        id: scenario.id,
        name: scenario.name,
        result: "could_not_run",
        reasons: [`No runtime operation mapped for ${step.invoke}`],
        steps: stepRecords,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }
    const persona = principalResult.byAlias[step.as];
    let requestPlan;
    try {
      requestPlan = buildRequestFromStep({ operation, input: step.input, captures });
    } catch (err) {
      return {
        id: scenario.id,
        name: scenario.name,
        result: "could_not_run",
        reasons: [err.message],
        steps: stepRecords,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    let headers;
    try {
      headers = materializeHeaders(persona.headers, env);
    } catch (err) {
      return {
        id: scenario.id,
        name: scenario.name,
        result: "could_not_run",
        reasons: [err.message],
        steps: stepRecords,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }
    if (requestPlan.body !== undefined) headers["content-type"] = "application/json";

    const target = new URL(requestPlan.path, baseUrl);
    if (requestPlan.query) {
      for (const [key, value] of Object.entries(requestPlan.query)) {
        target.searchParams.set(key, String(value));
      }
    }

    const stepStarted = new Date().toISOString();
    let status;
    let body;
    let error = null;
    try {
      assertLoopbackUrl(target.toString(), baseUrl);
      const response = await fetch(target, {
        method: operation.method,
        headers,
        body: requestPlan.body === undefined ? undefined : JSON.stringify(requestPlan.body),
        redirect: "error",
        signal: AbortSignal.timeout(RUNTIME_BOUNDS.requestTimeoutMs),
      });
      status = response.status;
      body = await readBoundedJson(response);
    } catch (err) {
      error = err.message;
    }

    const record = {
      id: step.id,
      invoke: step.invoke,
      as: step.as,
      personaId: persona.id,
      request: redactValue({
        method: operation.method,
        url: target.toString(),
        headers,
        body: requestPlan.body ?? null,
      }, secrets),
      response: redactValue({ status: status ?? null, body: body ?? null, error }, secrets),
      expect: step.expect,
      startedAt: stepStarted,
      finishedAt: new Date().toISOString(),
      assertion: null,
    };

    if (error) {
      record.assertion = { ok: false, message: error };
      stepRecords.push(record);
      return {
        id: scenario.id,
        name: scenario.name,
        result: "failed",
        reasons: [`step ${step.id}: ${error}`],
        steps: stepRecords,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }
    if (status !== step.expect.status) {
      record.assertion = {
        ok: false,
        message: `status expected ${step.expect.status} got ${status}`,
      };
      stepRecords.push(record);
      return {
        id: scenario.id,
        name: scenario.name,
        result: "failed",
        reasons: [`step ${step.id}: ${record.assertion.message}`],
        steps: stepRecords,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }
    if (step.expect.body !== undefined) {
      const match = partialMatch(body, step.expect.body);
      record.assertion = match;
      if (!match.ok) {
        stepRecords.push(record);
        return {
          id: scenario.id,
          name: scenario.name,
          result: "failed",
          reasons: [`step ${step.id}: ${match.message}`],
          steps: stepRecords,
          startedAt,
          finishedAt: new Date().toISOString(),
        };
      }
    } else {
      record.assertion = { ok: true, message: "status matched" };
    }

    if (step.capture) captures[step.capture] = body;
    stepRecords.push(record);
  }

  return {
    id: scenario.id,
    name: scenario.name,
    result: "passed",
    reasons: [],
    steps: stepRecords,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

export async function runHttpScenarios({
  repoPath,
  runtime,
  operations,
  scenarios,
  env = process.env,
  port = null,
}) {
  const allocatedPort = port ?? await allocateEphemeralPort();
  const childEnv = buildChildEnv({
    sourceEnv: {
      ...env,
      PATH: env.PATH ?? process.env.PATH,
      HOME: env.HOME ?? process.env.HOME,
    },
    personas: runtime.personas,
  });
  const secrets = collectSecretValues(runtime.personas, childEnv);
  const app = await startAppProcess({
    repoPath,
    runtime,
    port: allocatedPort,
    env: childEnv,
  });
  const results = [];
  try {
    const totalDeadline = Date.now() + RUNTIME_BOUNDS.maxTotalDurationMs;
    for (const scenario of scenarios) {
      if (Date.now() > totalDeadline) {
        results.push({
          id: scenario.id,
          name: scenario.name,
          result: "could_not_run",
          reasons: ["total-duration-exceeded"],
          steps: [],
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        });
        continue;
      }
      results.push(await executeScenario({
        scenario,
        operations,
        personas: runtime.personas,
        baseUrl: app.baseUrl,
        env: childEnv,
        secrets,
      }));
    }
  } finally {
    await app.stop();
  }
  return { port: allocatedPort, baseUrl: app.baseUrl, results };
}
