import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { readRealization } from "../../src/reconciliation/witness-store.js";
import { readSeed } from "../../src/seed/store.js";
import { deriveRuntimeMap, parseOperationKey, pickRuntimeProfile } from "../../src/runtime/derive.js";

const fixture = path.resolve("test/fixtures/purchase-approval-runtime");
const modelPromise = scanRepo(fixture, { jobs: 1, cache: false }).then((scan) => scan.model);
const { seed } = readSeed(fixture);
const { realization } = readRealization(fixture, { seed });

test("parseOperationKey splits canonical operation element keys", () => {
  assert.deepEqual(parseOperationKey("POST /api/purchase-requests"), { method: "POST", path: "/api/purchase-requests" });
  assert.deepEqual(parseOperationKey("GET /api/requests/{request_id}"), { method: "GET", path: "/api/requests/{request_id}" });
  assert.equal(parseOperationKey("not-an-operation"), null);
});

test("derive regenerates operations from approved surface bindings", async () => {
  const model = await modelPromise;
  const derived = deriveRuntimeMap({ model, seed, realization });
  assert.equal(derived.ok, false, "no profile baseline -> not derivable");
  assert.ok(derived.unresolved.includes("baseUrl"));
  assert.ok(derived.unresolved.includes("healthPath"));
  assert.ok(derived.unresolved.includes("start"));
  assert.ok(derived.unresolved.includes("personas"));
  assert.equal(derived.runtime, null);
});

test("derive preserves stable profile fields from the current runtime map", async () => {
  const model = await modelPromise;
  const current = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(path.join(fixture, "varai.runtime.json"), "utf8")));
  const derived = deriveRuntimeMap({ model, seed, realization, currentRuntime: current });
  assert.equal(derived.ok, true);
  assert.equal(derived.profileSource, "current-runtime-map");
  assert.equal(derived.runtime.baseUrl, current.baseUrl);
  assert.equal(derived.runtime.healthPath, current.healthPath);
  assert.deepEqual(derived.runtime.start, current.start);
  assert.deepEqual(derived.runtime.personas, current.personas);
  const behaviors = derived.runtime.operations.map((operation) => operation.behavior);
  assert.ok(behaviors.includes("behavior.submit-request"));
  assert.ok(behaviors.includes("behavior.withdraw-request"));
  const submit = derived.runtime.operations.find((operation) => operation.behavior === "behavior.submit-request");
  assert.equal(submit.method, "POST");
  assert.ok(submit.path.startsWith("/api/purchase-requests"));
  for (const operation of derived.runtime.operations) {
    assert.ok(operation.path.startsWith("/"), operation.behavior);
    assert.ok(["GET", "POST", "PUT", "PATCH", "DELETE"].includes(operation.method));
  }
});

test("derive falls back to the latest verification run's runtime map", async () => {
  const model = await modelPromise;
  const baseline = {
    formatVersion: 1,
    seedHash: seed.ratification.contentHash,
    baseUrl: "http://127.0.0.1:PORT",
    healthPath: "/health",
    start: { executable: "uv", args: ["run", "uvicorn", "app.main:app"] },
    operations: [],
    personas: [{ id: "employee-1", actor: "actor.employee", credentialEnv: "VARAI_EMP_TOKEN", headers: {} }],
  };
  const derived = deriveRuntimeMap({ model, seed, realization, baselineRuntime: baseline });
  assert.equal(derived.ok, true);
  assert.equal(derived.profileSource, "verification-run");
  assert.equal(derived.runtime.personas[0].id, "employee-1");
  assert.ok(derived.runtime.operations.length >= 1);
});

test("derive never invents missing profile fields", async () => {
  const model = await modelPromise;
  const partial = {
    formatVersion: 1,
    seedHash: seed.ratification.contentHash,
    baseUrl: "http://127.0.0.1:PORT",
    healthPath: "/health",
    start: { executable: "uv", args: ["run"] },
    operations: [],
    personas: [],
  };
  const derived = deriveRuntimeMap({ model, seed, realization, currentRuntime: partial });
  assert.equal(derived.ok, false);
  assert.ok(derived.unresolved.includes("personas"), "empty personas are unresolved, never invented");
  assert.equal(derived.runtime, null);
});

test("pickRuntimeProfile prefers the current map and reports exact gaps", () => {
  const full = { baseUrl: "http://127.0.0.1:PORT", healthPath: "/health", start: { executable: "uv", args: ["run"] }, personas: [{ id: "p1", actor: "actor.a" }] };
  assert.equal(pickRuntimeProfile(full, null).source, "current-runtime-map");
  assert.equal(pickRuntimeProfile(null, full).source, "verification-run");
  const gap = pickRuntimeProfile({ baseUrl: "http://127.0.0.1:PORT" }, null);
  assert.deepEqual(gap.missing, ["healthPath", "start", "personas"]);
  assert.equal(gap.profile, null);
});
