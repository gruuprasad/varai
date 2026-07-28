import assert from "node:assert/strict";
import test from "node:test";
import { migrateSeedToCurrent } from "../../src/seed/migrate.js";
import { SEED_FORMAT_VERSION } from "../../src/seed/schema.js";
import { checkSeed } from "../../src/seed/validate.js";
import { slotkeeperDraft } from "./fixtures.js";

test("v1 migration makes every existing commitment explicitly present and unapproved at current format", () => {
  const migrated = migrateSeedToCurrent(slotkeeperDraft());
  assert.equal(SEED_FORMAT_VERSION, 3);
  assert.equal(migrated.formatVersion, 3);
  assert.ok(migrated.commitments.every((commitment) => commitment.expectation === "present"));
  assert.deepEqual(migrated.surfaces, []);
  assert.deepEqual(migrated.scenarios, []);
  assert.deepEqual(migrated.ratification, { status: "draft" });
  assert.equal(checkSeed(migrated).valid, true);
});

test("v1 still migrates through to v3 current without inventing surfaces", () => {
  const migrated = migrateSeedToCurrent(slotkeeperDraft());
  assert.equal(migrated.formatVersion, SEED_FORMAT_VERSION);
  assert.equal(migrated.surfaces.length, 0);
  assert.equal(migrated.scenarios.length, 0);
  assert.ok(!JSON.stringify(migrated).includes("POST /"));
});
