import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { extractRequirements } from "../src/intent.js";

test("extractRequirements splits prose into atomic requirements", () => {
  const requirements = extractRequirements(`
ok so i want to build a task app.
users need to sign up and log in.
get notified when someone assigns them a task.
`);

  assert.ok(requirements.length >= 2);
  assert.ok(requirements.some((requirement) => /sign up|log in/i.test(requirement.text)));
  assert.ok(requirements.some((requirement) => /notif/i.test(requirement.text)));
  assert.ok(requirements.every((requirement) => !/^ok so/i.test(requirement.text)));
});

test("extractRequirements keeps bullet intents stable", () => {
  const requirements = extractRequirements(`
# Brief

- Users can create tasks.
- Admins approve new users.
`);

  assert.deepEqual(
    requirements.map((requirement) => requirement.text),
    ["Users can create tasks.", "Admins approve new users."]
  );
});
