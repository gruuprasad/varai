import assert from "node:assert/strict";
import test from "node:test";
import { migrateSeedToCurrent } from "../../src/seed/migrate.js";
import { checkSeed } from "../../src/seed/validate.js";
import { slotkeeperDraft } from "./fixtures.js";

test("v1 migration makes every existing commitment explicitly present and unapproved", () => {
  const migrated = migrateSeedToCurrent(slotkeeperDraft());
  assert.equal(migrated.formatVersion, 2);
  assert.ok(migrated.commitments.every((commitment) => commitment.expectation === "present"));
  assert.deepEqual(migrated.ratification, { status: "draft" });
  assert.equal(checkSeed(migrated).valid, true);
});
