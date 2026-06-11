import assert from "node:assert/strict";
import test from "node:test";
import { _deriveCeremony } from "../../src/scanners/behaviors/constructs.js";

test("ceremony recovered from >=3 mutating members; deviant reported", () => {
  const mut = (helpers) => ({ writes: [{ medium: "file" }], helperCalls: helpers, door: { path: "/x" } });
  const bundle = {
    behaviors: [
      mut(["_assert_revision", "_persist_document_with_history", "push_undo_snapshot"]),
      mut(["_assert_revision", "_persist_document_with_history", "push_undo_snapshot"]),
      mut(["_assert_revision", "_persist_document_with_history", "push_undo_snapshot"]),
      mut(["_persist_document"]),
      { writes: [], helperCalls: [], door: { path: "/read" } },
    ],
  };
  _deriveCeremony(bundle);
  assert.deepEqual(bundle.ceremony.steps, ["check revision", "persist", "save undo"]);
  assert.equal(bundle.ceremony.followed, 3);
  assert.equal(bundle.ceremony.total, 4);
});

test("ceremony not derived when only 1 step is shared", async () => {
  const mk = (writes, helpers) => ({
    door: { method: "POST", path: "/api/v1/things/x", evidence: { file: "r.py", line: 1 } },
    trunkCall: null, requires: [], reads: [], writes, gives: [], takes: [], fails: [], untraced: [],
    helperCalls: helpers, bundle: "things"
  });
  const bundle = {
    name: "things",
    behaviors: [
      mk([{ medium: "file" }], ["persist_document"]),
      mk([{ medium: "file" }], ["persist_document"]),
      mk([{ medium: "file" }], ["persist_document"]),
    ],
  };
  _deriveCeremony(bundle);
  assert.equal(bundle.ceremony, undefined, "single-step shared helper is not a ceremony");
});
