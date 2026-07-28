import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  SCENARIO_EXPECT_FIELDS,
  SCENARIO_FIELDS,
  SCENARIO_ID_PATTERN,
  SCENARIO_PRINCIPAL_AS_PATTERN,
  SCENARIO_PRINCIPAL_FIELDS,
  SCENARIO_STEP_FIELDS,
  SCENARIO_STEP_ID_PATTERN,
} from "../../src/seed/schema.js";
import {
  SCENARIO_CAPTURE_REF_PATTERN,
  scenarioId,
} from "../../src/seed/scenarios.js";
import { checkSeed, validateSeed } from "../../src/seed/validate.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const exampleV3Path = path.resolve(here, "../../docs/examples/purchase-approvals.seed.v3.json");

function validScenario(overrides = {}) {
  return {
    id: "scenario.owner-can-withdraw",
    name: "Owner can withdraw",
    principals: [{ as: "owner", actor: "actor.employee" }],
    steps: [{
      id: "submit",
      as: "owner",
      invoke: "behavior.submit-request",
      input: { amount: 500 },
      capture: "request",
      expect: { status: 201, body: { state: "pending" } },
    }],
    ...overrides,
  };
}

function v3Base(overrides = {}) {
  return {
    formatVersion: 3,
    system: { id: "demo", name: "Demo" },
    concepts: [
      { id: "behavior.submit-request", role: "behavior", name: "Submit request" },
      { id: "behavior.withdraw-request", role: "behavior", name: "Withdraw request" },
      { id: "behavior.get-request", role: "behavior", name: "Get request" },
      { id: "actor.employee", role: "actor", name: "Employee" },
      { id: "resource.purchase-request", role: "resource", name: "Purchase request" },
    ],
    commitments: [],
    context: [],
    surfaces: [],
    scenarios: [validScenario()],
    ...overrides,
  };
}

test("scenario vocabulary is closed and patterns match plan shape", () => {
  assert.deepEqual([...SCENARIO_FIELDS], ["id", "name", "principals", "steps"]);
  assert.deepEqual([...SCENARIO_PRINCIPAL_FIELDS], ["as", "actor"]);
  assert.deepEqual([...SCENARIO_STEP_FIELDS], ["id", "as", "invoke", "input", "capture", "expect"]);
  assert.deepEqual([...SCENARIO_EXPECT_FIELDS], ["status", "body"]);
  assert.ok(SCENARIO_ID_PATTERN.test("scenario.owner-can-withdraw"));
  assert.ok(SCENARIO_STEP_ID_PATTERN.test("submit"));
  assert.ok(SCENARIO_PRINCIPAL_AS_PATTERN.test("owner"));
  assert.ok(SCENARIO_CAPTURE_REF_PATTERN.test("$request.id"));
  assert.equal(scenarioId("Owner can withdraw"), "scenario.owner-can-withdraw");
});

test("valid bounded scenario accepts principals, steps, capture refs, and partial body", () => {
  const seed = v3Base({
    scenarios: [validScenario({
      steps: [
        {
          id: "submit",
          as: "owner",
          invoke: "behavior.submit-request",
          input: { amount: 500, description: "Monitor" },
          capture: "request",
          expect: { status: 201, body: { state: "pending" } },
        },
        {
          id: "withdraw",
          as: "owner",
          invoke: "behavior.withdraw-request",
          input: { requestId: "$request.id" },
          expect: { status: 200 },
        },
        {
          id: "read",
          as: "owner",
          invoke: "behavior.get-request",
          input: { requestId: "$request.id" },
          expect: { status: 200, body: { state: "withdrawn" } },
        },
      ],
    })],
  });
  const result = checkSeed(seed);
  assert.equal(result.valid, true, result.problems.map((p) => p.message).join("; "));
});

test("purchase-approvals example scenarios still validate", () => {
  const seed = JSON.parse(fs.readFileSync(exampleV3Path, "utf8"));
  assert.ok(seed.scenarios.length > 0);
  const result = validateSeed(seed);
  assert.equal(result.valid, true);
});

test("rejects empty principals or empty steps when a scenario entry exists", () => {
  const emptyPrincipals = v3Base({
    scenarios: [validScenario({ principals: [] })],
  });
  assert.ok(checkSeed(emptyPrincipals).problems.some((p) => p.code === "invalid-scenario"));

  const emptySteps = v3Base({
    scenarios: [validScenario({ steps: [] })],
  });
  assert.ok(checkSeed(emptySteps).problems.some((p) => p.code === "invalid-scenario"));
});

test("rejects principal actor that is not an actor concept", () => {
  const seed = v3Base({
    scenarios: [validScenario({
      principals: [{ as: "owner", actor: "behavior.submit-request" }],
    })],
  });
  const problems = checkSeed(seed).problems;
  assert.ok(problems.some((p) => p.code === "invalid-scenario" && /actor concept/.test(p.message)));
});

test("rejects missing expect and non-integer status", () => {
  const missingExpect = v3Base({
    scenarios: [validScenario({
      steps: [{
        id: "submit",
        as: "owner",
        invoke: "behavior.submit-request",
        input: { amount: 1 },
      }],
    })],
  });
  assert.ok(checkSeed(missingExpect).problems.some((p) => p.code === "invalid-scenario" && /expect/.test(p.message)));

  const badStatus = v3Base({
    scenarios: [validScenario({
      steps: [{
        id: "submit",
        as: "owner",
        invoke: "behavior.submit-request",
        expect: { status: "201" },
      }],
    })],
  });
  assert.ok(checkSeed(badStatus).problems.some((p) => p.code === "invalid-scenario" && /status/.test(p.message)));
});

test("rejects unknown fields on scenario, step, and expect", () => {
  const unknownScenario = v3Base({
    scenarios: [validScenario({ timeoutMs: 1000 })],
  });
  assert.ok(checkSeed(unknownScenario).problems.some((p) => p.code === "unknown-field" && /timeoutMs/.test(p.message)));

  const unknownStep = v3Base({
    scenarios: [validScenario({
      steps: [{
        id: "submit",
        as: "owner",
        invoke: "behavior.submit-request",
        expect: { status: 201 },
        parallel: true,
      }],
    })],
  });
  assert.ok(checkSeed(unknownStep).problems.some((p) => p.code === "unknown-field" && /parallel/.test(p.message)));

  const unknownExpect = v3Base({
    scenarios: [validScenario({
      steps: [{
        id: "submit",
        as: "owner",
        invoke: "behavior.submit-request",
        expect: { status: 201, headers: { "x-ok": "1" } },
      }],
    })],
  });
  assert.ok(checkSeed(unknownExpect).problems.some((p) => p.code === "unknown-field" && /headers/.test(p.message)));
});

test("rejects step as that is not a declared principal", () => {
  const seed = v3Base({
    scenarios: [validScenario({
      steps: [{
        id: "submit",
        as: "stranger",
        invoke: "behavior.submit-request",
        expect: { status: 201 },
      }],
    })],
  });
  assert.ok(checkSeed(seed).problems.some((p) => p.code === "invalid-scenario" && /principal/.test(p.message)));
});

test("rejects invoke that is not a behavior concept", () => {
  const dangling = v3Base({
    scenarios: [validScenario({
      steps: [{
        id: "submit",
        as: "owner",
        invoke: "behavior.missing",
        expect: { status: 201 },
      }],
    })],
  });
  assert.ok(checkSeed(dangling).problems.some((p) => p.code === "dangling-concept-reference"));

  const nonBehavior = v3Base({
    scenarios: [validScenario({
      steps: [{
        id: "submit",
        as: "owner",
        invoke: "actor.employee",
        expect: { status: 201 },
      }],
    })],
  });
  assert.ok(checkSeed(nonBehavior).problems.some((p) => p.code === "invalid-scenario" && /behavior/.test(p.message)));
});

test("rejects duplicate scenario, step, and principal ids", () => {
  const dupScenario = v3Base({
    scenarios: [validScenario(), validScenario()],
  });
  assert.ok(checkSeed(dupScenario).problems.some((p) => p.code === "duplicate-id" && /scenario\.owner-can-withdraw/.test(p.message)));

  const dupStep = v3Base({
    scenarios: [validScenario({
      steps: [
        {
          id: "submit",
          as: "owner",
          invoke: "behavior.submit-request",
          expect: { status: 201 },
        },
        {
          id: "submit",
          as: "owner",
          invoke: "behavior.withdraw-request",
          expect: { status: 200 },
        },
      ],
    })],
  });
  assert.ok(checkSeed(dupStep).problems.some((p) => p.code === "duplicate-id" && /step id submit/.test(p.message)));

  const dupPrincipal = v3Base({
    scenarios: [validScenario({
      principals: [
        { as: "owner", actor: "actor.employee" },
        { as: "owner", actor: "actor.employee" },
      ],
    })],
  });
  assert.ok(checkSeed(dupPrincipal).problems.some((p) => p.code === "duplicate-id" && /principal alias owner/.test(p.message)));
});

test("rejects malformed $capture.path references in input at schema time", () => {
  const badRef = v3Base({
    scenarios: [validScenario({
      steps: [{
        id: "withdraw",
        as: "owner",
        invoke: "behavior.withdraw-request",
        input: { requestId: "$request" },
        expect: { status: 200 },
      }],
    })],
  });
  assert.ok(checkSeed(badRef).problems.some((p) => p.code === "invalid-scenario" && /\$/.test(p.message)));

  const nestedBad = v3Base({
    scenarios: [validScenario({
      steps: [{
        id: "withdraw",
        as: "owner",
        invoke: "behavior.withdraw-request",
        input: { nested: { id: "$bad.." } },
        expect: { status: 200 },
      }],
    })],
  });
  assert.ok(checkSeed(nestedBad).problems.some((p) => p.code === "invalid-scenario" && /\$/.test(p.message)));
});

test("empty scenarios array remains valid", () => {
  assert.equal(checkSeed(v3Base({ scenarios: [] })).valid, true);
});

test("scenarios require seed format version 3", () => {
  const seed = {
    formatVersion: 2,
    system: { id: "demo", name: "Demo" },
    concepts: [{ id: "actor.employee", role: "actor", name: "Employee" }],
    commitments: [],
    scenarios: [validScenario()],
  };
  assert.ok(checkSeed(seed).problems.some((p) => p.code === "unsupported-field-for-format"));
});
