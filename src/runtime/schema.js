// Runtime map vocabulary (ADR 0007). varai.runtime.json is an untrusted
// builder pointer: where to invoke ratified behaviors and which configured
// personas to act as. It never establishes correctness, never enters the
// System Model, and never persists secret values — only env var *names*.

export const RUNTIME_FORMAT_VERSION = 1;
export const RUNTIME_FILE = "varai.runtime.json";
export const VERIFICATION_DIR = ".varai/verification-v1";

export const SCENARIO_RESULTS = Object.freeze(["passed", "failed", "could_not_run"]);

export const RUNTIME_FIELDS = Object.freeze([
  "formatVersion", "seedHash", "baseUrl", "healthPath", "start", "operations", "personas",
]);
export const RUNTIME_START_FIELDS = Object.freeze(["executable", "args"]);
export const RUNTIME_OPERATION_FIELDS = Object.freeze(["behavior", "method", "path"]);
export const RUNTIME_PERSONA_FIELDS = Object.freeze(["id", "actor", "credentialEnv", "headers"]);

export const SEED_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const PERSONA_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const HTTP_METHOD_PATTERN = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/;
export const ENV_HEADER_REF_PATTERN = /^\$\{env:([A-Z][A-Z0-9_]*)\}$/;
export const ENV_HEADER_TOKEN_PATTERN = /\$\{env:([A-Z][A-Z0-9_]*)\}/g;
export const PORT_PLACEHOLDER = "PORT";

// Bounds applied by the HTTP runner (not authorable in the runtime map).
export const RUNTIME_BOUNDS = Object.freeze({
  maxBodyBytes: 64 * 1024,
  requestTimeoutMs: 5_000,
  healthTimeoutMs: 15_000,
  healthPollMs: 100,
  maxRedirects: 0,
  maxScenarioDurationMs: 60_000,
  maxTotalDurationMs: 120_000,
});

export class RuntimeValidationError extends Error {
  constructor(problems) {
    super(`Invalid runtime map: ${problems.map((problem) => problem.message).join("; ")}`);
    this.name = "RuntimeValidationError";
    this.problems = problems;
  }
}
