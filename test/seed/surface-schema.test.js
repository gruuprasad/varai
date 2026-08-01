import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalizeSeed } from "../../src/seed/canonicalize.js";
import { seedContentHash } from "../../src/seed/identity.js";
import { SEED_FORMAT_VERSION } from "../../src/seed/schema.js";
import { SURFACE_ACCESS, SURFACE_CHANNELS } from "../../src/seed/surfaces.js";
import { checkSeed, validateSeed } from "../../src/seed/validate.js";
import { migrateSeedToCurrent } from "../../src/seed/migrate.js";
import { slotkeeperDraft } from "./fixtures.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const exampleV3Path = path.resolve(here, "../../docs/examples/purchase-approvals.seed.v3.json");

function v3Base(overrides = {}) {
  return {
    formatVersion: 3,
    system: { id: "demo", name: "Demo" },
    concepts: [
      { id: "behavior.withdraw-request", role: "behavior", name: "Withdraw request" },
      { id: "behavior.submit-request", role: "behavior", name: "Submit request" },
      { id: "actor.employee", role: "actor", name: "Employee" },
    ],
    commitments: [],
    context: [],
    surfaces: [
      {
        id: "surface.withdraw-request-api",
        name: "Withdraw purchase request API",
        behavior: "behavior.withdraw-request",
        channel: "api",
        access: "authenticated",
      },
    ],
    scenarios: [],
    ...overrides,
  };
}

test("SEED_FORMAT_VERSION is 4 and vocabulary lists are closed", () => {
  assert.equal(SEED_FORMAT_VERSION, 4);
  assert.deepEqual([...SURFACE_CHANNELS], ["ui", "api", "webhook", "job", "cli"]);
  assert.deepEqual([...SURFACE_ACCESS], ["public", "authenticated", "internal"]);
});

test("valid surface schema accepts plan-shaped surfaces", () => {
  const result = checkSeed(v3Base());
  assert.equal(result.valid, true, result.problems.map((p) => p.message).join("; "));
});

test("v3 requires surfaces and scenarios arrays", () => {
  const missingSurfaces = v3Base();
  delete missingSurfaces.surfaces;
  assert.ok(checkSeed(missingSurfaces).problems.some((p) => p.code === "invalid-collection"));

  const missingScenarios = v3Base();
  delete missingScenarios.scenarios;
  assert.ok(checkSeed(missingScenarios).problems.some((p) => p.code === "invalid-collection"));
});

test("rejects unknown channel and access", () => {
  const badChannel = v3Base({
    surfaces: [{
      id: "surface.withdraw-request-api",
      name: "Withdraw API",
      behavior: "behavior.withdraw-request",
      channel: "http",
      access: "authenticated",
    }],
  });
  assert.ok(checkSeed(badChannel).problems.some((p) => p.code === "unknown-surface-channel"));

  const badAccess = v3Base({
    surfaces: [{
      id: "surface.withdraw-request-api",
      name: "Withdraw API",
      behavior: "behavior.withdraw-request",
      channel: "api",
      access: "admin",
    }],
  });
  assert.ok(checkSeed(badAccess).problems.some((p) => p.code === "unknown-surface-access"));
});

test("rejects dangling behavior refs and bad surface ids", () => {
  const dangling = v3Base({
    surfaces: [{
      id: "surface.withdraw-request-api",
      name: "Withdraw API",
      behavior: "behavior.missing",
      channel: "api",
      access: "authenticated",
    }],
  });
  assert.ok(checkSeed(dangling).problems.some((p) => p.code === "dangling-concept-reference"));

  const nonBehavior = v3Base({
    surfaces: [{
      id: "surface.withdraw-request-api",
      name: "Withdraw API",
      behavior: "actor.employee",
      channel: "api",
      access: "authenticated",
    }],
  });
  assert.ok(checkSeed(nonBehavior).problems.some((p) => p.code === "invalid-surface-behavior"));

  const badId = v3Base({
    surfaces: [{
      id: "withdraw-request-api",
      name: "Withdraw API",
      behavior: "behavior.withdraw-request",
      channel: "api",
      access: "authenticated",
    }],
  });
  assert.ok(checkSeed(badId).problems.some((p) => p.code === "invalid-id-format"));
});

test("rejects missing required surface fields and implementation vocabulary fields", () => {
  const missingName = v3Base({
    surfaces: [{
      id: "surface.withdraw-request-api",
      behavior: "behavior.withdraw-request",
      channel: "api",
      access: "authenticated",
    }],
  });
  assert.ok(checkSeed(missingName).problems.some((p) => p.code === "invalid-surface"));

  const withPath = v3Base({
    surfaces: [{
      id: "surface.withdraw-request-api",
      name: "Withdraw API",
      behavior: "behavior.withdraw-request",
      channel: "api",
      access: "authenticated",
      path: "/api/withdraw",
    }],
  });
  assert.ok(checkSeed(withPath).problems.some((p) => p.code === "unknown-field"));
});

test("v1 and v2 seeds still validate without surfaces", () => {
  assert.equal(checkSeed(slotkeeperDraft()).valid, true);
  const v2 = {
    ...slotkeeperDraft(),
    formatVersion: 2,
    commitments: slotkeeperDraft().commitments.map((c) => ({ ...c, expectation: "present" })),
  };
  assert.equal(checkSeed(v2).valid, true);
});

test("surfaces and scenarios are sorted into the canonical form and content hash", () => {
  const seed = v3Base({
    surfaces: [
      {
        id: "surface.z-api",
        name: "Z",
        behavior: "behavior.submit-request",
        channel: "api",
        access: "public",
      },
      {
        id: "surface.a-api",
        name: "A",
        behavior: "behavior.withdraw-request",
        channel: "api",
        access: "authenticated",
      },
    ],
    scenarios: [
      {
        id: "scenario.z",
        name: "Z",
        principals: [{ as: "actor", actor: "actor.employee" }],
        steps: [{
          id: "go",
          as: "actor",
          invoke: "behavior.submit-request",
          expect: { status: 200 },
        }],
      },
      {
        id: "scenario.a",
        name: "A",
        principals: [{ as: "actor", actor: "actor.employee" }],
        steps: [{
          id: "go",
          as: "actor",
          invoke: "behavior.withdraw-request",
          expect: { status: 200 },
        }],
      },
    ],
  });
  assert.equal(checkSeed(seed).valid, true, checkSeed(seed).problems.map((p) => p.message).join("; "));
  const canonical = canonicalizeSeed(seed);
  assert.deepEqual(canonical.surfaces.map((s) => s.id), ["surface.a-api", "surface.z-api"]);
  assert.deepEqual(canonical.scenarios.map((s) => s.id), ["scenario.a", "scenario.z"]);
  assert.equal(seedContentHash(seed), seedContentHash({
    ...seed,
    surfaces: [...seed.surfaces].reverse(),
    scenarios: [...seed.scenarios].reverse(),
  }));
});

test("purchase-approvals.seed.v3.json validates as Seed v3", () => {
  const seed = JSON.parse(fs.readFileSync(exampleV3Path, "utf8"));
  assert.equal(seed.formatVersion, 3);
  assert.ok(Array.isArray(seed.surfaces) && seed.surfaces.length > 0);
  assert.ok(Array.isArray(seed.scenarios) && seed.scenarios.length > 0);
  const result = validateSeed(seed);
  assert.equal(result.valid, true);
});

test("v2 migrates to the current format with empty surfaces/scenarios/flows and a draft", () => {
  const draft = slotkeeperDraft();
  const v2 = {
    ...draft,
    formatVersion: 2,
    commitments: draft.commitments.map((c) => ({ ...c, expectation: "present" })),
  };
  const v2Ratified = {
    ...v2,
    ratification: { status: "ratified", contentHash: seedContentHash(v2) },
  };
  const migrated = migrateSeedToCurrent(v2Ratified);
  assert.equal(migrated.formatVersion, SEED_FORMAT_VERSION);
  assert.deepEqual(migrated.surfaces, []);
  assert.deepEqual(migrated.scenarios, []);
  assert.deepEqual(migrated.flows, []);
  assert.deepEqual(migrated.ratification, { status: "draft" });
  assert.equal(checkSeed(migrated).valid, true);
});
