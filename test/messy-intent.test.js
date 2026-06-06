import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { extractRequirements } from "../src/intent.js";
import { matchIntentToScan } from "../src/matcher.js";
import { scanRepo } from "../src/scanners/index.js";

const scenarioPath = path.resolve("examples/golden/todo-partial");

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

test("todo-partial messy intent keeps trustworthy coverage", async () => {
  const text = await readFile(path.join(scenarioPath, "intent-messy.md"), "utf8");
  const intent = { requirements: extractRequirements(text) };
  const scan = await scanRepo(path.join(scenarioPath, "app"));
  const findings = matchIntentToScan(intent, scan);

  assert.ok(intent.requirements.length >= 4);

  const findingFor = (pattern) => {
    const requirement = intent.requirements.find((item) => pattern.test(item.text));
    assert.ok(requirement, `missing requirement matching ${pattern}`);
    return findings.find((finding) => finding.requirementId === requirement.id);
  };

  assert.equal(findingFor(/notif/i).status, "unverified");
  assert.equal(findingFor(/notif/i).profile, "receive_notifications");

  const adminFinding = findingFor(/admin.*approve|approve.*signup/i);
  assert.equal(adminFinding.status, "unverified");
  assert.equal(adminFinding.profile, "admin_access");

  assert.equal(findingFor(/stripe billing|charge for team/i).status, "unverified");
  assert.equal(findingFor(/webhook/i).status, "unverified");
  assert.equal(findingFor(/webhook/i).profile, "webhook_confirmation");
});
