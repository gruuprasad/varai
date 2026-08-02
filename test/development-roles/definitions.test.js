import assert from "node:assert/strict";
import test from "node:test";
import { DEVELOPMENT_ROLE_IDS, DEVELOPMENT_ROLES, getDevelopmentRole } from "../../src/development-roles/definitions.js";

test("built-in roles are fixed responsibilities with no duplicate authority", () => {
  assert.deepEqual(Object.keys(DEVELOPMENT_ROLES).sort(), [...DEVELOPMENT_ROLE_IDS].sort());
  for (const id of DEVELOPMENT_ROLE_IDS) {
    const role = getDevelopmentRole(id);
    assert.equal(role.id, id);
    assert.ok(role.label && role.responsibility && role.instruction);
  }
  assert.equal(getDevelopmentRole("builder"), null);
});
