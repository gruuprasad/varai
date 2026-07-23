# Reconciliation Soundness and Seed-Language Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the reconciliation soundness bug that lets a lying builder witness produce a false `holds`, and make the seed language honest about authorization and availability for the Slotkeeper pilot.

**Architecture:** Reconciliation stays a pure, deterministic projection over `ratified seed + realization witness + canonical System Model + coverage` (ADR 0005). The verifier gains a cross-binding soundness pass (an observed element that two distinct seed concepts both claim to realize is no longer trusted as either concept's identity). The seed language gains a `performs` actor→behavior relation that is recorded-as-intent (`not_checkable`) rather than silently absent, and the Slotkeeper seed is corrected to stop implying coverage it does not have.

**Tech Stack:** Node.js ESM, `node --test`, existing Varai scanner/System-Model/reconciliation modules. No new dependencies.

---

## Findings this plan covers

From the adversarial review of the `seed-vertical-slice` branch and the Slotkeeper dogfood:

1. **🔴 Soundness bug (verifier trusts the witness's target binding).** Rebinding `commitment.book-slot-creates-outbox`'s target from `OutboxEntry` to `Booking` produces a false `holds`, because `targetMatches` in `check.js` only checks that a claim's target element is in the *witness-resolved* target set — never that the resolved element genuinely corresponds to the named concept. (Tasks 1–2.)
2. **Missing defense-in-depth on witness source wiring.** A witness `sourceBinding` may reference a binding whose `concept` differs from the commitment's `source`; the schema never checks this. (Task 3.)
3. **🟡 Declared actors are dead vocabulary.** `actor.member` / `actor.administrator` appear in the Slotkeeper seed but no relation can attach them to a behavior, so the authorization story is unexpressible and the actors imply coverage that does not exist. `not_checkable` is also currently unreachable for any valid seed. (Tasks 4–5.)
4. **🟡 `list available slots` is a false-friend `holds`.** The concept is named "List available slots" but the API returns all slots (`db.query(Slot).all()`); availability is a client-side presentation detail. The `reads slot` commitment holds, but the name over-promises. (Task 6.)
5. **Docs + regression + version discipline.** Record the new relation and the soundness measure; confirm this is a reconciliation/seed-language-only change that must NOT bump the extraction cache or analyzer version. (Tasks 7–8.)

## Design decision recorded here

The soundness pass treats **two distinct concepts resolving to one observed element as `ambiguous`** (reason `concept-collision`). ADR 0005 / the slice plan list "many seed concepts sharing an artifact" as a supported witness shape, but no test locks it as a `holds`, and a lying target binding is otherwise indistinguishable from a truthful shared binding. We deliberately choose **honest `cannot_verify` over a possibly-false `holds`**: a genuine shared-artifact case surfaces with a clear reason a human can inspect, instead of silently passing. This narrows a permitted-but-untested shape and is documented in ADR 0005 (Task 7).

## File structure

- `src/reconciliation/resolve.js` — add the cross-binding collision pass (Task 2).
- `src/reconciliation/check.js` — no logic change; already downgrades non-`resolved` bindings to `cannot_verify`. Verified by Task 1's test.
- `src/reconciliation/schema.js` — witness source-binding concept-consistency check (Task 3); drop `performs` handling stays here via `RELATION_CAPABILITIES` omission (Task 4).
- `src/seed/schema.js` — add `performs` to `SEED_RELATIONS`; add `RECORDED_ONLY_RELATIONS` (Task 4).
- `src/seed/handoff.js` — derive the "checkable" relation list from recorded-only set (Task 5).
- `test/reconciliation/check.test.js` — soundness regression (Tasks 1, 4).
- `test/reconciliation/witness-schema.test.js` — new; source-binding consistency + relation-vocabulary consistency guard (Tasks 3, 4).
- `test/seed/handoff.test.js` — checkable-vs-recorded wording (Task 5).
- `../../../varai-slotkeeper-pilot/varai.seed.json` + `varai.realization.json` — corrected pilot seed (Task 6).
- `docs/adr/0005-seed-realization-and-reconciliation.md`, `docs/semantic-language.md` (Task 7).

All commands run from the worktree root: `/home/gp/dreamLand/jodulabs/varai/.worktrees/seed-vertical-slice`. The pilot lives at `../../../varai-slotkeeper-pilot` relative to that root.

---

### Task 1: Reproduce the false-holds soundness bug (RED)

Write a self-contained regression test that mislabels a target binding onto an element that carries a matching claim and asserts the verdict is NOT `holds`. This test fails against current code (which returns `holds`).

**Files:**
- Modify: `test/reconciliation/check.test.js`

- [ ] **Step 1: Add the failing regression test**

Append to `test/reconciliation/check.test.js`:

```js
import { seedContentHash } from "../../src/seed/identity.js";

// A minimal, inline scenario isolates the soundness property from the fixture:
// the source operation creates Booking (observed) but NOT Outbox. A truthful
// witness therefore cannot confirm the "creates outbox" commitment. A lying
// witness that rebinds the Outbox concept onto the Booking element must NOT be
// able to borrow Booking's creates-claim to fake a holds.
function collisionScenario() {
  const seed = {
    formatVersion: 1,
    system: { id: "demo", name: "Demo" },
    concepts: [
      { id: "behavior.book", role: "behavior", name: "Book" },
      { id: "resource.booking", role: "resource", name: "Booking" },
      { id: "resource.outbox", role: "resource", name: "Outbox" },
    ],
    commitments: [
      { id: "commitment.book-creates-booking", source: "behavior.book", relation: "creates", target: { concept: "resource.booking" } },
      { id: "commitment.book-creates-outbox", source: "behavior.book", relation: "creates", target: { concept: "resource.outbox" } },
    ],
    context: [],
  };
  const model = {
    system: { id: "demo", key: "demo", name: "Demo" },
    subsystems: [{ id: "sub.api", lens: "api" }, { id: "sub.data", lens: "data" }],
    elements: [
      { id: "el.op", name: "POST /bookings", kind: "operation", key: "POST /bookings", subsystemId: "sub.api", evidence: [] },
      { id: "el.booking", name: "Booking", kind: "entity", key: "Booking", subsystemId: "sub.data", evidence: [] },
      { id: "el.outbox", name: "Outbox", kind: "entity", key: "Outbox", subsystemId: "sub.data", evidence: [] },
    ],
    claims: [
      { id: "claim.creates-booking", sourceId: "el.op", relation: "creates", target: { kind: "reference", id: "el.booking" }, claimState: "observed", evidence: [{ file: "main.py", line: 5, symbol: "book" }], implementationPath: [] },
    ],
    coverage: [],
  };
  const seedHash = seedContentHash(seed);
  const bindings = [
    { id: "binding.book", concept: "behavior.book", artifact: { lens: "api", kind: "operation", key: "POST /bookings" } },
    { id: "binding.booking", concept: "resource.booking", artifact: { lens: "data", kind: "entity", key: "Booking" } },
    { id: "binding.outbox", concept: "resource.outbox", artifact: { lens: "data", kind: "entity", key: "Outbox" } },
  ];
  const witnesses = [
    { commitment: "commitment.book-creates-booking", sourceBinding: "binding.book", target: { concept: "resource.booking" } },
    { commitment: "commitment.book-creates-outbox", sourceBinding: "binding.book", target: { concept: "resource.outbox" } },
  ];
  return { seed, model, seedHash, bindings, witnesses };
}

test("a mislabeled target binding cannot fake a holds", () => {
  const { seed, model, seedHash, bindings, witnesses } = collisionScenario();
  // Attack: rebind the Outbox concept onto the Booking element, which carries a creates-claim.
  const attackBindings = structuredClone(bindings);
  attackBindings.find((b) => b.id === "binding.outbox").artifact.key = "Booking";
  const realization = { formatVersion: 1, seedHash, bindings: attackBindings, witnesses };
  const report = reconcile({ model, seed, realization });
  const outbox = report.commitments.find((c) => c.id === "commitment.book-creates-outbox");
  assert.notEqual(outbox.verdict, "holds", "a wrong target binding must not borrow another concept's claim");
  assert.equal(outbox.verdict, "cannot_verify");
  assert.equal(outbox.bindingState, "ambiguous");
  assert.deepEqual(outbox.reasons, ["ambiguous-target"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="mislabeled target binding"`
Expected: FAIL — the current verdict is `holds`, so `assert.notEqual(outbox.verdict, "holds")` throws.

- [ ] **Step 3: Commit the red test**

```bash
git add test/reconciliation/check.test.js
git commit -m "test: reproduce false-holds from a mislabeled target binding"
```

---

### Task 2: Fix the verifier with a concept-collision pass (GREEN)

Add a deterministic post-resolution pass: any observed element that two or more distinct seed concepts both resolve to is downgraded to `ambiguous` (reason `concept-collision`), so a mislabeled binding degrades to `cannot_verify` instead of borrowing another concept's claim.

**Files:**
- Modify: `src/reconciliation/resolve.js:29-65`

- [ ] **Step 1: Add the collision pass to `resolveBindings`**

In `src/reconciliation/resolve.js`, replace the final `return result;` at the end of `resolveBindings` (currently line 64) with:

```js
  // Cross-binding soundness: a lying target/source binding is otherwise
  // indistinguishable from a truthful one, because the binding IS the concept →
  // element mapping. But when two DISTINCT concepts both resolve to the same
  // observed element, that element's identity is ambiguous — trusting it could
  // let one concept borrow another's canonical Claim and fake a verdict. Such
  // bindings are downgraded to ambiguous so the commitment reports cannot_verify
  // rather than a possibly-false holds. (One concept with several bindings to
  // the same element is fine: the concept set stays size 1.)
  const conceptsByElement = new Map();
  for (const record of result.values()) {
    if (record.state !== "resolved") continue;
    for (const elementId of record.elementIds) {
      const concepts = conceptsByElement.get(elementId) ?? new Set();
      concepts.add(record.concept);
      conceptsByElement.set(elementId, concepts);
    }
  }
  const collided = new Set(
    [...conceptsByElement].filter(([, concepts]) => concepts.size > 1).map(([elementId]) => elementId));
  if (collided.size) {
    for (const record of result.values()) {
      if (record.state === "resolved" && record.elementIds.some((id) => collided.has(id))) {
        record.state = "ambiguous";
        record.reason = "concept-collision";
      }
    }
  }
  return result;
```

- [ ] **Step 2: Run the regression test to verify it passes**

Run: `npm test -- --test-name-pattern="mislabeled target binding"`
Expected: PASS.

- [ ] **Step 3: Run the full suite to confirm no regression**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0`, and total count = previous total + 1 (the new test).

- [ ] **Step 4: Confirm the real pilot is unaffected (still 12 holds / 1 cannot_verify)**

Run: `node ./bin/varai.js check ../../../varai-slotkeeper-pilot --no-cache 2>&1 | tail -1`
Expected: `13 commitments: 12 holds, 0 violated, 1 cannot verify, 0 not checkable (bindings: 13 resolved, ...)` — i.e. no legit binding collided.

- [ ] **Step 5: Commit**

```bash
git add src/reconciliation/resolve.js
git commit -m "fix: reject shared-element bindings so a wrong witness cannot fake holds"
```

---

### Task 3: Validate witness source-binding concept consistency (defense in depth)

A witness's `sourceBinding` must reference a binding whose `concept` equals the commitment's `source`. This is a cheap schema guard that catches mis-wired witnesses at load time (before reconciliation), when the seed is available.

**Files:**
- Create: `test/reconciliation/witness-schema.test.js`
- Modify: `src/reconciliation/schema.js:145-159` (inside the witness loop of `checkRealization`)

- [ ] **Step 1: Write the failing test**

Create `test/reconciliation/witness-schema.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { checkRealization } from "../../src/reconciliation/schema.js";

const seed = {
  formatVersion: 1,
  system: { id: "demo", name: "Demo" },
  concepts: [
    { id: "behavior.book", role: "behavior", name: "Book" },
    { id: "behavior.cancel", role: "behavior", name: "Cancel" },
    { id: "resource.booking", role: "resource", name: "Booking" },
  ],
  commitments: [
    { id: "commitment.book-creates-booking", source: "behavior.book", relation: "creates", target: { concept: "resource.booking" } },
  ],
  context: [],
};

function realizationWith(sourceBinding) {
  return {
    formatVersion: 1,
    seedHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    bindings: [
      { id: "binding.book", concept: "behavior.book", artifact: { lens: "api", kind: "operation", key: "POST /bookings" } },
      { id: "binding.cancel", concept: "behavior.cancel", artifact: { lens: "api", kind: "operation", key: "POST /cancel" } },
    ],
    witnesses: [
      { commitment: "commitment.book-creates-booking", sourceBinding, target: { concept: "resource.booking" } },
    ],
  };
}

test("a witness whose source binding names a different concept is rejected", () => {
  const result = checkRealization(realizationWith("binding.cancel"), { seed });
  assert.equal(result.valid, false);
  assert.ok(result.problems.some((p) => p.code === "witness-source-mismatch"),
    "the wrong-source witness is flagged");
});

test("a witness whose source binding matches the commitment source is accepted", () => {
  const result = checkRealization(realizationWith("binding.book"), { seed });
  assert.ok(!result.problems.some((p) => p.code === "witness-source-mismatch"),
    "the correct-source witness raises no source mismatch");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="witness whose source binding"`
Expected: FAIL — `witness-source-mismatch` is not yet produced.

- [ ] **Step 3: Add the consistency check**

In `src/reconciliation/schema.js`, inside the witness loop of `checkRealization`, immediately after the existing `sourceBinding` presence check (the block ending at line 159, `references undeclared binding`), add:

```js
    if (seed && commitment && typeof witness.sourceBinding === "string") {
      const sourceBinding = (realization.bindings ?? []).find((b) => b?.id === witness.sourceBinding);
      if (sourceBinding && typeof sourceBinding.concept === "string" && sourceBinding.concept !== commitment.source) {
        problems.push({ code: "witness-source-mismatch", message: `Witness ${witness.commitment} source binding ${JSON.stringify(witness.sourceBinding)} binds ${JSON.stringify(sourceBinding.concept)}, not the commitment source ${JSON.stringify(commitment.source)}` });
      }
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --test-name-pattern="witness whose source binding"`
Expected: PASS (both cases).

- [ ] **Step 5: Confirm the pilot realization still validates**

Run: `node ./bin/varai.js check ../../../varai-slotkeeper-pilot --no-cache 2>&1 | tail -1`
Expected: unchanged summary line (no new validation error).

- [ ] **Step 6: Commit**

```bash
git add src/reconciliation/schema.js test/reconciliation/witness-schema.test.js
git commit -m "feat: reject witnesses whose source binding names the wrong concept"
```

---

### Task 4: Add the `performs` actor→behavior relation (recorded intent, `not_checkable`)

Give the seed language a way to attach an actor to a behavior. There is no analyzer capability for authorization today, so `performs` is deliberately **recorded-only**: it validates as a real relation but reconciles to `not_checkable` (retained human intent, no checker semantics). This also makes the `not_checkable` verdict — previously unreachable for any valid seed — reachable and asserted.

**Files:**
- Modify: `src/seed/schema.js:9-13`
- Modify: `test/reconciliation/witness-schema.test.js` (add vocabulary-consistency guard)
- Modify: `test/reconciliation/check.test.js` (add `not_checkable` assertion)

- [ ] **Step 1: Add `performs` and the recorded-only set to the seed schema**

In `src/seed/schema.js`, replace the `SEED_RELATIONS` declaration (lines 9-13) with:

```js
export const SEED_RELATIONS = Object.freeze([
  "invokes", "accepts", "requires",
  "reads", "changes", "creates", "removes",
  "produces", "fails_with", "emits",
  "performs",
]);

// Relations that are valid authored intent but have no checker semantics yet.
// Reconciliation reports these as `not_checkable`, never as a silent absence.
export const RECORDED_ONLY_RELATIONS = Object.freeze(["performs"]);
```

Note: `RELATION_CAPABILITIES` in `src/reconciliation/schema.js` is intentionally NOT given a `performs` entry — `check.js:87` returns `not_checkable` for any relation absent from it.

- [ ] **Step 2: Add a vocabulary-consistency guard test**

Append to `test/reconciliation/witness-schema.test.js`:

```js
import { SEED_RELATIONS, RECORDED_ONLY_RELATIONS } from "../../src/seed/schema.js";
import { RELATION_CAPABILITIES } from "../../src/reconciliation/schema.js";

test("every seed relation is either checkable or explicitly recorded-only", () => {
  for (const relation of SEED_RELATIONS) {
    const checkable = relation in RELATION_CAPABILITIES;
    const recorded = RECORDED_ONLY_RELATIONS.includes(relation);
    assert.ok(checkable !== recorded,
      `${relation} must be either checkable (has capabilities) xor recorded-only, not both/neither`);
  }
});
```

- [ ] **Step 3: Add a `not_checkable` reconciliation test**

Append to `test/reconciliation/check.test.js` (reuses `collisionScenario` from Task 1):

```js
test("a performs commitment is recorded as not_checkable, never a silent absence", () => {
  const { model, seedHash } = collisionScenario();
  const seed = {
    formatVersion: 1,
    system: { id: "demo", name: "Demo" },
    concepts: [
      { id: "actor.member", role: "actor", name: "Member" },
      { id: "behavior.book", role: "behavior", name: "Book" },
    ],
    commitments: [
      { id: "commitment.member-performs-book", source: "actor.member", relation: "performs", target: { concept: "behavior.book" } },
    ],
    context: [],
  };
  const realization = { formatVersion: 1, seedHash: seedContentHash(seed), bindings: [], witnesses: [] };
  const report = reconcile({ model, seed, realization });
  const item = report.commitments.find((c) => c.id === "commitment.member-performs-book");
  assert.equal(item.verdict, "not_checkable");
  assert.deepEqual(item.reasons, ["no-checker-semantics"]);
  assert.equal(report.summary.notCheckable, 1);
});
```

- [ ] **Step 4: Run both new tests**

Run: `npm test -- --test-name-pattern="performs commitment|every seed relation"`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/seed/schema.js test/reconciliation/witness-schema.test.js test/reconciliation/check.test.js
git commit -m "feat: add performs actor relation as recorded not_checkable intent"
```

---

### Task 5: Make the handoff packet honest about checkable vs recorded relations

The build packet currently claims all `SEED_RELATIONS` are "checkable"; `performs` is not. Derive the checkable list from `RECORDED_ONLY_RELATIONS` and state the recorded-only relations separately.

**Files:**
- Modify: `src/seed/handoff.js:1-2,67-69`
- Modify: `test/seed/handoff.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/seed/handoff.test.js` (the file already imports `renderBuildPacket` and builds a ratified seed; reuse its existing helper — inspect the top of the file and follow its `ratifiedSeed()`/equivalent pattern):

```js
test("handoff lists performs as recorded intent, not a checkable relation", () => {
  const packet = renderBuildPacket({ seed: ratifiedSeed() });
  const checkableLine = packet.split("\n").find((l) => l.startsWith("Checkable relations"));
  assert.ok(checkableLine, "packet states the checkable relations");
  assert.ok(!checkableLine.includes("performs"), "performs is not advertised as checkable");
  assert.ok(packet.includes("recorded as intent") && packet.includes("performs"),
    "packet names performs as recorded-only intent");
});
```

Note: if the existing tests use an inline seed literal rather than a `ratifiedSeed()` helper, adapt this test to that same construction — do not introduce a second seed-building pattern.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="recorded intent"`
Expected: FAIL — `performs` currently appears in the single checkable list.

- [ ] **Step 3: Update the handoff renderer**

In `src/seed/handoff.js`, change the import on line 2:

```js
import { RECORDED_ONLY_RELATIONS, SEED_RELATIONS } from "./schema.js";
```

Then replace the single relations line (currently line 68) with:

```js
  const checkable = SEED_RELATIONS.filter((relation) => !RECORDED_ONLY_RELATIONS.includes(relation));
  lines.push(`Checkable relations are limited to: ${checkable.join(", ")}.`);
  if (RECORDED_ONLY_RELATIONS.length) {
    lines.push(`Relations recorded as intent (not machine-checked yet): ${RECORDED_ONLY_RELATIONS.join(", ")}.`);
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --test-name-pattern="recorded intent"`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"` → `# fail 0`.

```bash
git add src/seed/handoff.js test/seed/handoff.test.js
git commit -m "feat: separate checkable from recorded-only relations in build packet"
```

---

### Task 6: Correct the Slotkeeper pilot seed (actors + list-slots honesty)

Use the new `performs` relation to express who does what, rename the over-promising `List available slots` concept, add a context note about client-side availability, re-ratify, and realign the realization's `seedHash`. Actors need no artifact bindings because `performs` reconciles to `not_checkable` before any binding is required (`check.js:87` precedes the source-binding check).

**Files:**
- Modify: `../../../varai-slotkeeper-pilot/varai.seed.json`
- Modify: `../../../varai-slotkeeper-pilot/varai.realization.json`

- [ ] **Step 1: Rename the list concept and add `performs` commitments + availability context**

Edit `../../../varai-slotkeeper-pilot/varai.seed.json`:

1. In `concepts`, change the `behavior.list-slots` entry's `name` from `"List available slots"` to `"List slots"`.
2. Add these commitments to the `commitments` array (validation/canonicalization will re-sort by id on ratify):

```json
{ "id": "commitment.member-performs-book", "source": "actor.member", "relation": "performs", "target": { "concept": "behavior.book-slot" } },
{ "id": "commitment.member-performs-cancel", "source": "actor.member", "relation": "performs", "target": { "concept": "behavior.cancel-booking" } },
{ "id": "commitment.member-performs-list", "source": "actor.member", "relation": "performs", "target": { "concept": "behavior.list-slots" } },
{ "id": "commitment.admin-performs-cancel", "source": "actor.administrator", "relation": "performs", "target": { "concept": "behavior.cancel-booking" } }
```

3. Add this context entry to the `context` array:

```json
{ "id": "context.availability-presentation", "text": "The slots API returns all slots; availability is presented client-side (SlotBoard disables booked slots). Server-side availability filtering is not a committed behavior." }
```

- [ ] **Step 2: Re-ratify the seed through the CLI (the explicit human action)**

Run: `node ./bin/varai.js seed ratify ../../../varai-slotkeeper-pilot`
Expected: `Ratified varai.seed.json` followed by a new `content hash sha256:...`. Copy that hash.

- [ ] **Step 3: Point the realization at the new seed hash**

Edit `../../../varai-slotkeeper-pilot/varai.realization.json`: set `"seedHash"` to the hash printed in Step 2. (No new bindings/witnesses are needed — the `performs` commitments are `not_checkable` and require none.)

- [ ] **Step 4: Run `varai check` and confirm the honest report**

Run: `node ./bin/varai.js check ../../../varai-slotkeeper-pilot --no-cache 2>&1 | tail -1`
Expected: the realization is NOT stale (hashes match) and the summary reads:
`17 commitments: 12 holds, 0 violated, 1 cannot verify, 4 not checkable (bindings: 13 resolved, 0 unbound, 0 ambiguous, 0 stale)`

Verify no commitment is `stale` (which would mean the hash update in Step 3 was wrong):

Run: `node ./bin/varai.js check ../../../varai-slotkeeper-pilot --no-cache 2>&1 | grep -c "binding: stale"`
Expected: `0`.

- [ ] **Step 5: Commit the corrected pilot (in the pilot repo)**

```bash
git -C ../../../varai-slotkeeper-pilot add varai.seed.json varai.realization.json
git -C ../../../varai-slotkeeper-pilot commit -m "seed: express actors via performs; stop implying availability filtering"
```

---

### Task 7: Document the relation and soundness measure; confirm no version bump

Record `performs` and the concept-collision soundness rule in the semantic language and ADR, and confirm this whole change is reconciliation/seed-language-only — it must NOT bump `EXTRACTOR_VERSION` or `SYSTEM_MODEL_ANALYZER_VERSION` (test-matrix invariant: a model-only reconciliation change does not touch the extraction cache).

**Files:**
- Modify: `docs/semantic-language.md` (the "Authored intent and reconciliation" section added on this branch)
- Modify: `docs/adr/0005-seed-realization-and-reconciliation.md` (Consequences)

- [ ] **Step 1: Extend the semantic-language reconciliation section**

In `docs/semantic-language.md`, under "Authored intent and reconciliation", add a paragraph:

```markdown
Some authored relations have no checker semantics yet (currently `performs`, which attaches an
actor to a behavior). These are recorded as intent and reconcile to `not_checkable` — never to a
silent absence — so the seed can express who does what without implying coverage Varai does not
have. Reconciliation also refuses to trust a builder witness that maps two distinct concepts onto
the same observed element: such a binding is `ambiguous` (reason `concept-collision`), because a
mislabeled element could otherwise borrow another concept's Claim and produce a false `holds`.
```

- [ ] **Step 2: Add a Consequences bullet to ADR 0005**

In `docs/adr/0005-seed-realization-and-reconciliation.md`, under `## Consequences`, add:

```markdown
- The seed relation vocabulary may include recorded-only relations (`performs`) that validate as
  intent but reconcile to `not_checkable` until a responsible analyzer capability exists. The
  witness shape "many concepts sharing one artifact", though permitted in principle, is treated by
  the verifier as `ambiguous` (`concept-collision`): honest `cannot_verify` is preferred over a
  possibly-false `holds` when one observed element is claimed by more than one concept.
```

- [ ] **Step 3: Confirm no version bump is warranted**

Run: `git diff --name-only origin/main -- src/scanners src/system-model/version.js`
Expected: **empty** — this task set touched no extractor or analyzer-version file, so the extraction cache and `SYSTEM_MODEL_ANALYZER_VERSION` correctly stay put. (If this command lists files, a prior task changed analyzer behavior and the change must be re-examined against the version-bump rule before proceeding.)

- [ ] **Step 4: Commit**

```bash
git add docs/semantic-language.md docs/adr/0005-seed-realization-and-reconciliation.md
git commit -m "docs: record performs relation and concept-collision soundness rule"
```

---

### Task 8: Final verification matrix

Run the slice's cross-cutting invariants end to end.

- [ ] **Step 1: Full suite green**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 2: Determinism of reconciliation (byte-identical under reordering)**

Run: `npm test -- --test-name-pattern="byte-identical|reordering"`
Expected: PASS.

- [ ] **Step 3: No LLM / no network in `varai check`**

Run: `node ./bin/varai.js check ../../../varai-slotkeeper-pilot --no-cache >/dev/null 2>&1 && echo OK`
Expected: `OK` with no network access (the command imports only scanner + reconciliation; the assistant adapter is never loaded by `check`).

- [ ] **Step 4: No-seed repositories still degrade to the observed-system experience**

Run: `node ./bin/varai.js map ./test/fixtures/system-model-app >/dev/null 2>&1 && echo MAP_OK`
Expected: `MAP_OK`.

- [ ] **Step 5: Whitespace / diff hygiene**

Run: `git diff --check`
Expected: no output.

- [ ] **Step 6: Confirm the demonstrated attack is dead and the pilot is honest**

Run: `node ./bin/varai.js check ../../../varai-slotkeeper-pilot --no-cache 2>&1 | tail -1`
Expected: `17 commitments: 12 holds, 0 violated, 1 cannot verify, 4 not checkable (...)`.

---

## Self-review notes

- **Finding 1 (false holds)** → Tasks 1–2 (reproduce + fix + pilot regression check).
- **Finding 2 (witness source wiring)** → Task 3.
- **Finding 3 (dead actors / unreachable not_checkable)** → Tasks 4–5 (language + handoff) and Task 6 (pilot uses it).
- **Finding 4 (list-available false friend)** → Task 6 (rename + context note).
- **Finding 5 (docs + version discipline)** → Tasks 7–8.
- Expected pilot counts (12 holds / 1 cannot_verify / 4 not_checkable / 17 total) assume the four `performs` commitments added in Task 6; if a reviewer adds fewer/more, update the Task 6 and Task 8 expected strings to match.
- Names used consistently across tasks: reason `concept-collision`; code `witness-source-mismatch`; export `RECORDED_ONLY_RELATIONS`; verdict `not_checkable` with reason `no-checker-semantics`.
