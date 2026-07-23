# Plain-English Vocabulary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every word a person reads in varai plain English — "approved" not "ratified", "confirmed / missing / couldn't tell" not "holds / violated / cannot_verify" — without touching the verified mechanism, its enums, or the on-disk formats.

**Architecture:** One glossary module (`src/reporters/display-language.js`, which already owns kernel wording) becomes the single source of human labels for verdicts, binding states, reasons, and the approval/spec vocabulary. Every user-facing surface — the CLI check report, the CLI command messages, the Seed Studio and Review UIs, and the build packet — routes its labels through that glossary. The engine keeps its precise internal terms (`holds`, `stale`, `ratification.status: "ratified"`, commitment ids, CSS classes); only the presentation layer is translated. Because all wording lives in one map, the user redlines their voice in one file.

**Tech Stack:** Node.js ESM, `node --test`, vanilla-JS UI render helpers (pure string functions, already unit-tested).

---

## The data / display boundary (read before touching anything)

**Never change (internal — code, JSON, tests, files depend on these):**
- verdict enum values `holds` / `violated` / `cannot_verify` / `not_checkable` in code and in `varai check --json`
- binding state enums `resolved` / `ambiguous` / `stale` / `unbound`
- `ratification.status` values `"draft"` / `"ratified"` inside `varai.seed.json`
- relation names (`creates`, `requires`, …), concept/commitment/binding ids, reason codes (`insufficient-coverage`, …)
- CSS class names (`verdict-holds`, `binding-stale`, `seed-badge ratified`), DOM element ids (`intent-ratify`)
- file names (`varai.seed.json`, `varai.realization.json`) and the CLI namespace token `varai seed …`

**Change (display — the words a person reads):**
- verdict chips and count labels in the CLI report and the UI
- badges ("ratified" → "Approved"), headings, button text, column titles
- the CLI messages from `seed validate` / `seed ratify` / `check`
- the build-packet prose
- reason/coverage phrasing shown to humans

`varai check --json` stays machine-precise (enums untouched). Only `renderCheckText` (the human text) translates.

---

## Proposed voice (this table IS the redline surface — Task 1 puts it in one file)

| Internal | Plain-English label |
|---|---|
| **verdict** `holds` | confirmed |
| **verdict** `violated` | missing |
| **verdict** `cannot_verify` | couldn't tell |
| **verdict** `not_checkable` | noted |
| **binding** `resolved` | found in the code |
| **binding** `ambiguous` | matched several places |
| **binding** `stale` | out of date |
| **binding** `unbound` | no location given |
| ratified | approved |
| seed | spec |
| commitment | requirement |
| realization witness | builder's map |
| reconciliation | the check |
| `insufficient-coverage` | couldn't analyze this fully |
| `claim-absent-under-analyzed-coverage` | expected in the code but not found |
| `unbound-source` / `unbound-target` | no location was given for it |
| `stale-source` / `stale-target` | the builder's map is out of date |
| `ambiguous-source` / `ambiguous-target` | it matched more than one place |
| `no-checker-semantics` | varai can't check this kind of rule yet |
| `claim-not-confirmed` | found something, but couldn't confirm it |
| `concept-collision` | two requirements point at the same code |

---

## File structure

- `src/reporters/display-language.js` — **extend** with `VERDICT_LABELS`, `BINDING_STATE_LABELS`, `REASON_LABELS`, `SEED_VOCAB`, and helpers. Single source of human wording. (Task 1)
- `src/reconciliation/report.js` — `renderCheckText` routes through the glossary. (Task 2)
- `test/reconciliation/report.test.js` — **new**; locks plain-English CLI output. (Task 2)
- `src/seed/commands.js`, `src/reconciliation/commands.js`, `bin/varai.js` — plain CLI messages; add `approve` as an alias for `ratify`. (Task 3)
- `src/ui/review-view.js` + `test/ui/review-view.test.js` — verdict chips, badges, column titles via glossary. (Task 4)
- `src/ui/intent-view.js`, `src/ui/app.js` + `test/ui/intent-view.test.js` — Seed Studio wording. (Task 5)
- `src/seed/handoff.js` + `test/seed/handoff.test.js` — build-packet prose. (Task 6)

All commands run from the repo root. **This is product-facing work — per the session-workflow policy it must run in a worktree off `origin/main`, not the shared `main` checkout.** Create/enter that worktree before Task 1.

---

### Task 1: Extend the glossary — the single source of human wording

**Files:**
- Modify: `src/reporters/display-language.js`
- Test: `test/reporters/display-language.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `test/reporters/display-language.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { VERDICTS, BINDING_STATES } from "../../src/reconciliation/schema.js";
import {
  verdictLabel, bindingStateLabel, reasonLabel, SEED_VOCAB,
} from "../../src/reporters/display-language.js";

test("every verdict enum has a plain-English label with no jargon", () => {
  const plain = VERDICTS.map(verdictLabel);
  assert.deepEqual(plain, ["confirmed", "missing", "couldn't tell", "noted"]);
  for (const label of plain) {
    assert.ok(!/verify|checkable|holds|violated/.test(label), `"${label}" still reads like jargon`);
  }
});

test("every binding state has a plain-English label", () => {
  for (const state of BINDING_STATES) {
    const label = bindingStateLabel(state);
    assert.notEqual(label, state, `binding state ${state} must be translated`);
  }
  assert.equal(bindingStateLabel("stale"), "out of date");
});

test("reason codes translate, and unknown codes fall back to the code", () => {
  assert.equal(reasonLabel("insufficient-coverage"), "couldn't analyze this fully");
  assert.equal(reasonLabel("no-checker-semantics"), "varai can't check this kind of rule yet");
  assert.equal(reasonLabel("some-unmapped-code"), "some-unmapped-code");
});

test("approval vocabulary avoids the word ratified", () => {
  assert.equal(SEED_VOCAB.approved, "approved");
  assert.ok(!Object.values(SEED_VOCAB).some((w) => /ratif/i.test(w)));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- --test-name-pattern="plain-English label|binding state|reason codes translate|approval vocabulary"`
Expected: FAIL — `verdictLabel` and friends are not exported yet.

- [ ] **Step 3: Add the label maps and helpers**

Append to `src/reporters/display-language.js`:

```js
// Human wording for the reconciliation + seed vocabulary. The engine keeps its
// precise enums (holds/violated/…, resolved/stale/…, ratification.status); this
// is the only place a person's words live. Redline these strings to taste.
export const VERDICT_LABELS = Object.freeze({
  holds: "confirmed",
  violated: "missing",
  cannot_verify: "couldn't tell",
  not_checkable: "noted",
});

export const BINDING_STATE_LABELS = Object.freeze({
  resolved: "found in the code",
  ambiguous: "matched several places",
  stale: "out of date",
  unbound: "no location given",
});

export const REASON_LABELS = Object.freeze({
  "insufficient-coverage": "couldn't analyze this fully",
  "claim-absent-under-analyzed-coverage": "expected in the code but not found",
  "claim-not-confirmed": "found something, but couldn't confirm it",
  "unbound-source": "no location was given for it",
  "unbound-target": "no location was given for what it points at",
  "stale-source": "the builder's map is out of date",
  "stale-target": "the builder's map is out of date",
  "ambiguous-source": "it matched more than one place",
  "ambiguous-target": "what it points at matched more than one place",
  "no-checker-semantics": "varai can't check this kind of rule yet",
  "concept-collision": "two requirements point at the same code",
  "artifact-not-found": "the code it named isn't there",
  "seed-hash-mismatch": "the builder's map was made for an older spec",
});

// Nouns for the approval/spec vocabulary, used in prose surfaces.
export const SEED_VOCAB = Object.freeze({
  approved: "approved",        // internal: ratified
  draft: "draft",
  spec: "spec",                // internal: seed
  requirement: "requirement",  // internal: commitment
  builderMap: "builder's map", // internal: realization witness
  check: "check",              // internal: reconciliation
});

export function verdictLabel(verdict) {
  return VERDICT_LABELS[verdict] ?? verdict;
}
export function bindingStateLabel(state) {
  return BINDING_STATE_LABELS[state] ?? state;
}
export function reasonLabel(code) {
  return REASON_LABELS[code] ?? code;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- --test-name-pattern="plain-English label|binding state|reason codes translate|approval vocabulary"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reporters/display-language.js test/reporters/display-language.test.js
git commit -m "feat: add plain-English glossary for verdicts, binding states, and reasons"
```

---

### Task 2: Reword the CLI check report (the densest jargon)

`renderCheckText` currently prints `holds`, `VIOLATED`, `binding:`, `reasons:`, `human context`, and a jargon summary. Route it through the glossary and rewrite the fixed phrases. It has no test today — add one that locks the plain output.

**Files:**
- Modify: `src/reconciliation/report.js`
- Test: `test/reconciliation/report.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `test/reconciliation/report.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { renderCheckText } from "../../src/reconciliation/report.js";

const report = {
  system: { name: "Slotkeeper" },
  seedHash: "sha256:0123456789abcdef",
  ratified: true,
  realization: { present: true, seedHash: "sha256:0123456789abcdef", stale: false, builder: null },
  commitments: [
    {
      id: "commitment.book-creates-booking", source: "behavior.book", relation: "creates",
      target: { concept: "resource.booking" }, bindingState: "resolved", verdict: "holds",
      reasons: [], bindings: [{ id: "binding.book", concept: "behavior.book", state: "resolved", reason: null, elementIds: ["el.op"] }],
      claimIds: ["claim:abc"], evidence: [{ file: "main.py", line: 5, symbol: "book" }], implementationPath: [], coverage: [],
    },
    {
      id: "commitment.book-requires-avail", source: "behavior.book", relation: "requires",
      target: { literal: "slot is available" }, bindingState: "resolved", verdict: "cannot_verify",
      reasons: ["insufficient-coverage"], bindings: [], claimIds: [], evidence: [], implementationPath: [],
      coverage: [{ capability: "api.condition", scopeId: "s", state: "partial" }],
    },
  ],
  context: [{ id: "context.atomicity", text: "Booking must be atomic." }],
  summary: { total: 2, holds: 1, violated: 0, cannotVerify: 1, notCheckable: 0,
    binding: { resolved: 1, unbound: 0, ambiguous: 0, stale: 0 } },
};

test("the check report reads in plain English, not kernel jargon", () => {
  const text = renderCheckText(report, { model: { elements: [{ id: "el.op", name: "POST /bookings" }] } });
  assert.ok(text.includes("confirmed"), "uses 'confirmed' for holds");
  assert.ok(text.includes("couldn't tell"), "uses \"couldn't tell\" for cannot_verify");
  assert.ok(text.includes("couldn't analyze this fully"), "translates the reason code");
  assert.ok(!/\bholds\b|VIOLATED|cannot_verify|not_checkable/.test(text), "no raw verdict enums");
  assert.ok(!/reconciliation/i.test(text) || text.includes("check"), "no 'reconciliation' header jargon");
  assert.ok(text.includes("approved"), "seed status reads 'approved', not 'ratified'");
  assert.ok(!/ratified/.test(text), "the word ratified never appears");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- --test-name-pattern="plain English, not kernel jargon"`
Expected: FAIL — current output contains `holds`, `ratified`, `Reconciliation`.

- [ ] **Step 3: Reword `renderCheckText`**

In `src/reconciliation/report.js`, replace the import and the `VERDICT_LABELS` constant:

```js
import { verdictLabel, bindingStateLabel, reasonLabel } from "../reporters/display-language.js";
```

Delete the local `const VERDICT_LABELS = { … }`. Then change these lines:

- Header: `lines.push(`Reconciliation — ${systemName}`);` → `lines.push(`Check — ${systemName}`);`
- Seed line: `Seed ${report.seedHash} (${report.ratified ? "ratified" : "draft"})` → `Spec ${report.seedHash} (${report.ratified ? "approved" : "draft"})`
- Realization present: `Realization ${…} (${state})` with `state = report.realization.stale ? "stale — built against a different seed" : "current"` → `Builder's map ${…} (${report.realization.stale ? "out of date — made for a different spec" : "current"})`
- Realization missing: `"Realization none — builder witness is missing; every commitment is unbound"` → `"Builder's map — none supplied; nothing can be located in the code"`
- Per-item label: `const label = VERDICT_LABELS[item.verdict] ?? item.verdict;` → `const label = verdictLabel(item.verdict);`
- Binding line: `` `    binding: ${item.bindingState}` `` → `` `    where it lives: ${bindingStateLabel(item.bindingState)}` ``
- Per-binding suffix line keeps ids but translate state: replace `` `${binding.state}${suffix}` `` so the state shows `bindingStateLabel(binding.state)` and, when present, `binding.reason` renders as `reasonLabel(binding.reason)`.
- Reasons line: `` `    reasons: ${item.reasons.join(", ")}` `` → `` `    why: ${item.reasons.map(reasonLabel).join("; ")}` ``
- Claims line: `` `    claims: ${item.claimIds.join(", ")}` `` → `` `    evidence ids: ${item.claimIds.join(", ")}` ``
- Coverage line: `` `    coverage: ${…}` `` → `` `    how much I could analyze: ${item.coverage.map((r) => `${r.capability} ${r.state}`).join("; ")}` ``
- Context line: `` `human context  ${entry.id}: ${entry.text}` `` → `` `note (not checked)  ${entry.id}: ${entry.text}` ``
- Summary line: rebuild as plain counts:

```js
  lines.push([
    `${summary.total} requirements:`,
    `${summary.holds} confirmed,`,
    `${summary.violated} missing,`,
    `${summary.cannotVerify} couldn't tell,`,
    `${summary.notCheckable} noted`,
    `(located: ${summary.binding.resolved} found, ${summary.binding.unbound} no location,`,
    `${summary.binding.ambiguous} matched several, ${summary.binding.stale} out of date)`,
  ].join(" "));
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- --test-name-pattern="plain English, not kernel jargon"`
Expected: PASS.

- [ ] **Step 5: Eyeball the real thing**

Run: `varai check ../varai-slotkeeper-pilot --no-cache | tail -20`
Expected: reads like English — "Spec … (approved)", "confirmed", "couldn't tell", "N requirements: … confirmed, … missing, …". No `holds`/`ratified`/`reconciliation`.

- [ ] **Step 6: Commit**

```bash
git add src/reconciliation/report.js test/reconciliation/report.test.js
git commit -m "feat: plain-English varai check report"
```

---

### Task 3: Reword CLI messages and add the `approve` verb

**Files:**
- Modify: `src/seed/commands.js`, `src/reconciliation/commands.js`, `bin/varai.js`

- [ ] **Step 1: Reword `seed validate` / `seed ratify` output**

In `src/seed/commands.js`:
- `runSeedValidate`: `Valid ${SEED_FILE} (${status})` where `status = result.ratified ? "ratified" : "draft"` → `Spec ${SEED_FILE} is valid (${result.ratified ? "approved" : "draft"})`.
- The counts line `${…} concepts, ${…} commitments, ${…} context entries` → `${…} things, ${…} requirements, ${…} notes`.
- The draft warning `"Note: the seed is a draft; reconciliation treats only ratified content as human-ratified intent."` → `"Note: this spec is still a draft; the check only trusts an approved spec."`
- `runSeedRatify`: `Already ratified at ${…}` → `Already approved at ${…}`; `Ratified ${SEED_FILE}\n  content hash ${…}` → `Approved ${SEED_FILE}\n  fingerprint ${…}`.

In `src/reconciliation/commands.js` (`runCheck`): the warning `"Warning: the seed is not ratified; results describe unratified draft content."` → `"Note: this spec is still a draft; results describe an unapproved draft."`

- [ ] **Step 2: Add `approve` as an alias for `ratify` in the CLI**

In `bin/varai.js`, in the `seed` command block, accept `approve` alongside `ratify`:

```js
    if (subcommand === "validate" || subcommand === "ratify" || subcommand === "approve") {
      const positional = args.slice(2).filter((arg) => !arg.startsWith("-"));
      const run = subcommand === "validate" ? runSeedValidate : runSeedRatify;
      await run({ repo: positional[0] });
      return;
    }
```

Update the usage text: change `varai seed ratify [<repo-path>]` to `varai seed approve [<repo-path>]   (alias: ratify)`.

- [ ] **Step 3: Verify by hand (no automated test asserts these strings today)**

Run: `varai seed approve ../varai-slotkeeper-pilot`
Expected: `Already approved at sha256:…` (the pilot is already approved). And `varai seed validate ../varai-slotkeeper-pilot` prints `Spec varai.seed.json is valid (approved)` with `… things, … requirements, … notes`.

- [ ] **Step 4: Full suite (nothing should break — no test asserts these exact strings)**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/seed/commands.js src/reconciliation/commands.js bin/varai.js
git commit -m "feat: plain-English CLI messages and 'approve' verb (ratify alias)"
```

---

### Task 4: Reword the Review UI

The Review view already half-translates (counts say "realized/missing/unverified"). Finish it: verdict chips, badges, and column titles through the glossary, and align the counts with the report's words.

**Files:**
- Modify: `src/ui/review-view.js`
- Test: `test/ui/review-view.test.js`

- [ ] **Step 1: Update the test to expect the finished wording**

In `test/ui/review-view.test.js`, change the count assertions (currently `"2</strong> realized"`, `"0</strong> missing"`, `"1</strong> unverified"`) to:

```js
  assert.ok(html.includes("2</strong> confirmed"));
  assert.ok(html.includes("0</strong> missing"));
  assert.ok(html.includes("1</strong> couldn't tell"));
```

Change `assert.ok(html.includes("witness current"));` to `assert.ok(html.includes("builder's map current"));`.
Change `assert.ok(html.includes("Builder testimony"));` to `assert.ok(html.includes("The builder's notes"));`.
Change `assert.ok(html.includes("Independently observed"));` to `assert.ok(html.includes("What varai found in the code"));`.
Add: `assert.ok(verdictChip("holds").includes("confirmed"), "chip shows the plain word");` (keep the existing `verdict-holds` class assertion — the class name does not change).

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test test/ui/review-view.test.js`
Expected: FAIL on the new strings.

- [ ] **Step 3: Reword `review-view.js`**

- Import the glossary: `import { verdictLabel, bindingStateLabel, reasonLabel } from "../reporters/display-language.js";`
- `VERDICT_LABELS` local const: delete it; `verdictChip` uses `verdictLabel(verdict)` for the text, keeping `class="verdict-chip verdict-${verdict}"`.
- Counts in `renderReviewOverview`: `realized` → `confirmed`, keep `missing`, `unverified` → `couldn't tell`, `human context` → `noted`.
- Realization badges: `witness missing` → `builder's map missing`, `witness stale` → `builder's map out of date`, `witness current` → `builder's map current`. Keep the `seed-badge …` classes.
- The approved/draft badge: text `review.ratified ? "ratified" : "draft"` → `review.ratified ? "approved" : "draft"` (keep the `seed-badge ratified` class).
- `renderGroupHeading`: `${group.holds}/${group.total} realized` → `${group.holds}/${group.total} confirmed`.
- `renderCardDetail`: column `<h4>Builder testimony</h4>` → `<h4>The builder's notes</h4>`; `<h4>Independently observed</h4>` → `<h4>What varai found in the code</h4>`; empty copy `No bindings — unbound.` → `No location given.`; `No matching canonical claims.` → `Nothing matching found in the code.`
- `renderBinding`: show `bindingStateLabel(binding.state)` for the text and, when `binding.reason`, `reasonLabel(binding.reason)` instead of the raw code. Keep `binding-${binding.state}` class.
- `renderCardDetail` reasons line: `reasons: <code>…</code>` → `why: <span>${card.reasons.map(reasonLabel).join("; ")}</span>`.
- `renderCoverageLimitations`: heading `What Varai could not determine` → keep (already plain).

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test test/ui/review-view.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/review-view.js test/ui/review-view.test.js
git commit -m "feat: plain-English Review view"
```

---

### Task 5: Reword the Seed Studio (Intent) UI

**Files:**
- Modify: `src/ui/intent-view.js`, `src/ui/app.js`
- Test: `test/ui/intent-view.test.js`

- [ ] **Step 1: Update the test to expect the finished wording**

In `test/ui/intent-view.test.js`, change `assert.ok(diffHtml.includes("Draft vs ratified seed"));` to `assert.ok(diffHtml.includes("Draft vs approved spec"));`. The `intent-ratify` element-id assertions stay unchanged (ids are internal).

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test test/ui/intent-view.test.js`
Expected: FAIL on `Draft vs approved spec`.

- [ ] **Step 3: Reword `intent-view.js`**

- `renderSeedStatus`: badge text `ratified` → `approved` (keep `seed-badge ratified` class); the empty-seed copy `No varai.seed.json yet — draft one below and ratify it.` → `No spec yet — draft one below and approve it.`; counts `${…} concepts · ${…} commitments` → `${…} things · ${…} requirements`.
- `renderUnsupported`: heading `Not checkable — kept visible` → `Noted — can't check these yet`; chip text `human context` → `noted`.
- `renderSeedDiff`: heading `Draft vs ratified seed` → `Draft vs approved spec`; the `No semantic differences.` copy stays.
- `renderReviewActions`: button `Ratify this draft${…}` → `Approve this draft${…}` (keep id `intent-ratify`); `Reject draft` → `Discard draft` (keep id `intent-reject`); note `Fix the validation problems before ratifying.` → `Fix the problems before approving.`

- [ ] **Step 4: Reword `app.js` Seed Studio copy**

In `src/ui/app.js` `renderIntent`:
- `<h2 class="group-heading">Seed Studio</h2>` → `Your spec`.
- The textarea section heading `Describe the system` stays (already plain).
- `No assistant provider configured — paste a proposal JSON below.` → `No AI drafting assistant is set up — paste a structured spec below, or fill it in by hand.`
- The `Latest check` summary line `${…} holds · ${…} violated · ${…} cannot verify · ${…} not checkable` → `${…} confirmed · ${…} missing · ${…} couldn't tell · ${…} noted`.
- Detail placeholder `Ask the assistant or import a proposal; review the diff here before ratifying.` → `Ask the assistant or paste a spec; review the changes here before approving.`
- Nav labels (line ~208): keep `Intent` and `Review` as-is unless redlined — they are short and acceptable; do not rename ids.

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test test/ui/intent-view.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/intent-view.js src/ui/app.js test/ui/intent-view.test.js
git commit -m "feat: plain-English Seed Studio wording"
```

---

### Task 6: Reword the build packet

**Files:**
- Modify: `src/seed/handoff.js`
- Test: `test/seed/handoff.test.js`

- [ ] **Step 1: Update the tests that assert packet wording**

In `test/seed/handoff.test.js`:
- The test `"handoff never includes unratified draft content"` asserts `renderBuildPacket` throws `/unratified/`. Change the regex to `/not approved/` (the reworded error, Step 3).
- The `"recorded as intent"` assertion (relations line) stays — it is already plain.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test test/seed/handoff.test.js`
Expected: FAIL on the `/not approved/` expectation.

- [ ] **Step 3: Reword `handoff.js`**

- Error on unratified: `"Refusing to render a build packet from an unratified seed; ratify first."` → `"This spec is not approved yet; approve it before creating a build packet."`
- Error on hash mismatch: `"Seed ratification hash does not match the semantic content; re-ratify before handoff."` → `"The spec changed since it was approved; approve it again before creating a build packet."`
- Intro line `"You are implementing a software system from a human-ratified seed."` → `"You are building a system from an approved spec."`
- `"The seed is the durable intent."` → `"The spec is the durable intent."`
- Heading `## Ratified seed hash` → `## Approved spec fingerprint`.
- Heading `## Human context (not machine-checkable)` → `## Notes (not machine-checked)`.
- Heading `## Commitments` → `## Requirements`; `## Concepts` → `## Things`.
- The witness section `## Realization witness schema` → `## Builder's map (varai.realization.json)`; the closing warning keeps its meaning but swap `witness`→`builder's map` and `commitments`→`requirements`.

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test test/seed/handoff.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/seed/handoff.js test/seed/handoff.test.js
git commit -m "feat: plain-English build packet"
```

---

### Task 7: Whole-surface verification and a before/after capture

**Files:** none (verification only).

- [ ] **Step 1: Full suite green**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 2: No jargon leaks in the human check output**

Run: `varai check ../varai-slotkeeper-pilot --no-cache | grep -Eic "ratified|reconciliation|\bholds\b|cannot_verify|not_checkable|realization witness"`
Expected: `0`.

- [ ] **Step 3: Machine output is untouched (enums preserved)**

Run: `varai check ../varai-slotkeeper-pilot --no-cache --json | grep -Eo '"verdict": *"[a-z_]+"' | sort -u`
Expected: still shows `holds` / `cannot_verify` / `not_checkable` — the JSON keeps precise enums.

- [ ] **Step 4: Capture before/after for the user to redline**

Run: `varai check ../varai-slotkeeper-pilot --no-cache | tail -24`
Paste the output back so the word choices can be redlined in one place (`src/reporters/display-language.js`). Redlining is a one-file edit followed by `npm test`.

- [ ] **Step 5: Confirm no seed/JSON format changed**

Run: `git -C ../varai-slotkeeper-pilot status --short`
Expected: empty — no reword touched the on-disk seed or realization files.

---

## Self-review notes

- **Boundary held:** every task changes display strings only; verdict enums, binding states, `ratification.status`, ids, CSS classes, reason codes (in `--json`), and file formats are untouched (Task 7 Steps 3 and 5 prove it).
- **Single redline surface:** all human words live in `src/reporters/display-language.js` (verdicts, binding states, reasons) plus a handful of fixed phrases per surface. The user redlines the glossary and re-runs `npm test`.
- **Every reworded surface is guarded by a test** — `renderCheckText` gains its first test (Task 2); the UI and handoff tests are updated in lockstep so the suite encodes the plain wording.
- **Terms deliberately left internal (documented above):** the CLI namespace `varai seed`, the file names, and the `ratification`/`seed` JSON keys — renaming those is a data-format change, out of scope for a wording pass.
- **Naming consistency across tasks:** the four verdict words (confirmed/missing/couldn't tell/noted) are defined once in Task 1 and reused verbatim in Tasks 2, 4, and 5; the binding words (found/matched several/out of date/no location) likewise.
