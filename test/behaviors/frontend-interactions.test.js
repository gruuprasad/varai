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

test("does not claim semantics for inline callbacks or compound guards", async () => {
  const behaviors = await trace(`export const Modal = ({ onClose }) => <>
    <button onClick={() => onClose()} disabled={loading}>X</button>
    <button onClick={onClose} disabled={loading || invalid}>Cancel</button>
  </>;`);
  assert.equal(behaviors.length, 1);
  assert.equal(behaviors[0].guards.length, 0);
});
