// Shared structural accept/reject fixtures for `varai handoff --schema`
// parity. The same documents feed the authoritative JS validators and the
// compact structural checker; parity holds when both accept or both reject.
// Fixtures avoid Seed-aware reference errors so the comparison isolates shape.

const VALID_REALIZATION = {
  formatVersion: 2,
  seedHash: "sha256:" + "0".repeat(64),
  builder: { tool: "test-builder", version: "1.0" },
  bindings: [
    { id: "binding.submit", concept: "behavior.submit-request", artifact: { lens: "api", kind: "operation", key: "POST /requests" } },
    { id: "binding.fallback", concept: "resource.request", artifact: { source: { file: "app/models.py", symbol: "Request" } } },
  ],
  surfaceBindings: [
    { id: "surface-binding.submit", surface: "surface.submit-api", artifact: { lens: "api", kind: "operation", key: "POST /requests" } },
  ],
  witnesses: [
    { commitment: "commitment.submit-creates", sourceBinding: "binding.submit", target: { concept: "resource.request" } },
    { commitment: "commitment.submit-fails", sourceBinding: "binding.submit", target: { literal: "invalid amount" } },
  ],
};

const VALID_RUNTIME = {
  formatVersion: 1,
  seedHash: "sha256:" + "0".repeat(64),
  baseUrl: "http://127.0.0.1:PORT",
  healthPath: "/health",
  start: { executable: "uv", args: ["run", "uvicorn", "app.main:app"] },
  operations: [
    { behavior: "behavior.submit-request", method: "POST", path: "/api/requests" },
  ],
  personas: [
    { id: "employee-1", actor: "actor.employee", credentialEnv: "VARAI_EMPLOYEE_TOKEN", headers: { Authorization: "${env:VARAI_EMPLOYEE_TOKEN}" } },
  ],
};

function mutate(doc, patch) {
  return { ...doc, ...patch };
}

export const REALIZATION_FIXTURES = [
  { name: "valid v2 witness", doc: VALID_REALIZATION, expectValid: true },
  { name: "missing formatVersion", doc: mutate(VALID_REALIZATION, { formatVersion: undefined }), expectValid: false },
  { name: "missing seedHash", doc: mutate(VALID_REALIZATION, { seedHash: undefined }), expectValid: false },
  { name: "bad seedHash shape", doc: mutate(VALID_REALIZATION, { seedHash: "sha256:xyz" }), expectValid: false },
  { name: "unknown top-level field", doc: mutate(VALID_REALIZATION, { verdicts: [] }), expectValid: false },
  { name: "binding missing artifact", doc: mutate(VALID_REALIZATION, { bindings: [{ id: "binding.x", concept: "behavior.y" }] }), expectValid: false },
  { name: "artifact key without kind", doc: mutate(VALID_REALIZATION, { bindings: [{ id: "binding.x", concept: "behavior.y", artifact: { lens: "api", key: "POST /x" } }] }), expectValid: false },
  { name: "line-only identity", doc: mutate(VALID_REALIZATION, { bindings: [{ id: "binding.x", concept: "behavior.y", artifact: { source: { file: "a.py", line: 3 } } }] }), expectValid: false },
  { name: "bad binding id pattern", doc: mutate(VALID_REALIZATION, { bindings: [{ id: "binding.has spaces", concept: "behavior.y", artifact: { kind: "operation", key: "GET /x" } }] }), expectValid: false },
  { name: "witness without sourceBinding", doc: mutate(VALID_REALIZATION, { witnesses: [{ commitment: "commitment.x" }] }), expectValid: false },
  { name: "witness with both target shapes", doc: mutate(VALID_REALIZATION, { witnesses: [{ commitment: "commitment.x", sourceBinding: "binding.submit", target: { concept: "resource.request", literal: 1 } }] }), expectValid: false },
];

export const RUNTIME_FIXTURES = [
  { name: "valid runtime map", doc: VALID_RUNTIME, expectValid: true },
  { name: "missing formatVersion", doc: mutate(VALID_RUNTIME, { formatVersion: undefined }), expectValid: false },
  { name: "bad method", doc: mutate(VALID_RUNTIME, { operations: [{ behavior: "behavior.x", method: "FETCH", path: "/x" }] }), expectValid: false },
  { name: "path without leading slash", doc: mutate(VALID_RUNTIME, { operations: [{ behavior: "behavior.x", method: "GET", path: "x" }] }), expectValid: false },
  { name: "persona missing actor", doc: mutate(VALID_RUNTIME, { personas: [{ id: "p1" }] }), expectValid: false },
  { name: "unknown runtime field", doc: mutate(VALID_RUNTIME, { secrets: [] }), expectValid: false },
  { name: "non-loopback baseUrl", doc: mutate(VALID_RUNTIME, { baseUrl: "http://example.com:PORT" }), expectValid: true }, // shape-valid; loopback is a JS-validator security rule
];

export const PARITY_FIXTURES = [
  ...REALIZATION_FIXTURES.map((fixture) => ({ ...fixture, kind: "realization" })),
  ...RUNTIME_FIXTURES.map((fixture) => ({ ...fixture, kind: "runtime" })),
];
