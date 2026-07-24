import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../src/scanners/index.js";

test("serial and worker scans produce the same canonical System Model", { timeout: 30_000 }, async () => {
  const fixture = path.resolve("test/fixtures/behaviors-app");
  const common = { cache: false, parser: "native" };
  const serial = await scanRepo(fixture, { ...common, jobs: 1 });
  const worker = await scanRepo(fixture, { ...common, jobs: 4 });
  assert.deepEqual(worker.model, serial.model);
  assert.ok(serial.model.elements.some((element) => element.kind === "contract"));
});

test("frontend System Model is identical in serial and worker scans", { timeout: 30_000 }, async () => {
  const fixture = path.resolve("test/fixtures/frontend-interaction/after");
  const common = { cache: false, parser: "native" };
  const serial = await scanRepo(fixture, { ...common, jobs: 1 });
  const worker = await scanRepo(fixture, { ...common, jobs: 4 });
  assert.deepEqual(worker.model, serial.model);
  assert.deepEqual(
    serial.model.elements.filter((item) => item.kind === "action").map((item) => item.name).sort(),
    ["CreateProjectModal Dismiss", "CreateProjectModal handle Submit"],
  );
});

test("native and WASM parsers produce the same canonical System Model", { timeout: 30_000 }, async () => {
  const fixture = path.resolve("test/fixtures/system-model-app");
  const native = await scanRepo(fixture, { cache: false, parser: "native", jobs: 1 });
  const wasm = await scanRepo(fixture, { cache: false, parser: "wasm", jobs: 1 });
  assert.deepEqual(wasm.model, native.model);
});

test("depends_on edges are parser- and pool-invariant", { timeout: 30_000 }, async () => {
  const fixture = path.resolve("test/fixtures/arch-units/dependency-added");
  const serial = await scanRepo(fixture, { cache: false, parser: "native", jobs: 1 });
  const worker = await scanRepo(fixture, { cache: false, parser: "native", jobs: 4 });
  const wasm = await scanRepo(fixture, { cache: false, parser: "wasm", jobs: 1 });
  assert.deepEqual(worker.model, serial.model);
  assert.deepEqual(wasm.model, serial.model);
  assert.ok(serial.model.claims.some((claim) => claim.relation === "depends_on"));
});
