import {
  ENV_HEADER_REF_PATTERN,
  ENV_HEADER_TOKEN_PATTERN,
  HTTP_METHOD_PATTERN,
  LOOPBACK_HOSTS,
  PERSONA_ID_PATTERN,
  PORT_PLACEHOLDER,
  RUNTIME_FIELDS,
  RUNTIME_FORMAT_VERSION,
  RUNTIME_OPERATION_FIELDS,
  RUNTIME_PERSONA_FIELDS,
  RUNTIME_START_FIELDS,
  RuntimeValidationError,
  SEED_HASH_PATTERN,
} from "./schema.js";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownFields(value, allowed, label, problems) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) problems.push({ code: "unknown-field", message: `${label} has unknown field ${key}` });
  }
}

const DISALLOWED_EXECUTABLES = new Set(["bash", "sh", "zsh", "fish", "cmd", "powershell", "pwsh"]);

export function isSafeAbsolutePath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

export function isLoopbackHostname(hostname) {
  return LOOPBACK_HOSTS.includes(String(hostname ?? "").toLowerCase());
}

function validateLoopbackBaseUrl(baseUrl, problems) {
  if (typeof baseUrl !== "string" || !/^https?:\/\//.test(baseUrl)) {
    problems.push({ code: "invalid-runtime", message: "Runtime map baseUrl must be an http(s) URL" });
    return;
  }
  let parsed;
  try {
    // Substitute PORT with a numeric placeholder so URL parsing succeeds for templates.
    parsed = new URL(baseUrl.split(PORT_PLACEHOLDER).join("9"));
  } catch {
    problems.push({ code: "invalid-runtime", message: "Runtime map baseUrl must be a parseable URL" });
    return;
  }
  if (!isLoopbackHostname(parsed.hostname)) {
    problems.push({
      code: "non-loopback-base-url",
      message: `Runtime map baseUrl host must be 127.0.0.1 or localhost, got ${parsed.hostname}`,
    });
  }
}

function validateHeaderTemplates(headers, label, credentialEnv, problems) {
  if (headers === undefined) return;
  if (!isPlainObject(headers)) {
    problems.push({ code: "invalid-persona", message: `${label} headers must be an object` });
    return;
  }
  for (const [name, template] of Object.entries(headers)) {
    if (typeof name !== "string" || !name) {
      problems.push({ code: "invalid-persona", message: `${label} header names must be non-empty strings` });
      continue;
    }
    if (typeof template !== "string") {
      problems.push({ code: "invalid-persona", message: `${label} header ${name} must be a string template` });
      continue;
    }
    const refs = [...template.matchAll(ENV_HEADER_TOKEN_PATTERN)].map((match) => match[1]);
    if (refs.length === 0) {
      if (/bearer\s+\S+/i.test(template) || /token[=:\s]\S+/i.test(template)) {
        problems.push({
          code: "secret-in-map",
          message: `${label} header ${name} must reference credentials via \${env:NAME}, never embed secret values`,
        });
      }
      continue;
    }
    for (const envName of refs) {
      if (credentialEnv && envName !== credentialEnv) {
        problems.push({
          code: "invalid-persona",
          message: `${label} header ${name} references ${envName} but credentialEnv is ${credentialEnv}`,
        });
      }
      if (!ENV_HEADER_REF_PATTERN.test(`\${env:${envName}}`)) {
        problems.push({ code: "invalid-persona", message: `${label} has malformed env reference ${envName}` });
      }
    }
  }
}

export function checkRuntimeMap(runtime, { expectedSeedHash } = {}) {
  const problems = [];
  if (!isPlainObject(runtime)) {
    return { valid: false, problems: [{ code: "invalid-root", message: "Runtime map must be an object" }] };
  }
  unknownFields(runtime, RUNTIME_FIELDS, "Runtime map", problems);
  if (runtime.formatVersion !== RUNTIME_FORMAT_VERSION) {
    problems.push({
      code: "unsupported-format-version",
      message: `Unsupported runtime format version: ${runtime.formatVersion}`,
    });
  }
  if (typeof runtime.seedHash !== "string" || !SEED_HASH_PATTERN.test(runtime.seedHash)) {
    problems.push({ code: "invalid-seed-hash", message: "Runtime map requires a seedHash of the form sha256:<64 hex>" });
  } else if (expectedSeedHash && runtime.seedHash !== expectedSeedHash) {
    problems.push({
      code: "seed-hash-mismatch",
      message: `Runtime map seedHash ${runtime.seedHash} does not match approved Seed ${expectedSeedHash}`,
    });
  }
  validateLoopbackBaseUrl(runtime.baseUrl, problems);
  if (!isSafeAbsolutePath(runtime.healthPath)) {
    problems.push({
      code: "invalid-path",
      message: "Runtime map healthPath must be a single absolute path starting with / (not //)",
    });
  }

  if (!isPlainObject(runtime.start)) {
    problems.push({ code: "invalid-start", message: "Runtime map start must be an object" });
  } else {
    unknownFields(runtime.start, RUNTIME_START_FIELDS, "Runtime start", problems);
    if (typeof runtime.start.executable !== "string" || !runtime.start.executable) {
      problems.push({ code: "invalid-start", message: "Runtime start requires a non-empty executable" });
    } else {
      const base = runtime.start.executable.split(/[/\\]/).pop()?.toLowerCase();
      if (DISALLOWED_EXECUTABLES.has(base)) {
        problems.push({ code: "invalid-start", message: `Runtime start executable must not be a shell (${base})` });
      }
    }
    if (!Array.isArray(runtime.start.args) || runtime.start.args.length === 0) {
      problems.push({ code: "invalid-start", message: "Runtime start requires a non-empty args array" });
    } else if (runtime.start.args.some((arg) => typeof arg !== "string")) {
      problems.push({ code: "invalid-start", message: "Runtime start args must be strings" });
    } else if (runtime.start.args.some((arg) => arg === "-c" || arg === "/c" || arg === "-Command")) {
      problems.push({ code: "invalid-start", message: "Runtime start args must not invoke a shell command string" });
    }
  }

  if (!Array.isArray(runtime.operations) || runtime.operations.length === 0) {
    problems.push({ code: "invalid-collection", message: "Runtime map operations must be a non-empty array" });
  } else {
    const seenBehaviors = new Set();
    for (const operation of runtime.operations) {
      if (!isPlainObject(operation)) {
        problems.push({ code: "invalid-entry", message: "Runtime operations must be objects" });
        continue;
      }
      unknownFields(operation, RUNTIME_OPERATION_FIELDS, `Runtime operation ${operation.behavior}`, problems);
      if (typeof operation.behavior !== "string" || !operation.behavior.startsWith("behavior.")) {
        problems.push({ code: "invalid-operation", message: `Runtime operation behavior ${JSON.stringify(operation.behavior)} is invalid` });
      } else if (seenBehaviors.has(operation.behavior)) {
        problems.push({ code: "duplicate-id", message: `Duplicate runtime operation for ${operation.behavior}` });
      } else {
        seenBehaviors.add(operation.behavior);
      }
      if (typeof operation.method !== "string" || !HTTP_METHOD_PATTERN.test(operation.method)) {
        problems.push({ code: "invalid-operation", message: `Runtime operation ${operation.behavior} method must be an HTTP verb` });
      }
      if (!isSafeAbsolutePath(operation.path)) {
        problems.push({
          code: "invalid-path",
          message: `Runtime operation ${operation.behavior} path must be a single absolute path starting with / (not //)`,
        });
      }
    }
  }

  if (!Array.isArray(runtime.personas) || runtime.personas.length === 0) {
    problems.push({ code: "invalid-collection", message: "Runtime map personas must be a non-empty array" });
  } else {
    const seenIds = new Set();
    for (const persona of runtime.personas) {
      if (!isPlainObject(persona)) {
        problems.push({ code: "invalid-entry", message: "Runtime personas must be objects" });
        continue;
      }
      unknownFields(persona, RUNTIME_PERSONA_FIELDS, `Runtime persona ${persona.id}`, problems);
      if (typeof persona.id !== "string" || !PERSONA_ID_PATTERN.test(persona.id)) {
        problems.push({ code: "invalid-persona", message: `Runtime persona id ${JSON.stringify(persona.id)} must be a lower-kebab slug` });
      } else if (seenIds.has(persona.id)) {
        problems.push({ code: "duplicate-id", message: `Duplicate runtime persona id: ${persona.id}` });
      } else {
        seenIds.add(persona.id);
      }
      if (typeof persona.actor !== "string" || !persona.actor.startsWith("actor.")) {
        problems.push({ code: "invalid-persona", message: `Runtime persona ${persona.id} actor must reference an actor concept` });
      }
      if (typeof persona.credentialEnv !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(persona.credentialEnv)) {
        problems.push({ code: "invalid-persona", message: `Runtime persona ${persona.id} credentialEnv must be an env var name` });
      }
      validateHeaderTemplates(persona.headers, `Runtime persona ${persona.id}`, persona.credentialEnv, problems);
    }
  }

  return { valid: problems.length === 0, problems };
}

export function validateRuntimeMap(runtime, options = {}) {
  const result = checkRuntimeMap(runtime, options);
  if (!result.valid) throw new RuntimeValidationError(result.problems);
  return result;
}
