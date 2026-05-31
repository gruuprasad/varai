import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { readIntent } from "../src/intent.js";
import { matchIntentToScan } from "../src/matcher.js";
import { scanRepo } from "../src/scanners/repo.js";

const goldenRoot = path.resolve("examples/golden");

test("golden scenarios produce expected findings", async (t) => {
  const scenarioNames = (await readdir(goldenRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.ok(scenarioNames.length > 0, "expected at least one golden scenario");

  for (const scenarioName of scenarioNames) {
    await t.test(scenarioName, async () => {
      const scenarioPath = path.join(goldenRoot, scenarioName);
      const expected = JSON.parse(
        await readFile(path.join(scenarioPath, "expected-findings.json"), "utf8")
      );
      const intent = await readIntent(path.join(scenarioPath, "intent.md"));
      const scan = await scanRepo(path.join(scenarioPath, "app"));
      const findings = matchIntentToScan(intent, scan);

      assert.equal(expected.scenario, scenarioName);

      for (const expectedFinding of expected.findings) {
        const actual = findings.find((finding) => finding.requirementId === expectedFinding.requirementId);

        assert.ok(actual, `missing finding ${expectedFinding.requirementId}`);
        assert.equal(
          actual.status,
          expectedFinding.status,
          `${scenarioName} ${expectedFinding.requirementId} status`
        );

        for (const evidenceKey of expectedFinding.evidenceIncludes ?? []) {
          assert.ok(
            actual.evidence.some((fact) => factKey(fact) === evidenceKey),
            `${scenarioName} ${expectedFinding.requirementId} missing evidence ${evidenceKey}`
          );
        }
      }
    });
  }
});

function factKey(fact) {
  return `${fact.kind}:${fact.name}`;
}
