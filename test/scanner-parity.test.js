import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../src/scanners/index.js";

const fixture = path.resolve("test/fixtures/behaviors-app");

function canonicalView(scan) {
  return JSON.stringify({ facts: scan.facts, behaviors: scan.behaviors });
}

test("serial and worker scans produce equivalent facts and behaviors", { timeout: 30_000 }, async () => {
  const common = { cache: false, parser: "native" };
  const serial = await scanRepo(fixture, { ...common, jobs: 1 });
  const worker = await scanRepo(fixture, { ...common, jobs: 4 });
  assert.equal(canonicalView(worker), canonicalView(serial));
  assert.ok(worker.facts.some((fact) => fact.kind === "schema"));
});

test("frontend interactions are identical in serial and worker scans", { timeout: 30_000 }, async () => {
  const frontend = path.resolve("test/fixtures/frontend-interaction/after");
  const common = { cache: false, parser: "native" };
  const serial = await scanRepo(frontend, { ...common, jobs: 1 });
  const worker = await scanRepo(frontend, { ...common, jobs: 4 });
  assert.equal(JSON.stringify(worker.analysis), JSON.stringify(serial.analysis));
  assert.equal(JSON.stringify(worker.systemModel), JSON.stringify(serial.systemModel));
  assert.equal(serial.analysis.behaviors.filter((item) => item.door.kind === "ui_action").length, 1);
});
