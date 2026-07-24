import assert from "node:assert/strict";
import test from "node:test";
import { createSystemModel, canonicalStringifySystemModel } from "../../src/system-model/canonicalize.js";
import { validateSystemModel } from "../../src/system-model/validate.js";
import { diffSystemModels } from "../../src/system-model/diff.js";
import { renderSemanticDiff } from "../../src/reporters/diff-markdown.js";

// Two Elements in one subsystem; the second element optionally depends on the first.
function model({ dependency = false } = {}) {
  const subsystem = { key: "api", lens: "api", name: "API" };
  const consumer = {
    subsystemKey: "api", key: "consumer.py", kind: "operation",
    name: "consumer", roles: ["behavior"], evidence: [{ file: "consumer.py", line: 1 }],
    claimState: "observed", capability: "arch.dependency",
  };
  const provider = {
    subsystemKey: "api", key: "provider.py", kind: "operation",
    name: "provider", roles: ["behavior"], evidence: [{ file: "provider.py", line: 1 }],
    claimState: "observed", capability: "arch.dependency",
  };
  return createSystemModel({
    systemName: "fixture",
    subsystems: [subsystem],
    elements: [consumer, provider],
    claims: dependency ? [{
      source: { kind: "element", subsystemKey: "api", elementKind: "operation", key: "consumer.py" },
      relation: "depends_on",
      target: { kind: "reference", reference: { kind: "element", subsystemKey: "api", elementKind: "operation", key: "provider.py" } },
      slot: "depends_on:provider.py",
      claimState: "observed", observationMethod: "ast",
      evidence: [{ file: "consumer.py", line: 3, symbol: "provider" }],
      capability: "arch.dependency",
    }] : [],
  });
}

test("depends_on claim validates and canonicalizes", () => {
  const built = model({ dependency: true });
  assert.doesNotThrow(() => validateSystemModel(built));
  const claim = built.claims.find((c) => c.relation === "depends_on");
  assert.ok(claim, "a depends_on claim is present");
  assert.equal(claim.target.kind, "reference");
  assert.ok(built.elements.some((e) => e.id === claim.target.id), "target resolves to an Element id");
  assert.ok(claim.evidence.length >= 1, "claim carries evidence");
});

test("depends_on canonicalization is order-independent (byte-identical)", () => {
  const a = model({ dependency: true });
  // Re-create with elements/claims order reversed; canonical output must match.
  const subsystem = { key: "api", lens: "api", name: "API" };
  const consumer = { subsystemKey: "api", key: "consumer.py", kind: "operation", name: "consumer", roles: ["behavior"], evidence: [{ file: "consumer.py", line: 1 }], claimState: "observed", capability: "arch.dependency" };
  const provider = { subsystemKey: "api", key: "provider.py", kind: "operation", name: "provider", roles: ["behavior"], evidence: [{ file: "provider.py", line: 1 }], claimState: "observed", capability: "arch.dependency" };
  const b = createSystemModel({
    systemName: "fixture",
    subsystems: [subsystem],
    elements: [provider, consumer],
    claims: [{
      source: { kind: "element", subsystemKey: "api", elementKind: "operation", key: "consumer.py" },
      relation: "depends_on",
      target: { kind: "reference", reference: { kind: "element", subsystemKey: "api", elementKind: "operation", key: "provider.py" } },
      slot: "depends_on:provider.py", claimState: "observed", observationMethod: "ast",
      evidence: [{ file: "consumer.py", line: 3, symbol: "provider" }], capability: "arch.dependency",
    }],
  });
  assert.equal(canonicalStringifySystemModel(a), canonicalStringifySystemModel(b));
});

test("depends_on drift surfaces through the generic claims diff (no diff.js change)", () => {
  const diff = diffSystemModels(model(), model({ dependency: true }));
  assert.equal(diff.summary.claimsAdded, 1);
  assert.equal(diff.claims.added.length, 1);
  assert.equal(diff.claims.added[0].relation, "depends_on");
  assert.equal(diff.summary.hasChanges, true);

  const reverse = diffSystemModels(model({ dependency: true }), model());
  assert.equal(reverse.summary.claimsRemoved, 1);
  assert.equal(reverse.claims.removed[0].relation, "depends_on");
});

test("rendered depends_on diff uses the plain 'depends on' verb", () => {
  const diff = diffSystemModels(model(), model({ dependency: true }));
  const markdown = renderSemanticDiff(diff);
  assert.match(markdown, /depends on/);
  assert.doesNotMatch(markdown, /depends_on/);
});
