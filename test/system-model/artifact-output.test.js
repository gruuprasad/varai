import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { diffSystemModels } from "../../src/system-model/diff.js";
import { behaviorFrames } from "../../src/system-model/projections/index.js";

const fixture = (name) => path.resolve(`test/fixtures/artifact-output/${name}`);

async function scan(name, options = {}) {
  return (await scanRepo(fixture(name), {
    cache: false,
    jobs: 1,
    systemName: "artifact-output-fixture",
    ...options,
  })).model;
}

function named(model, name) {
  return model.elements.find((item) => item.name === name);
}

function produced(model, operation, artifact) {
  return model.claims.find((item) => item.sourceId === operation.id && item.relation === "produces" &&
    item.target.kind === "reference" && item.target.id === artifact.id);
}

test("converging response and writer evidence lifts produced Artifacts", async () => {
  const model = await scan("after");
  const download = named(model, "GET /reports/monthly");
  const render = named(model, "POST /scenes/render");
  const pdf = named(model, "PDF file");
  const gltf = named(model, "glTF model");

  assert.ok(download && render && pdf && gltf);
  assert.equal(pdf.kind, "artifact");
  assert.equal(gltf.kind, "artifact");
  assert.deepEqual(pdf.qualifiers, {});
  assert.deepEqual(gltf.qualifiers, {});
  assert.equal(produced(model, download, pdf).qualifiers.media_type, "application/pdf");
  assert.equal(produced(model, download, pdf).qualifiers.delivery, "download");
  assert.equal(produced(model, render, gltf).qualifiers.format, "glb");
  assert.equal(produced(model, render, gltf).qualifiers.delivery, "generated");
  assert.ok(produced(model, download, pdf).evidence.some((item) => item.file === "routes.py"));
  assert.ok(produced(model, render, gltf).implementationPath.some((item) => item.symbol === "write_glb_scene"));
  assert.ok(model.coverage.some((item) => item.capability === "api.artifact-output" && item.state === "partial"));

  const frames = behaviorFrames(model).frames;
  assert.ok(frames.some((item) => item.outputClaimIds.includes(produced(model, download, pdf).id)));
});

test("a media type or file-looking route alone does not invent an Artifact", async () => {
  const model = await scan("before");
  assert.equal(model.elements.some((item) => item.kind === "artifact"), false);
  assert.equal(model.claims.some((item) => item.capability === "api.artifact-output"), false);
});

test("newly produced Artifacts appear as meaningful semantic progression", async () => {
  const before = await scan("before");
  const after = await scan("after");
  const diff = diffSystemModels(before, after);
  assert.ok(diff.elements.added.some((item) => item.kind === "artifact" && item.name === "PDF file"));
  assert.ok(diff.elements.added.some((item) => item.kind === "artifact" && item.name === "glTF model"));
  assert.ok(diff.claims.added.some((item) => item.capability === "api.artifact-output" && item.relation === "produces"));
});

test("artifact lift is identical across parser and worker modes", { timeout: 30_000 }, async () => {
  const native = await scan("after", { parser: "native", jobs: 1 });
  const wasm = await scan("after", { parser: "wasm", jobs: 1 });
  const worker = await scan("after", { parser: "native", jobs: 2 });
  assert.deepEqual(wasm, native);
  assert.deepEqual(worker, native);
});
