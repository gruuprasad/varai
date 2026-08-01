import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeSeed } from "../../src/seed/canonicalize.js";
import { checkSeed } from "../../src/seed/validate.js";
import { seedContentHash } from "../../src/seed/identity.js";
import { migrateSeedToCurrent } from "../../src/seed/migrate.js";

function v4Base() {
  return {
    formatVersion: 4,
    system: { id: "demo", name: "Demo" },
    concepts: [
      { id: "behavior.approve-request", role: "behavior", name: "Approve" },
      { id: "behavior.withdraw-request", role: "behavior", name: "Withdraw" },
      { id: "behavior.submit-request", role: "behavior", name: "Submit" },
      {
        id: "resource.purchase-request",
        role: "resource",
        name: "Purchase request",
        stateModel: {
          initial: "pending",
          states: ["pending", "approved", "withdrawn"],
          transitions: [
            { from: "pending", to: "approved", via: ["behavior.approve-request"] },
            { from: "pending", to: "withdrawn", via: ["behavior.withdraw-request"] },
          ],
        },
        fields: [
          { name: "amount", type: "number", required: true },
          { name: "description", type: "string", required: true },
        ],
      },
    ],
    commitments: [],
    surfaces: [
      { id: "surface.approve-api", name: "Approve API", behavior: "behavior.approve-request", channel: "api", access: "authenticated" },
    ],
    scenarios: [],
    flows: [
      { id: "flow.request-lifecycle", name: "Request lifecycle", entry: "surface.approve-api", members: ["behavior.submit-request", "behavior.approve-request", "behavior.withdraw-request"] },
    ],
    context: [],
  };
}

const problemsOf = (seed) => checkSeed(seed).problems.map((problem) => problem.code);

test("a full v4 seed with state model, fields, and flows validates", () => {
  const result = checkSeed(v4Base());
  assert.equal(result.valid, true, result.problems.map((problem) => problem.message).join("; "));
});

test("state models are resource-only and reference declared states and behaviors", () => {
  const onBehavior = v4Base();
  onBehavior.concepts[3] = { ...onBehavior.concepts[3], stateModel: undefined };
  onBehavior.concepts[0] = { ...onBehavior.concepts[0], stateModel: { initial: "x", states: ["x"], transitions: [] } };
  assert.ok(problemsOf(onBehavior).includes("state-model-on-non-resource"));

  const badInitial = v4Base();
  badInitial.concepts[3] = { ...badInitial.concepts[3], stateModel: { ...badInitial.concepts[3].stateModel, initial: "nope" } };
  assert.ok(problemsOf(badInitial).includes("unknown-initial-state"));

  const badVia = v4Base();
  badVia.concepts[3] = {
    ...badVia.concepts[3],
    stateModel: {
      ...badVia.concepts[3].stateModel,
      transitions: [{ from: "pending", to: "approved", via: ["behavior.missing"] }],
    },
  };
  assert.ok(problemsOf(badVia).includes("dangling-concept-reference"));

  const duplicate = v4Base();
  duplicate.concepts[3] = {
    ...duplicate.concepts[3],
    stateModel: {
      ...duplicate.concepts[3].stateModel,
      transitions: [
        { from: "pending", to: "approved", via: ["behavior.approve-request"] },
        { from: "pending", to: "approved", via: ["behavior.approve-request"] },
      ],
    },
  };
  assert.ok(problemsOf(duplicate).includes("duplicate-transition"));
});

test("field contracts validate names, types, and uniqueness", () => {
  const dup = v4Base();
  dup.concepts[3] = { ...dup.concepts[3], fields: [{ name: "amount", type: "number" }, { name: "amount", type: "number" }] };
  assert.ok(problemsOf(dup).includes("duplicate-field"));

  const badName = v4Base();
  badName.concepts[3] = { ...badName.concepts[3], fields: [{ name: "Amount Value", type: "number" }] };
  assert.ok(problemsOf(badName).includes("invalid-field-name"));

  const badRequired = v4Base();
  badRequired.concepts[3] = { ...badRequired.concepts[3], fields: [{ name: "amount", type: "number", required: "yes" }] };
  assert.ok(problemsOf(badRequired).includes("invalid-field-required"));

  const onActor = v4Base();
  onActor.concepts = [...onActor.concepts, { id: "actor.employee", role: "actor", name: "Employee", fields: [{ name: "x", type: "string" }] }];
  assert.ok(problemsOf(onActor).includes("fields-on-non-resource"));
});


test("flows reference declared surfaces and behavior members", () => {
  const badEntry = v4Base();
  badEntry.flows = [{ id: "flow.x", name: "X", entry: "surface.missing", members: [] }];
  assert.ok(problemsOf(badEntry).includes("dangling-surface-reference"));

  const badMember = v4Base();
  badMember.flows = [{ id: "flow.x", name: "X", entry: "surface.approve-api", members: ["resource.purchase-request"] }];
  assert.ok(problemsOf(badMember).includes("dangling-concept-reference"));

  const badId = v4Base();
  badId.flows = [{ id: "not-a-flow", name: "X", entry: "surface.approve-api", members: [] }];
  assert.ok(problemsOf(badId).includes("invalid-id-format"));
});

test("flows require format version 4", () => {
  const v3WithFlows = { ...v4Base(), formatVersion: 3, flows: [] };
  assert.ok(problemsOf(v3WithFlows).includes("unsupported-field-for-format"));
  const forcedV3 = { ...v4Base(), formatVersion: 3, flows: undefined };
  assert.ok(!problemsOf(forcedV3).includes("unsupported-field-for-format"));
});

test("canonicalization sorts states, transitions, and fields so reordering never diffs", () => {
  const seed = v4Base();
  const concept = seed.concepts.find((item) => item.id === "resource.purchase-request");
  const shuffled = {
    ...seed,
    concepts: seed.concepts.map((item) => item.id === concept.id
      ? {
          ...item,
          stateModel: {
            ...item.stateModel,
            states: [...item.stateModel.states].reverse(),
            transitions: [...item.stateModel.transitions].reverse(),
          },
          fields: [...item.fields].reverse(),
        }
      : item),
  };
  assert.equal(seedContentHash(canonicalizeSeed(seed)), seedContentHash(canonicalizeSeed(shuffled)),
    "reordering state lists, transitions, and fields is evidence-only movement");
});

test("changing a declared transition changes the semantic hash", () => {
  const seed = v4Base();
  const changed = {
    ...seed,
    concepts: seed.concepts.map((item) => item.id === "resource.purchase-request"
      ? {
          ...item,
          stateModel: {
            ...item.stateModel,
            transitions: [{ from: "approved", to: "withdrawn", via: ["behavior.withdraw-request"] }],
          },
        }
      : item),
  };
  assert.notEqual(seedContentHash(canonicalizeSeed(seed)), seedContentHash(canonicalizeSeed(changed)));
});
