import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalStringifySeed, canonicalizeSeed } from "../../src/seed/canonicalize.js";
import { seedContentHash } from "../../src/seed/identity.js";
import { SEED_FILE } from "../../src/seed/schema.js";
import { ratifySeed, readSeed, seedPath, writeSeed } from "../../src/seed/store.js";
import { SeedValidationError } from "../../src/seed/validate.js";
import { slotkeeperDraft } from "./fixtures.js";

function tempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "varai-seed-store-"));
}

test("writeSeed then readSeed round-trips the canonical document", () => {
  const repo = tempRepo();
  const draft = slotkeeperDraft();
  const written = writeSeed(repo, draft);
  assert.equal(written.path, path.join(repo, SEED_FILE));
  assert.equal(written.contentHash, seedContentHash(draft));

  const read = readSeed(repo);
  assert.equal(read.contentHash, written.contentHash);
  assert.equal(read.ratified, false);
  assert.deepEqual(read.seed, JSON.parse(fs.readFileSync(path.join(repo, SEED_FILE), "utf8")));
});

test("the stored file is byte-identical under input reordering", () => {
  const repo = tempRepo();
  const draft = slotkeeperDraft();
  writeSeed(repo, draft);
  const first = fs.readFileSync(path.join(repo, SEED_FILE), "utf8");

  const reordered = {
    commitments: [...draft.commitments].reverse(),
    context: [...draft.context].reverse(),
    system: { name: draft.system.name, id: draft.system.id },
    concepts: [...draft.concepts].reverse(),
    formatVersion: draft.formatVersion,
  };
  writeSeed(repo, reordered);
  const second = fs.readFileSync(path.join(repo, SEED_FILE), "utf8");

  assert.equal(second, first);
  assert.equal(first, canonicalStringifySeed(canonicalizeSeed(draft)));
});

test("ratifySeed stamps the semantic content hash and reads back ratified", () => {
  const repo = tempRepo();
  const draft = slotkeeperDraft();
  const { seed, contentHash } = ratifySeed(repo, draft, { ratifiedAt: "2026-07-23T00:00:00Z" });
  assert.equal(contentHash, seedContentHash(draft));
  assert.equal(seed.ratification.status, "ratified");
  assert.equal(seed.ratification.contentHash, contentHash);

  const read = readSeed(repo);
  assert.equal(read.ratified, true);
  assert.equal(read.contentHash, contentHash);
  assert.equal(read.seed.ratification.ratifiedAt, "2026-07-23T00:00:00Z");
});

test("re-ratifying changed content invalidates the previous hash", () => {
  const repo = tempRepo();
  const draft = slotkeeperDraft();
  const first = ratifySeed(repo, draft);
  const changed = {
    ...draft,
    concepts: draft.concepts.map((concept) =>
      concept.id === "resource.slot" ? { ...concept, name: "Time Slot" } : concept),
  };
  const second = ratifySeed(repo, changed);
  assert.notEqual(second.contentHash, first.contentHash);
  assert.equal(readSeed(repo).contentHash, second.contentHash);
});

test("a failed write never replaces the existing seed and leaves no temp files", () => {
  const repo = tempRepo();
  const draft = slotkeeperDraft();
  writeSeed(repo, draft);
  const before = fs.readFileSync(path.join(repo, SEED_FILE), "utf8");

  const broken = { ...draft, commitments: [{ ...draft.commitments[0], relation: "forbids" }] };
  assert.throws(() => writeSeed(repo, broken), SeedValidationError);

  assert.equal(fs.readFileSync(path.join(repo, SEED_FILE), "utf8"), before);
  assert.deepEqual(fs.readdirSync(repo).filter((name) => name.endsWith(".tmp")), []);
});

test("an invalid stored seed fails loudly instead of being silently accepted", () => {
  const repo = tempRepo();
  fs.writeFileSync(path.join(repo, SEED_FILE), JSON.stringify({ formatVersion: 99 }), "utf8");
  assert.throws(() => readSeed(repo), SeedValidationError);
});

test("readSeed returns null when no seed exists", () => {
  assert.equal(readSeed(tempRepo()), null);
});

test("the seed path is the fixed file at the repository root", () => {
  const repo = tempRepo();
  assert.equal(seedPath(repo), path.join(fs.realpathSync(repo), SEED_FILE));
  assert.equal(seedPath("."), path.join(path.resolve("."), SEED_FILE));
});
