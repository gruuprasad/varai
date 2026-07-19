import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createScanContext } from "../../src/scanners/context.js";
import { traceFrontendInteractions } from "../../src/scanners/frontend/interactions.js";

async function trace(source) {
  const dir = await mkdtemp(path.join(tmpdir(), "varai-ui-"));
  await mkdir(path.join(dir, "src/components"), { recursive: true });
  const file = "src/components/Modal.tsx";
  await writeFile(path.join(dir, file), source);
  return traceFrontendInteractions([file], createScanContext(dir));
}

async function traceFiles(sources) {
  const dir = await mkdtemp(path.join(tmpdir(), "varai-ui-files-"));
  for (const [file, source] of Object.entries(sources)) {
    await mkdir(path.join(dir, path.dirname(file)), { recursive: true });
    await writeFile(path.join(dir, file), source);
  }
  return traceFrontendInteractions(Object.keys(sources), createScanContext(dir));
}

test("groups direct callback controls and merges guard evidence", async () => {
  const behaviors = await trace(`export default function Modal({ onClose }) {
    return <><button onClick={onClose} disabled={loading}>X</button><button onClick={onClose} disabled={loading}>Cancel</button></>;
  }`);
  assert.equal(behaviors.length, 1);
  assert.equal(behaviors[0].door.action, "onClose");
  assert.equal(behaviors[0].door.evidence.length, 2);
  assert.equal(behaviors[0].guards.length, 1);
  assert.equal(behaviors[0].guards[0].evidence.length, 2);
});

test("recovers inline callback actions and splits compound disabled guards", async () => {
  const behaviors = await trace(`export const Modal = ({ onClose }) => <>
    <button onClick={() => onClose()} disabled={loading}>X</button>
    <button onClick={onClose} disabled={loading || invalid}>Cancel</button>
  </>;`);
  assert.equal(behaviors.length, 2);
  const inline = behaviors.find((item) => item.door.action === "X");
  assert.ok(inline);
  assert.deepEqual(inline.guards.map((item) => item.condition), ["loading"]);
  const direct = behaviors.find((item) => item.door.action === "onClose");
  assert.deepEqual(direct.guards.map((item) => item.condition), ["loading", "invalid"]);
});

test("retains an integrity acknowledgment gate as a distinct condition", async () => {
  const behaviors = await trace(`export function Panel({ preview, busy, jobId }) {
    return <button
      disabled={busy || !jobId || (preview.has_integrity_changes && !integrityChangesAcknowledged)}
      onClick={() => void updateStructuralType(jobId)}
    >Apply change</button>;
  }`);
  assert.equal(behaviors.length, 1);
  assert.equal(behaviors[0].door.action, "Apply change");
  assert.deepEqual(behaviors[0].guards.map((item) => item.condition), [
    "busy", "!jobId", "preview.has_integrity_changes && !integrityChangesAcknowledged",
  ]);
});

test("traces an inline action through a unique API wrapper to its transport call", async () => {
  const behaviors = await traceFiles({
    "src/components/Panel.tsx": `import { updateType } from "../api/types";
      export function Panel({ jobId, typeId }) {
        return <button onClick={() => void updateType(jobId, typeId)}>Apply change</button>;
      }`,
    "src/api/types.ts": `export async function updateType(jobId, typeId) {
      return bmFetch(\`${"${jobPath(jobId)}"}/structural-types/${"${encodeURIComponent(typeId)}"}\`, { method: "PUT" });
    }`,
  });
  assert.equal(behaviors.length, 1);
  assert.deepEqual(behaviors[0].invokes.map(({ method, path: routePath }) => ({ method, path: routePath })), [
    { method: "PUT", path: "*/structural-types/*" },
  ]);
  assert.equal(behaviors[0].invokes[0].implementationPath.length, 3);
});

test("traces an API wrapper invoked inside a nested mutation callback", async () => {
  const behaviors = await traceFiles({
    "src/components/Panel.tsx": `import { updateType } from "../api/types";
      export function Panel({ jobId, typeId }) {
        return <button onClick={() => void mutate(() => updateType(jobId, typeId))}>Apply change</button>;
      }`,
    "src/api/types.ts": `export async function updateType(jobId, typeId) {
      return bmFetch(\`${"${jobPath(jobId)}"}/structural-types/${"${encodeURIComponent(typeId)}"}\`, { method: "PUT" });
    }`,
  });
  assert.deepEqual(behaviors[0].invokes.map(({ method, path: routePath }) => ({ method, path: routePath })), [
    { method: "PUT", path: "*/structural-types/*" },
  ]);
});
