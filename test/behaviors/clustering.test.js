import assert from "node:assert/strict";
import test from "node:test";
import { clusterBundles } from "../../src/scanners/behaviors/clustering.js";

function bhv(path, file, gates, trunk) {
  return { door: { method: "GET", path, evidence: { file, line: 1 } },
    requires: gates.map((g) => ({ name: g, kind: "dependency" })), trunkCall: trunk,
    reads: [], writes: [], gives: [], takes: [], fails: [], untraced: [], helperCalls: [], bundle: null };
}

test("rule 1 groups by shared gate set + trunk; login stays separate", () => {
  const behaviors = [
    bhv("/api/v1/building-model/{job_id}/quantities", "routes/building_model/r.py", ["get_job_context"], "_ensure_doc"),
    bhv("/api/v1/building-model/{job_id}/render", "routes/building_model/r.py", ["get_job_context"], "_ensure_doc"),
    bhv("/api/v1/building-model/{job_id}/elevation", "routes/building_model/r.py", ["get_job_context"], "_ensure_doc"),
    bhv("/api/auth/login", "routes/auth.py", ["get_db"], "verify_password"),
  ];
  const bundles = clusterBundles(behaviors);
  const bm = bundles.find((b) => b.behaviors.length === 3);
  assert.ok(bm, "three building-model behaviors clustered");
  assert.ok(bm.name.includes("building"));
  assert.ok(!bm.behaviors.some((b) => b.door.path === "/api/auth/login"));
});

test("rule 2 groups leftovers by URL prefix", () => {
  const behaviors = [
    bhv("/api/auth/login", "a.py", ["get_db"], null),
    bhv("/api/auth/signup", "a.py", ["get_db2"], null),
  ];
  const bundles = clusterBundles(behaviors);
  const auth = bundles.find((b) => b.name === "auth");
  assert.equal(auth.behaviors.length, 2);
});
