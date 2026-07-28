import assert from "node:assert/strict";
import test from "node:test";
import {
  RUNTIME_FIELDS,
  RUNTIME_FILE,
  RUNTIME_FORMAT_VERSION,
  RUNTIME_OPERATION_FIELDS,
  RUNTIME_PERSONA_FIELDS,
  RUNTIME_START_FIELDS,
  SEED_HASH_PATTERN,
} from "../../src/runtime/schema.js";
import { checkRuntimeMap, validateRuntimeMap } from "../../src/runtime/validate.js";

function validMap(overrides = {}) {
  return {
    formatVersion: 1,
    seedHash: "sha256:" + "a".repeat(64),
    baseUrl: "http://127.0.0.1:PORT",
    healthPath: "/health",
    start: {
      executable: "uv",
      args: ["run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "PORT"],
    },
    operations: [
      { behavior: "behavior.submit-request", method: "POST", path: "/api/purchase-requests" },
      { behavior: "behavior.withdraw-request", method: "POST", path: "/api/purchase-requests/{requestId}/withdraw" },
    ],
    personas: [
      {
        id: "employee-1",
        actor: "actor.employee",
        credentialEnv: "VARAI_POC_EMPLOYEE_1_TOKEN",
        headers: { Authorization: "Bearer ${env:VARAI_POC_EMPLOYEE_1_TOKEN}" },
      },
      {
        id: "employee-2",
        actor: "actor.employee",
        credentialEnv: "VARAI_POC_EMPLOYEE_2_TOKEN",
        headers: { Authorization: "Bearer ${env:VARAI_POC_EMPLOYEE_2_TOKEN}" },
      },
    ],
    ...overrides,
  };
}

test("runtime vocabulary is closed", () => {
  assert.equal(RUNTIME_FILE, "varai.runtime.json");
  assert.equal(RUNTIME_FORMAT_VERSION, 1);
  assert.deepEqual([...RUNTIME_FIELDS], [
    "formatVersion", "seedHash", "baseUrl", "healthPath", "start", "operations", "personas",
  ]);
  assert.deepEqual([...RUNTIME_START_FIELDS], ["executable", "args"]);
  assert.deepEqual([...RUNTIME_OPERATION_FIELDS], ["behavior", "method", "path"]);
  assert.deepEqual([...RUNTIME_PERSONA_FIELDS], ["id", "actor", "credentialEnv", "headers"]);
  assert.ok(SEED_HASH_PATTERN.test("sha256:" + "b".repeat(64)));
});

test("valid runtime map passes", () => {
  const result = checkRuntimeMap(validMap());
  assert.equal(result.valid, true, result.problems.map((p) => p.message).join("; "));
});

test("rejects mismatched seed hash when expectedSeedHash supplied", () => {
  const result = checkRuntimeMap(validMap(), { expectedSeedHash: "sha256:" + "c".repeat(64) });
  assert.equal(result.valid, false);
  assert.ok(result.problems.some((p) => p.code === "seed-hash-mismatch"));
});

test("rejects unknown fields and missing start executable/args", () => {
  assert.ok(checkRuntimeMap(validMap({ timeoutMs: 1 })).problems.some((p) => p.code === "unknown-field"));
  assert.ok(checkRuntimeMap(validMap({
    start: { executable: "uv" },
  })).problems.some((p) => p.code === "invalid-start"));
});

test("rejects shell-like start and empty operations/personas", () => {
  assert.ok(checkRuntimeMap(validMap({
    start: { executable: "bash", args: ["-c", "echo hi"] },
  })).problems.some((p) => /shell|bash|-c/.test(p.message) || p.code === "invalid-start"));
  assert.ok(checkRuntimeMap(validMap({ operations: [] })).problems.some((p) => p.code === "invalid-collection" || p.code === "invalid-runtime"));
  assert.ok(checkRuntimeMap(validMap({ personas: [] })).problems.some((p) => p.code === "invalid-collection" || p.code === "invalid-runtime"));
});

test("rejects credential values embedded in headers (must use ${env:NAME})", () => {
  const result = checkRuntimeMap(validMap({
    personas: [{
      id: "employee-1",
      actor: "actor.employee",
      credentialEnv: "VARAI_POC_EMPLOYEE_1_TOKEN",
      headers: { Authorization: "Bearer secret-token-value" },
    }],
  }));
  assert.ok(result.problems.some((p) => p.code === "invalid-persona" || p.code === "secret-in-map"));
});

test("validateRuntimeMap throws on invalid map", () => {
  assert.throws(() => validateRuntimeMap({ formatVersion: 99 }), /Invalid runtime/);
});
