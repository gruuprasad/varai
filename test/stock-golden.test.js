import assert from "node:assert/strict";
import test from "node:test";
import { scanRepo } from "../src/scanners/index.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../examples/golden/stripe-full-loop/app");

test("stripe-full-loop scenario produces at least one 'payment' stock tag", async () => {
  const { facts } = await scanRepo(REPO, { cache: false });
  const tagged = facts.filter((f) => (f.stock ?? []).includes("payment"));
  assert.ok(tagged.length > 0, "expected at least one payment-tagged fact in stripe-full-loop");
});
