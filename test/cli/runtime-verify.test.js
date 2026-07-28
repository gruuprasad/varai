import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = path.join(root, "test/fixtures/purchase-approval-runtime");

function cli(...args) {
  return execFileSync(process.execPath, ["./bin/varai.js", ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ""}`,
      VARAI_POC_EMPLOYEE_1_TOKEN: "fixture-employee-1-token",
      VARAI_POC_EMPLOYEE_2_TOKEN: "fixture-employee-2-token",
    },
  });
}

test("varai verify scenarios passes the purchase-approval fixture", () => {
  const output = cli("verify", "scenarios", fixture);
  assert.match(output, /scenario passed/);
  assert.match(output, /scenario\.owner-can-withdraw/);
  assert.match(output, /3 scenarios: 3 passed/);
  assert.doesNotMatch(output, /only owners can ever/i);
});

test("varai verify scenarios --json emits a run record", () => {
  const run = JSON.parse(cli("verify", "scenarios", fixture, "--json"));
  assert.equal(run.formatVersion, 1);
  assert.equal(run.scenarios.length, 3);
  assert.ok(run.scenarios.every((item) => item.result === "passed"));
  assert.ok(run.contentHash);
});
