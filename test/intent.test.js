import assert from "node:assert/strict";
import test from "node:test";

import { extractRequirements } from "../src/intent.js";

test("extractRequirements turns intent bullets into requirement records", () => {
  const requirements = extractRequirements(`
# Brief

- Users can create tasks.
- Admins approve new users.
`);

  assert.deepEqual(
    requirements.map((requirement) => requirement.text),
    ["Users can create tasks.", "Admins approve new users."]
  );
  assert.equal(requirements[0].id, "R1");
  assert.ok(requirements[0].keywords.includes("tasks"));
});

test("extractRequirements drops short preamble fragments", () => {
  const requirements = extractRequirements(`
ok so i want to build a task app.
- Users can create tasks.
`);

  assert.deepEqual(requirements.map((requirement) => requirement.text), ["Users can create tasks."]);
});
