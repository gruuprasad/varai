# Arch Units Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the arch-unit projection actually reach the dashboard — ship a grain that carries dependency edges, repair the payload→UI seam that `ca0fb31` broke, and render units + dependencies as a Code map view.

**Architecture:** `ca0fb31` added the `depends_on` kernel Claim and the `arch-units` projection, then removed `observedAreas`/`regionCandidates` from the server payload. Two defects followed: (a) the server serializes `archUnits` at the default `subsystem` grain, which groups by technology *layer* (`api`, `data`, `ui`, `cli`, `service`, `application`) so every real import edge is dropped as intra-unit; (b) `src/ui/app.js` still reads `projections.observedAreas`, so the Code map nav is dead and the topbar reports zeros on every screen. This plan changes the serialized grain to `module`, locks the payload→UI seam with a contract test that reads the UI source, adds a pure-function `arch-units-view.js` following the existing view-module idiom, and wires it in as the Code map's default mode.

**Tech Stack:** Node 20+ ESM, `node --test` (no test framework), vanilla-JS UI modules that return HTML strings and are unit-tested by importing and regex-matching.

---

## Background you need before starting

**Read these first.** You will not be able to write correct code without them.

- `src/system-model/projections/arch-units.js` — the projection. Note line 40: `if (fromUnitId === toUnitId) continue;` drops intra-unit edges. Note `unitIdForElement` at line 104: grain `subsystem` returns `element.subsystemId`, grain `module` returns `module:<lexicographically smallest evidence file>`.
- `src/server/projections.js` — the whole file is 24 lines. Line 22 is the defect.
- `src/ui/app.js:1-4` (imports), `:165-186` (`render()`), `:188-197` (`renderTopbar`), `:210-215` (`MAP_MODES`), `:289-335` (`renderObservedAreas`).
- `src/ui/report-view.js` — the idiom to copy for a new view module: a top-of-file comment explaining the presentation decision, a local `esc`, and small exported pure functions.
- `test/ui/view-split.test.js` — the idiom to copy for view-module tests.

**Why grain `module` and not `subsystem`.** `subsystemKey` is a fixed layer vocabulary assigned in `src/scanners/lift/index.js` (lines 198, 263-275, 346, 357, 399): `api`, `data`, `ui`, `cli`, `service`, `application`. It is not a module/package grouping. A Python import from `app/orders.py` to `app/users.py` produces an `operation → operation` edge, and both operations carry `subsystemKey: "api"`, so the edge is intra-unit and vanishes. Verified against the repo's own fixture:

```
===dependency-added=== depends_on claims: 1
 grain subsystem   units 2  edges 0   []
 grain module      units 2  edges 1   ["module:app/orders.py->module:app/users.py"]
```

**Known limitation to preserve honestly, not hide.** `src/scanners/imports/` contains exactly one file, `python-imports.js`. Non-Python repositories produce zero `depends_on` claims and therefore zero edges. Task 4 renders an explicit notice for that case. Do not fabricate edges, do not infer dependencies from anything other than `depends_on` claims, and do not suppress the empty state.

**Do not restore `observedAreas` to the payload.** Its removal was deliberate and is asserted in `test/server/projections.test.js` (`assert.equal("observedAreas" in payload, false)`). The projection module stays importable; the *view* is what is being retired.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/server/projections.js` | Modify (line 22) | Serialize `archUnits` at `module` grain |
| `test/server/projections.test.js` | Modify (append) | Assert the serialized grain carries edges |
| `test/server/ui-payload-contract.test.js` | Create | Assert every `projections.<key>` the UI reads exists in the payload |
| `src/ui/changes.js` | Create | Home for `collectChangedClaimIds`, currently stranded in the retiring view |
| `test/ui/changes.test.js` | Create | Tests for `collectChangedClaimIds` |
| `src/ui/arch-units-view.js` | Create | Pure functions rendering the units master list and unit detail |
| `test/ui/arch-units-view.test.js` | Create | Tests for the above |
| `src/ui/app.js` | Modify (lines 1-4, 185, 188-197, 210-215, 289-335) | Wire the Units view in; drop the dead one |
| `src/ui/observed-areas-view.js` | Delete | Unreachable once the payload key is gone |
| `test/ui/observed-areas-view.test.js` | Delete | Tests only the deleted file |
| `src/ui/styles.css` | Modify (append) | Styles for the dependency lists in unit detail |

---

## Task 1: Serialize a grain that carries edges

**Files:**
- Modify: `src/server/projections.js:22`
- Test: `test/server/projections.test.js` (append two tests)

- [ ] **Step 1: Write the failing tests**

Append to the end of `test/server/projections.test.js`:

```javascript
// Grain choice is load-bearing, not cosmetic. `subsystem` groups by technology
// lens (api / data / ui / …), so an import edge between two API operations is
// intra-unit and gets dropped. `module` is the grain at which observed
// dependency edges survive, so it is the grain the dashboard is served.
function archDraft() {
  return {
    subsystems: [subsystem("api", "api", "API")],
    elements: [
      {
        subsystemKey: "api", kind: "operation", key: "GET /orders", name: "GET /orders",
        roles: ["interface", "behavior"], qualifiers: {}, evidence: evidence("app/orders.py", 3),
        observationMethod: "ast", claimState: "observed", capability: "api.operation",
      },
      {
        subsystemKey: "api", kind: "operation", key: "GET /users", name: "GET /users",
        roles: ["interface", "behavior"], qualifiers: {}, evidence: evidence("app/users.py", 3),
        observationMethod: "ast", claimState: "observed", capability: "api.operation",
      },
    ],
    claims: [{
      source: source("api", "operation", "GET /orders"),
      relation: "depends_on",
      target: reference("api", "operation", "GET /users"),
      slot: "depends_on:GET /users",
      qualifiers: {}, evidence: evidence("app/orders.py", 13), implementationPath: [],
      observationMethod: "ast", claimState: "observed", capability: "arch.dependency",
    }],
  };
}

test("server serializes arch units at module grain", () => {
  const model = buildSystemModel(archDraft(), { systemName: "arch-grain-fixture" });
  const payload = serializeProjections(model);
  assert.equal(payload.archUnits.grain, "module");
});

test("the serialized arch-unit grain preserves observed dependency edges", () => {
  const model = buildSystemModel(archDraft(), { systemName: "arch-grain-fixture" });
  const payload = serializeProjections(model);
  assert.equal(payload.archUnits.edges.length, 1);
  assert.deepEqual(
    payload.archUnits.edges.map((edge) => `${edge.fromUnitId}->${edge.toUnitId}`),
    ["module:app/orders.py->module:app/users.py"],
  );
  // The regression this guards: at subsystem grain both operations share the
  // "api" lens, so this same edge collapses to nothing.
  assert.equal(archUnits(model, { grain: "subsystem" }).edges.length, 0);
});
```

Add the `archUnits` import at the top of the same file, directly under the existing `serializeProjections` import:

```javascript
import { archUnits } from "../../src/system-model/projections/index.js";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/server/projections.test.js`
Expected: FAIL. `server serializes arch units at module grain` fails with `Expected values to be strictly equal: 'subsystem' !== 'module'`, and the edge test fails with `Expected values to be strictly equal: 0 !== 1`.

- [ ] **Step 3: Change the serialized grain**

In `src/server/projections.js`, replace line 22:

```javascript
    archUnits: archUnits(model),
```

with:

```javascript
    // Module grain, deliberately. `subsystem` groups by technology lens
    // (api / data / ui / …), which is not an architectural axis: an import
    // between two API operations is intra-unit there and gets dropped, so the
    // graph is always empty. Module grain is the coarsest grouping at which
    // observed dependency edges survive. The unit key is a deterministic
    // rollup (lexicographically smallest evidence file), not a designated
    // home — see arch-units.js.
    archUnits: archUnits(model, { grain: "module" }),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/server/projections.test.js`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Run the full suite to check nothing downstream assumed subsystem grain**

Run: `npm test 2>&1 | tail -10`
Expected: `# fail 0`. If a snapshot or scanner-parity test fails on the changed payload, update the expectation to module grain — do not revert the grain.

- [ ] **Step 6: Commit**

```bash
git add src/server/projections.js test/server/projections.test.js
git commit -m "fix(server): serialize arch units at the grain that carries edges

Subsystem grain groups by technology lens, so observed import edges between
two API operations were intra-unit and dropped. The dashboard payload always
carried an empty graph. Module grain preserves them."
```

---

## Task 2: Lock the payload→UI seam with a contract test

The break this plan repairs passed 377 green tests, because nothing asserts that the keys the UI reads are the keys the server sends. This test reads the UI source and closes that hole.

**Files:**
- Create: `test/server/ui-payload-contract.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/server/ui-payload-contract.test.js`:

```javascript
// The seam that broke in ca0fb31: the server stopped sending `observedAreas`
// while src/ui/app.js kept reading it, and the whole suite stayed green. This
// test reads the UI source and asserts that every projection key the UI reaches
// for is a key the server actually sends. It is deliberately source-scraping —
// there is no DOM here, and a type system would be the alternative.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSystemModel } from "../../src/system-model/build.js";
import { serializeProjections } from "../../src/server/projections.js";

const uiDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "ui");

// Matches `projections.things`, `projections?.things`, and
// `projections?.  things` across line breaks.
const PROJECTION_READ = /projections\s*\??\.\s*([A-Za-z_$][\w$]*)/g;

function projectionKeysReadByUi() {
  const keys = new Set();
  for (const file of readdirSync(uiDir).filter((name) => name.endsWith(".js"))) {
    const source = readFileSync(join(uiDir, file), "utf8");
    for (const match of source.matchAll(PROJECTION_READ)) keys.add(match[1]);
  }
  return keys;
}

test("the projection-read regex actually finds reads in the UI source", () => {
  // Guards the test itself: if the UI stops using `projections.` syntax, the
  // contract test would silently pass by matching nothing.
  assert.ok(projectionKeysReadByUi().size > 0, "found no projections.<key> reads in src/ui — the regex is stale");
});

test("every projection key the UI reads is sent by the server", () => {
  const model = buildSystemModel({ subsystems: [], elements: [], claims: [] }, { systemName: "contract-fixture" });
  const sent = new Set(Object.keys(serializeProjections(model)));
  const missing = [...projectionKeysReadByUi()].filter((key) => !sent.has(key)).sort();
  assert.deepEqual(missing, [], `src/ui reads projection keys the server does not send: ${missing.join(", ")}`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/server/ui-payload-contract.test.js`
Expected: FAIL on the second test with `src/ui reads projection keys the server does not send: observedAreas`. The first test passes.

This failure is the bug, reproduced. Tasks 5 and 7 make it pass. Leave it red.

- [ ] **Step 3: Commit the red test**

```bash
git add test/server/ui-payload-contract.test.js
git commit -m "test: assert the UI only reads projection keys the server sends

Currently red: src/ui/app.js reads projections.observedAreas, which ca0fb31
removed from the payload. Repaired in the UI tasks that follow."
```

Note for the executor: the suite is intentionally red between here and Task 5. If your workflow forbids committing a failing test, do Tasks 3-5 first and commit this file at the end of Task 5 instead — but do run it now and confirm the `observedAreas` failure, because that failure is the whole point.

---

## Task 3: Unit naming and matching helpers

**Files:**
- Create: `src/ui/arch-units-view.js`
- Test: `test/ui/arch-units-view.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/ui/arch-units-view.test.js`:

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import {
  unitDisplayName,
  unitSummaryLine,
  unitMatchesQuery,
} from "../../src/ui/arch-units-view.js";

const subsystemsById = new Map([["subsystem:abc", { id: "subsystem:abc", name: "API" }]]);

const unit = (overrides = {}) => ({
  id: "module:app/orders.py",
  memberElementIds: ["element:one", "element:two"],
  outboundUnitIds: ["module:app/users.py"],
  inboundUnitIds: [],
  outboundEdgeCount: 3,
  inboundEdgeCount: 0,
  ...overrides,
});

test("unitDisplayName strips the module prefix and keeps the path", () => {
  assert.equal(unitDisplayName("module:app/orders.py", subsystemsById), "app/orders.py");
});

test("unitDisplayName resolves a subsystem unit to its name", () => {
  assert.equal(unitDisplayName("subsystem:abc", subsystemsById), "API");
});

test("unitDisplayName falls back to the raw id when nothing resolves", () => {
  assert.equal(unitDisplayName("subsystem:unknown", subsystemsById), "subsystem:unknown");
});

test("unitSummaryLine counts parts and both edge directions", () => {
  assert.equal(unitSummaryLine(unit()), "2 parts · depends on 1 · used by nothing");
});

test("unitSummaryLine says nothing rather than zero when a unit is isolated", () => {
  const isolated = unit({ memberElementIds: ["element:one"], outboundUnitIds: [], outboundEdgeCount: 0 });
  assert.equal(unitSummaryLine(isolated), "1 part · depends on nothing · used by nothing");
});

test("unitMatchesQuery matches on the unit name", () => {
  assert.equal(unitMatchesQuery(unit(), "orders", subsystemsById, new Map()), true);
  assert.equal(unitMatchesQuery(unit(), "invoices", subsystemsById, new Map()), false);
});

test("unitMatchesQuery matches on a member element name", () => {
  const byId = new Map([["element:one", { id: "element:one", name: "GET /invoices" }]]);
  assert.equal(unitMatchesQuery(unit(), "invoices", subsystemsById, byId), true);
});

test("unitMatchesQuery admits everything when the query is empty", () => {
  assert.equal(unitMatchesQuery(unit(), "", subsystemsById, new Map()), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ui/arch-units-view.test.js`
Expected: FAIL with `Cannot find module .../src/ui/arch-units-view.js`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/arch-units-view.js`:

```javascript
// Arch units are a projection over Element→Element `depends_on` claims, not a
// derived architecture. Nothing here infers a dependency, ranks a unit, or
// names a layer: it shows the observed edges and says plainly when there are
// none. Unit ids are deterministic rollup keys, not designated homes — the
// module prefix is stripped for reading, never treated as a definition site.

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function unitDisplayName(unitId, subsystemsById = new Map()) {
  if (unitId.startsWith("module:")) return unitId.slice("module:".length);
  return subsystemsById.get(unitId)?.name ?? unitId;
}

export function unitSummaryLine(unit) {
  const members = unit.memberElementIds.length;
  const outbound = unit.outboundUnitIds.length;
  const inbound = unit.inboundUnitIds.length;
  return [
    `${members} ${members === 1 ? "part" : "parts"}`,
    outbound ? `depends on ${outbound}` : "depends on nothing",
    inbound ? `used by ${inbound}` : "used by nothing",
  ].join(" · ");
}

export function unitMatchesQuery(unit, query, subsystemsById, byId) {
  if (!query) return true;
  const needle = query.toLowerCase();
  const names = [
    unitDisplayName(unit.id, subsystemsById),
    ...unit.memberElementIds.map((id) => byId.get(id)?.name),
  ];
  return names.some((name) => name?.toLowerCase().includes(needle));
}
```

The `esc` binding is unused until Task 4 adds the renderers. If your linter rejects that, add the renderers from Task 4 in the same pass rather than deleting it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/ui/arch-units-view.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/arch-units-view.js test/ui/arch-units-view.test.js
git commit -m "feat(ui): arch-unit naming and matching helpers"
```

---

## Task 4: The units outline renderer

**Files:**
- Modify: `src/ui/arch-units-view.js` (append)
- Test: `test/ui/arch-units-view.test.js` (append)

- [ ] **Step 1: Write the failing test**

Append to `test/ui/arch-units-view.test.js`:

```javascript
import { archUnitsNotice, renderArchUnitsOutline } from "../../src/ui/arch-units-view.js";

const projection = {
  kind: "arch-units",
  grain: "module",
  units: [
    {
      id: "module:app/orders.py",
      memberElementIds: ["element:one"],
      outboundUnitIds: ["module:app/users.py"],
      inboundUnitIds: [],
      outboundEdgeCount: 2,
      inboundEdgeCount: 0,
    },
    {
      id: "module:app/users.py",
      memberElementIds: ["element:two"],
      outboundUnitIds: [],
      inboundUnitIds: ["module:app/orders.py"],
      outboundEdgeCount: 0,
      inboundEdgeCount: 2,
    },
  ],
  edges: [{
    fromUnitId: "module:app/orders.py",
    toUnitId: "module:app/users.py",
    claimIds: ["claim:a", "claim:b"],
    edgeCount: 2,
  }],
};

const outlineCtx = {
  projection,
  subsystemsById: new Map(),
  byId: new Map([
    ["element:one", { id: "element:one", name: "GET /orders", kind: "operation" }],
    ["element:two", { id: "element:two", name: "GET /users", kind: "operation" }],
  ]),
  query: "",
  expandedId: null,
  changedElements: new Set(),
};

test("archUnitsNotice is silent when edges were observed", () => {
  assert.equal(archUnitsNotice(projection), "");
});

test("archUnitsNotice names the coverage limit when no edges were observed", () => {
  const notice = archUnitsNotice({ ...projection, edges: [] });
  assert.match(notice, /No dependencies were observed/);
  assert.match(notice, /Python imports/);
});

test("renderArchUnitsOutline lists every unit by display name", () => {
  const rendered = renderArchUnitsOutline(outlineCtx);
  assert.match(rendered.masterHtml, /app\/orders\.py/);
  assert.match(rendered.masterHtml, /app\/users\.py/);
  assert.equal(rendered.matchCount, 2);
});

test("renderArchUnitsOutline filters by query and reports the match count", () => {
  const rendered = renderArchUnitsOutline({ ...outlineCtx, query: "orders" });
  assert.match(rendered.masterHtml, /app\/orders\.py/);
  assert.doesNotMatch(rendered.masterHtml, /app\/users\.py/);
  assert.equal(rendered.matchCount, 1);
});

test("renderArchUnitsOutline marks the expanded unit selected and exposes its id", () => {
  const rendered = renderArchUnitsOutline({ ...outlineCtx, expandedId: "module:app/orders.py" });
  assert.match(rendered.masterHtml, /class="card selected open"/);
  assert.match(rendered.masterHtml, /data-expand="module:app\/orders\.py"/);
});

test("unit detail names outbound dependencies with their edge counts", () => {
  const rendered = renderArchUnitsOutline({ ...outlineCtx, expandedId: "module:app/orders.py" });
  assert.match(rendered.detailHtml, /Depends on/);
  assert.match(rendered.detailHtml, /app\/users\.py/);
  assert.match(rendered.detailHtml, /2 references/);
});

test("unit detail names inbound dependents", () => {
  const rendered = renderArchUnitsOutline({ ...outlineCtx, expandedId: "module:app/users.py" });
  assert.match(rendered.detailHtml, /Used by/);
  assert.match(rendered.detailHtml, /app\/orders\.py/);
});

test("unit detail lists member elements", () => {
  const rendered = renderArchUnitsOutline({ ...outlineCtx, expandedId: "module:app/orders.py" });
  assert.match(rendered.detailHtml, /GET \/orders/);
});

test("unit detail states plainly when a unit has no dependencies either way", () => {
  const lone = {
    ...projection,
    units: [{
      id: "module:app/lone.py", memberElementIds: ["element:one"],
      outboundUnitIds: [], inboundUnitIds: [], outboundEdgeCount: 0, inboundEdgeCount: 0,
    }],
    edges: [],
  };
  const rendered = renderArchUnitsOutline({ ...outlineCtx, projection: lone, expandedId: "module:app/lone.py" });
  assert.match(rendered.detailHtml, /No dependencies were observed for this unit/);
});

test("renderArchUnitsOutline escapes unit names", () => {
  const nasty = {
    ...projection,
    units: [{
      id: `module:app/<script>.py`, memberElementIds: [],
      outboundUnitIds: [], inboundUnitIds: [], outboundEdgeCount: 0, inboundEdgeCount: 0,
    }],
    edges: [],
  };
  const rendered = renderArchUnitsOutline({ ...outlineCtx, projection: nasty });
  assert.doesNotMatch(rendered.masterHtml, /<script>/);
  assert.match(rendered.masterHtml, /&lt;script&gt;/);
});

test("renderArchUnitsOutline returns an empty-state master when there are no units", () => {
  const rendered = renderArchUnitsOutline({ ...outlineCtx, projection: { ...projection, units: [], edges: [] } });
  assert.match(rendered.masterHtml, /No architectural units were observed/);
  assert.equal(rendered.matchCount, 0);
});
```

Merge this new `import` line into the existing import block at the top of the file rather than leaving two imports from the same module.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ui/arch-units-view.test.js`
Expected: FAIL with `The requested module '../../src/ui/arch-units-view.js' does not provide an export named 'archUnitsNotice'`.

- [ ] **Step 3: Write the implementation**

Append to `src/ui/arch-units-view.js`:

```javascript
// Coverage is stated, never implied. An empty graph on a non-Python repository
// means "not looked for", not "no dependencies" — the UI must not let those
// read the same.
export function archUnitsNotice(projection) {
  if (projection.edges.length) return "";
  return "No dependencies were observed. Dependency extraction currently reads Python imports only, " +
    "so a repository in another language shows units without edges.";
}

export function renderArchUnitsOutline({ projection, subsystemsById, byId, query, expandedId, changedElements }) {
  const name = (unitId) => unitDisplayName(unitId, subsystemsById);
  const units = projection.units.filter((unit) => unitMatchesQuery(unit, query, subsystemsById, byId));

  const masterHtml = units.length
    ? units.map((unit) => {
      const selected = expandedId === unit.id;
      const changed = unit.memberElementIds.some((id) => changedElements.has(id));
      return `<article class="card${selected ? " selected open" : ""}">` +
        `<button class="card-head" data-expand="${esc(unit.id)}" aria-expanded="${selected}">` +
        `<span class="card-title"><strong>${esc(name(unit.id))}</strong>` +
        `<small>${esc(unitSummaryLine(unit))}</small></span>` +
        `${changed ? `<span class="change-badge">changed</span>` : ""}` +
        `<span class="chevron">›</span></button></article>`;
    }).join("")
    : `<div class="empty-state"><span class="empty-text">` +
      `${esc(query ? "No unit matches this search." : "No architectural units were observed in this repository.")}` +
      `</span></div>`;

  const unit = projection.units.find((item) => item.id === expandedId);
  return { masterHtml, detailHtml: unit ? unitDetail(unit, projection, name, byId) : "", matchCount: units.length };
}

function unitDetail(unit, projection, name, byId) {
  const edgeCount = (fromUnitId, toUnitId) => projection.edges
    .find((edge) => edge.fromUnitId === fromUnitId && edge.toUnitId === toUnitId)?.edgeCount ?? 0;

  const edgeList = (unitIds, countFor) => `<ul class="unit-edges">` + unitIds.map((id) => {
    const count = countFor(id);
    return `<li><span class="unit-edge-name">${esc(name(id))}</span>` +
      `<span class="unit-edge-count">${count} ${count === 1 ? "reference" : "references"}</span></li>`;
  }).join("") + `</ul>`;

  const sections = [];
  if (unit.outboundUnitIds.length) {
    sections.push(`<section class="detail-section"><h2>Depends on</h2>` +
      edgeList(unit.outboundUnitIds, (id) => edgeCount(unit.id, id)) + `</section>`);
  }
  if (unit.inboundUnitIds.length) {
    sections.push(`<section class="detail-section"><h2>Used by</h2>` +
      edgeList(unit.inboundUnitIds, (id) => edgeCount(id, unit.id)) + `</section>`);
  }
  if (!sections.length) {
    sections.push(`<section class="detail-section">` +
      `<p class="empty-copy">No dependencies were observed for this unit, in either direction.</p></section>`);
  }

  const members = unit.memberElementIds.map((id) => byId.get(id)).filter(Boolean);
  sections.push(`<section class="detail-section"><h2>Parts</h2>` +
    (members.length
      ? `<ul class="unit-members">` + members.map((member) =>
        `<li><strong>${esc(member.name)}</strong><small>${esc(member.kind ?? "")}</small></li>`).join("") + `</ul>`
      : `<p class="empty-copy">No resolved parts.</p>`) +
    `</section>`);

  return `<div class="detail-content">` +
    `<header class="detail-header"><div class="detail-title-wrap">` +
    `<h1 class="detail-title">${esc(name(unit.id))}</h1>` +
    `<span class="detail-role">Architectural unit</span>` +
    `</div></header>` + sections.join("") + `</div>`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/ui/arch-units-view.test.js`
Expected: PASS, 19 tests.

- [ ] **Step 5: Add the styles**

Append to the end of `src/ui/styles.css`:

```css
/* Arch-unit detail: dependency lists read as rows of name + observed count. */
.unit-edges,
.unit-members {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.unit-edges li,
.unit-members li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 10px;
  border-radius: 6px;
  background: var(--surface-2, rgba(127, 127, 127, 0.06));
}

.unit-edge-name {
  font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12.5px;
  overflow-wrap: anywhere;
}

.unit-edge-count,
.unit-members small {
  font-size: 11.5px;
  opacity: 0.66;
  white-space: nowrap;
}
```

Check that `--surface-2` and `--mono` exist in this file's `:root` block before relying on them. Both declarations above carry fallbacks, so an absent variable degrades rather than breaks — but if the codebase already defines equivalents under different names, use those instead of introducing new ones.

- [ ] **Step 6: Commit**

```bash
git add src/ui/arch-units-view.js test/ui/arch-units-view.test.js src/ui/styles.css
git commit -m "feat(ui): render arch units with observed dependency edges

States the Python-only coverage limit explicitly rather than letting an empty
graph read as an absence of dependencies."
```

---

## Task 5: Wire the Units view into the dashboard

**Files:**
- Create: `src/ui/changes.js`
- Test: `test/ui/changes.test.js`
- Modify: `src/ui/app.js` (lines 1-4, 185, 188-197, 210-215, 289-335)

`collectChangedClaimIds` currently lives in `src/ui/observed-areas-view.js:139` but is a generic diff helper used by `app.js`. It moves first so Task 7 can delete that file cleanly.

- [ ] **Step 1: Write the failing test for the relocated helper**

Create `test/ui/changes.test.js`:

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import { collectChangedClaimIds } from "../../src/ui/changes.js";

test("collectChangedClaimIds returns an empty set for a missing diff", () => {
  assert.deepEqual(collectChangedClaimIds(undefined), new Set());
  assert.deepEqual(collectChangedClaimIds(null), new Set());
});

test("collectChangedClaimIds gathers claim ids across added, removed, and changed", () => {
  const ids = collectChangedClaimIds({
    claims: {
      added: [{ id: "claim:a" }],
      removed: [{ id: "claim:b" }],
      // A changed claim carries before/after; the id that matters for
      // highlighting is the one in the current model.
      changed: [{ before: { id: "claim:c-old" }, after: { id: "claim:c" } }],
    },
  });
  assert.deepEqual([...ids].sort(), ["claim:a", "claim:b", "claim:c"]);
});
```

Note the asymmetry: `added` and `removed` entries are claims, but a `changed` entry is a `{ before, after }` pair and the function reads `after.id`. This is existing behavior and must not change in the move.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ui/changes.test.js`
Expected: FAIL with `Cannot find module .../src/ui/changes.js`.

- [ ] **Step 3: Move the helper**

Create `src/ui/changes.js`:

```javascript
// Diff-derived change highlighting, shared by every view that marks what moved
// since the last snapshot. Kept separate from any one view so retiring a view
// does not strand it.

export function collectChangedClaimIds(diff) {
  const ids = new Set();
  if (!diff) return ids;
  for (const item of diff.claims.added) ids.add(item.id);
  for (const item of diff.claims.removed) ids.add(item.id);
  for (const item of diff.claims.changed) ids.add(item.after.id);
  return ids;
}
```

That is a byte-for-byte move of `src/ui/observed-areas-view.js:139-146`. Now delete lines 139-146 from `src/ui/observed-areas-view.js`.

Run `grep -n collectChangedClaimIds src/ui/observed-areas-view.js` afterwards. Expected: no output — nothing else in that file calls it, so no back-import is needed. If there is output, add `import { collectChangedClaimIds } from "./changes.js";` to that file; it is deleted in Task 7 regardless.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/ui/changes.test.js`
Expected: PASS, 2 tests.

- [ ] **Step 5: Repoint app.js imports**

In `src/ui/app.js`, replace lines 1-4:

```javascript
import {
  collectChangedClaimIds,
  renderObservedAreasOutline,
} from "./observed-areas-view.js";
```

with:

```javascript
import { collectChangedClaimIds } from "./changes.js";
import { archUnitsNotice, renderArchUnitsOutline } from "./arch-units-view.js";
```

- [ ] **Step 6: Replace the dead view function**

In `src/ui/app.js`, replace the entire `renderObservedAreas` function (from `function renderObservedAreas() {` at line 289 through its closing brace at line 335, immediately before the `// Importing is the path that always works` comment) with:

```javascript
function renderArchUnits() {
  const projection = scanData.projections?.archUnits;
  if (!projection) return renderEmpty("This scan does not include architectural units yet");
  const { byId } = indexes();
  const subsystemsById = new Map((scanData.model.subsystems ?? []).map((item) => [item.id, item]));
  const query = el.search.value.toLowerCase().trim();
  showSearch("Find a unit or one of its parts...");

  const rendered = renderArchUnitsOutline({
    projection,
    subsystemsById,
    byId,
    query,
    expandedId,
    changedElements: changedIds(),
  });

  const notice = archUnitsNotice(projection);
  const noticeHtml = notice ? `<p class="baseline-note">${esc(notice)}</p>` : "";

  el.searchCount.textContent = query ? `${rendered.matchCount} matches` : "";

  renderPanes(
    renderMapModes() + noticeHtml + renderViewSplit(rendered.masterHtml, rendered.detailHtml),
    "",
    { inlineExpand: true },
  );
  bindMapModes();
}
```

The `changesOnly` change-strip that the old function rendered is dropped: it counted changed *areas*, a concept that no longer exists in the payload. `changesOnly` remains in use by other views, so leave the variable alone.

- [ ] **Step 7: Repoint the render dispatcher and the map-mode label**

In `src/ui/app.js`, replace line 185:

```javascript
  else renderObservedAreas();
```

with:

```javascript
  else renderArchUnits();
```

Replace the `MAP_MODES` entry at line 211:

```javascript
  ["system", "Areas"],
```

with:

```javascript
  ["system", "Units"],
```

- [ ] **Step 8: Fix the topbar, which reports zeros on every screen**

Replace `renderTopbar` (`src/ui/app.js:188-197`) with:

```javascript
function renderTopbar() {
  const units = scanData?.projections?.archUnits?.units ?? [];
  const edges = scanData?.projections?.archUnits?.edges ?? [];
  const parts = units.reduce((sum, unit) => sum + unit.memberElementIds.length, 0);
  el.topbarStats.innerHTML =
    `<span class="stat-pill"><strong>${units.length}</strong> ${units.length === 1 ? "unit" : "units"}</span>` +
    `<span class="stat-pill"><strong>${parts}</strong> ${parts === 1 ? "part" : "parts"}</span>` +
    `<span class="stat-pill"><strong>${edges.length}</strong> ${edges.length === 1 ? "dependency" : "dependencies"}</span>`;
}
```

- [ ] **Step 9: Run the contract test from Task 2**

Run: `node --test test/server/ui-payload-contract.test.js`
Expected: PASS, 2 tests. `observedAreas` no longer appears in any `src/ui/*.js` file — except inside `observed-areas-view.js` itself, which Task 7 deletes. If it still fails naming `observedAreas`, that is why; either proceed to Task 7 before re-running, or confirm the only remaining reads are in that file.

- [ ] **Step 10: Run the full suite**

Run: `npm test 2>&1 | tail -10`
Expected: `# fail 0`, except for `test/ui/observed-areas-view.test.js` if the `collectChangedClaimIds` move broke its import. Fix that by deleting the now-invalid import from that test file — it is deleted entirely in Task 7 anyway.

- [ ] **Step 11: Verify in the running dashboard**

Run: `npm run start:example`

The example fixture is `test/fixtures/system-model-app`. Open the dashboard, click **Code map** in the sidebar, and confirm:
- the nav item renders a unit list instead of "This scan does not include observed areas yet";
- the mode tabs read `Units · Subjects · Capabilities · Everything`;
- the topbar shows non-zero units and parts;
- clicking a unit opens a detail pane with a **Parts** section.

If that fixture is not a Python project, the notice bar should appear and the dependency count should be 0. That is correct behavior, not a failure. To see real edges, run against the Python fixture instead:

```bash
node ./bin/varai.js start ./test/fixtures/arch-units/dependency-added --no-open
```

Expected there: 2 units, 1 dependency, and `app/orders.py` showing `Depends on → app/users.py · 1 reference`.

- [ ] **Step 12: Commit**

```bash
git add src/ui/app.js src/ui/changes.js src/ui/observed-areas-view.js test/ui/changes.test.js
git commit -m "fix(ui): repair the Code map and topbar against the current payload

ca0fb31 removed observedAreas from the server payload but left app.js reading
it, so the Code map rendered an empty state and the topbar reported zeros on
every screen. Both now read the arch-units projection."
```

---

## Task 6: Show real edges on a real repository

Fixtures prove the mechanism; they do not prove the surface is useful. This task is a judgement checkpoint, not a code change.

**Files:** none — this task produces a written finding.

- [ ] **Step 1: Run the dashboard against a real Python repository**

Pick a Python project of at least ~20 modules that you have locally. Run:

```bash
node ./bin/varai.js start /path/to/python/repo --no-open
```

- [ ] **Step 2: Record what the Units view shows**

Write down, in the plan's Notes section at the bottom of this file:
- unit count, part count, dependency count;
- whether the unit names (`module:<lexicographically smallest evidence file>`) are names a human would recognize as components;
- whether the edge list tells you anything you did not already know from the file tree.

- [ ] **Step 3: Answer the open question this surfaces**

The module-grain unit key is "the lexicographically smallest evidence file among an element's evidence" (`arch-units.js:114-121`). It is deterministic, but arbitrary — it is not a designated home. The open question, which Task 1's grain change makes concrete rather than settles:

**Is module grain the canonical arch-unit grain, or a stopgap until a package/component grouping exists that a human could seed a rule against?**

This matters because `depends_on` is now a seed relation (`src/seed/schema.js`) with capability `arch.dependency` (`src/reconciliation/schema.js:38`). A human writing "orders depends on users" in a seed needs to name a unit. If the unit identity is a lexicographic accident, the rule is unwritable by hand.

Record the answer as a note in this file. **Do not implement a new grain in this plan** — that is a separate spec, and it should be decided from what Step 2 actually showed, not in advance.

- [ ] **Step 4: Commit the findings**

```bash
git add docs/superpowers/plans/2026-07-27-arch-units-surface.md
git commit -m "docs: record arch-unit surface findings on a real repository"
```

---

## Task 7: Retire the unreachable view

The `observedAreas` projection module stays — `src/server/projections.js` says it may return as a witness. The 489-line *view* has no caller and no payload key, and git preserves it.

**Files:**
- Delete: `src/ui/observed-areas-view.js`
- Delete: `test/ui/observed-areas-view.test.js`

- [ ] **Step 1: Confirm nothing imports it**

Run: `grep -rn "observed-areas-view" src test`
Expected: matches only inside `src/ui/observed-areas-view.js` and `test/ui/observed-areas-view.test.js` themselves. If `src/ui/app.js` still appears, Task 5 Step 5 was not completed — go back and finish it before deleting anything.

- [ ] **Step 2: Delete both files**

```bash
git rm src/ui/observed-areas-view.js test/ui/observed-areas-view.test.js
```

- [ ] **Step 3: Run the full suite**

Run: `npm test 2>&1 | tail -10`
Expected: `# fail 0`. The total test count drops by however many tests `observed-areas-view.test.js` held, and rises by the ~30 added in this plan.

- [ ] **Step 4: Confirm the contract test is now fully green**

Run: `node --test test/server/ui-payload-contract.test.js`
Expected: PASS, 2 tests, with no `observedAreas` in the missing list.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(ui): retire the observed-areas view

The subject-axis projection was demoted from the payload in ca0fb31; this view
has had no caller since. The projection module itself stays importable — it may
return as a witness that checks injected bindings against observed structure."
```

---

## Task 8: Final verification

- [ ] **Step 1: Full suite green**

Run: `npm test 2>&1 | tail -10`
Expected: `# fail 0`.

- [ ] **Step 2: No stale projection reads anywhere**

Run: `grep -rn "observedAreas\|regionCandidates" src/ui`
Expected: no output.

- [ ] **Step 3: The dashboard opens and every nav item renders**

Run: `npm run start:example`

Click each of **Report**, **Spec**, **Code map**, **Changes**, and each Code map mode (**Units**, **Subjects**, **Capabilities**, **Everything**). None may render an error or an unexplained empty state. The Units view may legitimately show the Python-coverage notice.

- [ ] **Step 4: Update the status doc**

In `docs/roadmap.md`, under **What runs**, the "Map, snapshot, diff, dashboard" bullet currently makes no claim about architectural structure. Add to that section:

```markdown
- **Arch units.** Element→Element `depends_on` claims, lifted from imports and
  rolled up to module-grain units, are shown in the dashboard's Code map.
  Dependency extraction currently reads Python imports only, so units appear
  without edges in other languages — the surface says so rather than implying
  an absence of dependencies.
```

If Task 6 concluded that module grain is a stopgap, add a matching line under **What is unproven** stating that unit identity is not yet a name a human can seed a rule against.

- [ ] **Step 5: Commit**

```bash
git add docs/roadmap.md
git commit -m "docs: record arch units on the dashboard in Status & direction"
```

---

## Notes

### Task 6 — memsearch (`/home/gp/memsearch`, 37 `.py` files, `python-common` stack)

Scanned via `scanRepo` + `serializeProjections` (same payload the dashboard serves).

| Metric | Value |
|---|---|
| Grain | `module` |
| Units | **1** |
| Parts | **1** |
| Dependencies (edges) | **0** |

The sole unit is `module:pyproject.toml`, whose one part is the `python:memsearch` CLI command observed from `[project.scripts]`. No `.py` module became a unit because Varai only lifts Elements from framework extractors (FastAPI routes, SQLAlchemy models, Pydantic `BaseModel` schemas, etc.); memsearch is a plain CLI library with none of those. `collectPythonImports` still found **77** raw import edges, but every one failed `resolveDependencyEdges` (`depends-on-unresolved` diagnostic) — both endpoints must map to owning Elements with symbol evidence, and this repo has only the pyproject command.

**Unit names.** `module:pyproject.toml` is not a component a human would name in an architecture diagram; it is the project manifest. Even where module grain would roll up to `src/memsearch/cli.py`-style paths, those are file paths, not package or subsystem identities (`memsearch.core`, `embeddings`, …). A developer browsing the tree already knows those filenames.

**Edge list vs file tree.** The Units view adds nothing over the file tree here — zero edges. The tree already shows `cli.py` importing from `config.py`, `core.py`, etc.; the dashboard cannot surface that until plain Python modules (or another grain) become Elements. The empty graph is honest coverage, not proof of isolation.

### Open question: is module grain canonical, or a stopgap?

**Stopgap, not canonical.** Module grain is the right *serialization* choice today — it is the coarsest grouping at which observed import edges survive once Elements exist (Task 1 proved subsystem grain drops them). It is not yet a grain a human can seed a rule against: the unit key is the lexicographically smallest evidence file among an element's evidence, not a designated home or package name. Writing "orders depends on users" in a seed requires stable, intentional unit identity; `module:app/orders.py` is a deterministic accident, and on repos like memsearch there is often no module unit at all. Package/component grouping — something a human could name and reconcile — is still needed before `arch.dependency` seeds are writable by hand. Module grain remains useful for dashboard visualization on framework-heavy Python repos until that exists.
