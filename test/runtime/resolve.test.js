import assert from "node:assert/strict";
import test from "node:test";
import { createSystemModel } from "../../src/system-model/canonicalize.js";
import {
  allocatePersonas,
  operationElementKey,
  resolveRuntimeOperations,
  resolveScenarioPrincipals,
} from "../../src/runtime/resolve.js";

const SUBMIT = "POST /api/purchase-requests";
const WITHDRAW = "POST /api/purchase-requests/{request_id}/withdraw";
const GET = "GET /api/purchase-requests/{request_id}";
const AUDIT = "GET /api/purchase-requests/{request_id}/audit";
const DELETE = "DELETE /api/purchase-requests/{request_id}";

function model(keys = [SUBMIT, WITHDRAW, GET, AUDIT]) {
  return createSystemModel({
    systemName: "purchase-approvals",
    subsystems: [{ key: "api", lens: "api", name: "API" }],
    elements: keys.map((key, index) => ({
      subsystemKey: "api",
      key,
      kind: "operation",
      roles: ["interface", "behavior"],
      name: key,
      evidence: [{ file: "app/main.py", line: 10 + index, symbol: `handler_${index}` }],
      claimState: "observed",
      capability: "api.operation",
    })),
  });
}

function seed() {
  return {
    formatVersion: 3,
    system: { id: "purchase", name: "Purchase" },
    concepts: [
      { id: "behavior.submit-request", role: "behavior", name: "Submit" },
      { id: "behavior.withdraw-request", role: "behavior", name: "Withdraw" },
      { id: "behavior.get-request", role: "behavior", name: "Get" },
      { id: "behavior.list-audit-entries", role: "behavior", name: "Audit" },
      { id: "actor.employee", role: "actor", name: "Employee" },
    ],
    commitments: [],
    surfaces: [
      { id: "surface.submit-request-api", name: "Submit API", behavior: "behavior.submit-request", channel: "api", access: "authenticated" },
      { id: "surface.withdraw-request-api", name: "Withdraw API", behavior: "behavior.withdraw-request", channel: "api", access: "authenticated" },
      { id: "surface.get-request-api", name: "Get API", behavior: "behavior.get-request", channel: "api", access: "authenticated" },
      { id: "surface.audit-entries-api", name: "Audit API", behavior: "behavior.list-audit-entries", channel: "api", access: "authenticated" },
    ],
    scenarios: [],
    context: [],
  };
}

function realization(surfaceBindings) {
  return {
    formatVersion: 2,
    seedHash: "sha256:" + "a".repeat(64),
    bindings: [],
    surfaceBindings,
    witnesses: [],
  };
}

function runtime(operations) {
  return {
    formatVersion: 1,
    seedHash: "sha256:" + "a".repeat(64),
    baseUrl: "http://127.0.0.1:PORT",
    healthPath: "/health",
    start: { executable: "uv", args: ["run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "PORT"] },
    operations,
    personas: [
      { id: "employee-1", actor: "actor.employee", credentialEnv: "VARAI_POC_EMPLOYEE_1_TOKEN", headers: { Authorization: "Bearer ${env:VARAI_POC_EMPLOYEE_1_TOKEN}" } },
      { id: "employee-2", actor: "actor.employee", credentialEnv: "VARAI_POC_EMPLOYEE_2_TOKEN", headers: { Authorization: "Bearer ${env:VARAI_POC_EMPLOYEE_2_TOKEN}" } },
    ],
  };
}

const bindings = [
  { id: "surface-binding.submit", surface: "surface.submit-request-api", artifact: { lens: "api", kind: "operation", key: SUBMIT } },
  { id: "surface-binding.withdraw", surface: "surface.withdraw-request-api", artifact: { lens: "api", kind: "operation", key: WITHDRAW } },
  { id: "surface-binding.get", surface: "surface.get-request-api", artifact: { lens: "api", kind: "operation", key: GET } },
  { id: "surface-binding.audit", surface: "surface.audit-entries-api", artifact: { lens: "api", kind: "operation", key: AUDIT } },
];

test("operationElementKey normalizes method and path placeholders", () => {
  assert.equal(
    operationElementKey("POST", "/api/purchase-requests/{requestId}/withdraw"),
    "POST /api/purchase-requests/{request_id}/withdraw",
  );
  assert.equal(operationElementKey("get", "/health"), "GET /health");
});

test("resolveRuntimeOperations accepts operations that match surface bindings and elements", () => {
  const result = resolveRuntimeOperations({
    model: model(),
    seed: seed(),
    realization: realization(bindings),
    runtime: runtime([
      { behavior: "behavior.submit-request", method: "POST", path: "/api/purchase-requests" },
      { behavior: "behavior.withdraw-request", method: "POST", path: "/api/purchase-requests/{requestId}/withdraw" },
      { behavior: "behavior.get-request", method: "GET", path: "/api/purchase-requests/{requestId}" },
      { behavior: "behavior.list-audit-entries", method: "GET", path: "/api/purchase-requests/{requestId}/audit" },
    ]),
    seedHash: "sha256:" + "a".repeat(64),
  });
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  assert.equal(result.operations.get("behavior.withdraw-request").elementKey, WITHDRAW);
});

test("mapping a behavior to a different route fails resolution", () => {
  const result = resolveRuntimeOperations({
    model: model([SUBMIT, WITHDRAW, GET, AUDIT, DELETE]),
    seed: seed(),
    realization: realization(bindings),
    runtime: runtime([
      { behavior: "behavior.withdraw-request", method: "DELETE", path: "/api/purchase-requests/{requestId}" },
    ]),
    seedHash: "sha256:" + "a".repeat(64),
  });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => /surface|resolve|mismatch|unresolved/i.test(p.message) || p.code === "operation-unresolved"));
});

test("allocatePersonas gives distinct personas for two principals of the same actor", () => {
  const allocated = allocatePersonas({
    principals: [
      { as: "owner", actor: "actor.employee" },
      { as: "other", actor: "actor.employee" },
    ],
    personas: runtime().personas,
  });
  assert.equal(allocated.ok, true);
  assert.notEqual(allocated.byAlias.owner.id, allocated.byAlias.other.id);
  assert.equal(allocated.byAlias.owner.actor, "actor.employee");
  assert.equal(allocated.byAlias.other.actor, "actor.employee");
});

test("resolveScenarioPrincipals fails when not enough personas exist", () => {
  const allocated = resolveScenarioPrincipals({
    principals: [
      { as: "owner", actor: "actor.employee" },
      { as: "other", actor: "actor.employee" },
    ],
    personas: [runtime().personas[0]],
  });
  assert.equal(allocated.ok, false);
});
