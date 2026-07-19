# System Interface Presentation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the varai dashboard and `varai map` report from a flat analyzer inventory into a three-altitude system interface (subjects/screens → behaviors → source), per `docs/superpowers/specs/2026-07-19-dashboard-system-interface-design.md`.

**Architecture:** All semantic work lands in core (screen⊃surface `contains` claims from a new render-chain tracer, subject/screen tiering in `browseByThing`, one display-vocabulary module in `src/reporters/`). The server gains one read-only source-snippet endpoint and passes the vocabulary through. The UI (`src/ui/`) is rewritten as a pure consumer. Dependency direction stays strictly downward; the CLI report shows everything the dashboard shows.

**Tech Stack:** Node ≥20 ESM, `node:test` + `node:assert/strict`, tree-sitter via existing `ctx.tree()`, vanilla JS/CSS frontend (no build step).

**Verification model:** Core and server tasks are TDD with fixture-driven tests. The UI task (Task 6) has no DOM test harness (none exists in this repo); it is verified by server tests plus scripted `curl` checks and a manual checklist, and the final task validates end-to-end on Kalakar.

---

## Context for an engineer with zero varai background

- A **scan** (`scanRepo` in `src/scanners/index.js`) produces one canonical **System Model**: `{ system, subsystems, elements, claims, coverage, diagnostics }`. Elements have `kind` (e.g. `aggregate`, `entity`, `screen`, `surface`, `operation`, `action`, `contract`, `state`), `roles` (`resource` / `interface` / `behavior`), `evidence` (`[{file, line, symbol?}]`). Claims are `source –relation→ target` with `claimState` (`observed`/`inferred`/`unverified`/`ambiguous`) and optional ordered `implementationPath` (same shape as evidence).
- **Projections** (`src/system-model/projections/`) are pure functions over a validated model. `browseByThing` returns ranked roots; the dashboard and the markdown reporter both consume it.
- The **lift** (`src/scanners/lift/index.js`, `liftSystemModel`) converts private scanner observations/behaviors into the canonical model. UI screens come from `page` observations (React Router `<Route path="...">`); UI surfaces come from frontend `ui_action` behavior doors (`door.component`, `door.source`).
- Tests run with `node --test <file>` (or `npm test` for everything). Fixtures for the lift live in `test/fixtures/anchor-lift/{base,refactored,contract-changed}` — the three variants must stay semantically identical except for the intended difference (refactor = helper renames only; contract-changed = one public contract change), because `test/system-model/anchor-diff.test.js` diffs them.
- Commit after every task. Do not touch `EXTRACTOR_VERSION` (`src/scanners/cache.js`): no cached extractor output changes in this plan. Do bump `SYSTEM_MODEL_ANALYZER_VERSION` (Task 2) because the analyzer emits new claims.

---

### Task 1: Core display vocabulary module

The relation-label table currently exists in three copies (`src/reporters/system-model-markdown.js:3`, `src/reporters/diff-markdown.js:2`, `src/ui/app.js:7`). Create the single core owner and point both reporters at it (the UI copy dies in Task 6).

**Files:**
- Create: `src/reporters/display-language.js`
- Modify: `src/reporters/system-model-markdown.js:1-32`
- Modify: `src/reporters/diff-markdown.js:1-10`
- Test: `test/reporters/display-language.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/reporters/display-language.test.js
import assert from "node:assert/strict";
import test from "node:test";
import {
  RELATION_LABELS, KIND_LABELS, CLAIM_STATE_LABELS,
  kindLabel, claimStateLabel, displayLanguage,
} from "../../src/reporters/display-language.js";

test("display language covers every kernel relation and stays plain", () => {
  for (const relation of ["contains", "exposes", "offers", "triggered_by", "invokes",
    "accepts", "produces", "requires", "available_when", "reads", "changes", "creates",
    "removes", "succeeds_with", "fails_with", "navigates_to", "emits", "has_field",
    "relates_to", "stored_in"]) {
    assert.equal(typeof RELATION_LABELS[relation], "string", relation);
  }
  assert.equal(KIND_LABELS.aggregate, "in-memory model");
  assert.equal(KIND_LABELS.entity, "stored record");
  assert.equal(KIND_LABELS.contract, "data contract");
  assert.equal(KIND_LABELS.surface, "panel");
  assert.equal(kindLabel("operation"), "API operation");
  assert.equal(kindLabel("unmapped_kind"), "unmapped_kind");
  assert.equal(claimStateLabel("observed"), "");
  assert.equal(claimStateLabel("unverified"), "not verified");
  assert.equal(claimStateLabel("ambiguous"), "ambiguous — multiple candidates matched");
  const language = displayLanguage();
  assert.deepEqual(Object.keys(language).sort(), ["claimStates", "kinds", "relations"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/reporters/display-language.test.js`
Expected: FAIL — `Cannot find module .../src/reporters/display-language.js`

- [ ] **Step 3: Implement the module**

```js
// src/reporters/display-language.js
// The single owner of user-facing wording for kernel vocabulary. The markdown
// reporters import it directly; the server passes displayLanguage() to the UI.

export const RELATION_LABELS = Object.freeze({
  contains: "contains", exposes: "exposes", offers: "offers", triggered_by: "is triggered by",
  invokes: "invokes", accepts: "accepts", produces: "produces", requires: "requires",
  available_when: "is available when", reads: "reads", changes: "changes", creates: "creates",
  removes: "removes", succeeds_with: "succeeds with", fails_with: "fails with",
  navigates_to: "navigates to", emits: "emits", has_field: "has field",
  relates_to: "relates to", stored_in: "is stored in",
});

export const KIND_LABELS = Object.freeze({
  aggregate: "in-memory model", entity: "stored record", contract: "data contract",
  state: "UI state", screen: "screen", surface: "panel", component: "component",
  action: "action", operation: "API operation", command: "command", process: "service",
});

export const CLAIM_STATE_LABELS = Object.freeze({
  observed: "", inferred: "inferred",
  unverified: "not verified", ambiguous: "ambiguous — multiple candidates matched",
});

export function kindLabel(kind) {
  return KIND_LABELS[kind] ?? kind;
}

export function claimStateLabel(state) {
  return CLAIM_STATE_LABELS[state] ?? state;
}

export function displayLanguage() {
  return { relations: RELATION_LABELS, kinds: KIND_LABELS, claimStates: CLAIM_STATE_LABELS };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/reporters/display-language.test.js`
Expected: PASS

- [ ] **Step 5: Point both reporters at the module**

In `src/reporters/system-model-markdown.js`, delete the local `RELATION_LABELS` constant (lines 3–8) and add the import; change `claimSentence` to use the plain state label:

```js
import { browseByThing, browseByCapability } from "../system-model/projections/index.js";
import { RELATION_LABELS, claimStateLabel } from "./display-language.js";
```

```js
function claimSentence(claim, sourceName, byId) {
  const stateLabel = claimStateLabel(claim.claimState);
  const confidence = stateLabel ? ` [${stateLabel}]` : "";
  let target = targetLabel(claim.target, byId);
  if (claim.relation === "offers" && target.startsWith(`${sourceName} `)) target = target.slice(sourceName.length + 1);
  return `${sourceName} ${RELATION_LABELS[claim.relation] ?? claim.relation} ${target}${qualifierLabel(claim.qualifiers)}.${confidence}`;
}
```

In `src/reporters/diff-markdown.js`, delete its local `RELATIONS` constant (the object literal at the top containing `triggered_by: "is triggered by"`) and replace with:

```js
import { RELATION_LABELS as RELATIONS } from "./display-language.js";
```

- [ ] **Step 6: Run the full suite (existing tests may assert old bracket text)**

Run: `npm test`
Expected: PASS. If any test asserts a literal `[unverified]` or `[ambiguous]` in markdown output, update that assertion to the new plain label (`[not verified]`, `[ambiguous — multiple candidates matched]`) — the wording change is the point of this task.

- [ ] **Step 7: Commit**

```bash
git add src/reporters/display-language.js src/reporters/system-model-markdown.js src/reporters/diff-markdown.js test/reporters/display-language.test.js
git commit -m "feat: core-owned display vocabulary for relations, kinds, claim states"
```

---

### Task 2: Screen ⊃ surface containment (render-chain tracer + lift claims)

Emit `observed` `contains` claims from screens to the surfaces their render chain provably reaches. Mechanism: resolve each `<Route path=... element={<X/>}>` to its component file, then BFS over JSX-usage → resolved-import edges; a surface is contained when the walk renders its component from its defining file. No name or path guessing — unresolved surfaces simply stay unattached.

**Files:**
- Create: `test/fixtures/anchor-lift/base/src/App.tsx` (and identical copies under `refactored/` and `contract-changed/`)
- Create: `test/fixtures/anchor-lift/base/src/pages/PlanPage.tsx` (and identical copies under the other two variants)
- Create: `test/fixtures/anchor-lift/base/src/components/OrphanPanel.tsx` (and identical copies under the other two variants)
- Create: `src/scanners/frontend/render-graph.js`
- Modify: `src/scanners/index.js:167-232`
- Modify: `src/scanners/lift/index.js:93-98` and after the behaviors loop (~line 289)
- Modify: `src/system-model/version.js`
- Test: `test/scanners/render-containment.test.js`

- [ ] **Step 1: Add fixture frontend files (all three variants get identical copies)**

`test/fixtures/anchor-lift/base/src/App.tsx`:

```tsx
import { PlanPage } from "./pages/PlanPage";

export function App() {
  return <Route path="/plan" element={<PlanPage />} />;
}
```

`test/fixtures/anchor-lift/base/src/pages/PlanPage.tsx`:

```tsx
import { BuildingToolbar } from "../components/BuildingToolbar";

export function PlanPage() {
  return (
    <main>
      <BuildingToolbar />
    </main>
  );
}
```

`test/fixtures/anchor-lift/base/src/components/OrphanPanel.tsx` (a surface no screen renders):

```tsx
export function OrphanPanel() {
  const resetWalls = async () => {
    await fetch("/projects/{project_id}/building/walls", { method: "POST" });
  };
  return <button onClick={resetWalls}>Reset walls</button>;
}
```

Copy all three files unchanged into `test/fixtures/anchor-lift/refactored/src/...` and `test/fixtures/anchor-lift/contract-changed/src/...` — the variants must differ only in their intended Python-side changes, or `test/system-model/anchor-diff.test.js` will report spurious semantic diffs.

- [ ] **Step 2: Write the failing test**

```js
// test/scanners/render-containment.test.js
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";

async function scan() {
  return (await scanRepo(path.resolve("test/fixtures/anchor-lift/base"), {
    jobs: 1, cache: false, systemName: "anchor-lift-fixture",
  })).model;
}

test("screens contain the surfaces their render chain reaches", async () => {
  const model = await scan();
  const byId = new Map(model.elements.map((item) => [item.id, item]));
  const screen = model.elements.find((item) => item.kind === "screen" && item.name === "/plan");
  assert.ok(screen, "route /plan becomes a screen element");
  const contains = model.claims.filter((claim) =>
    claim.sourceId === screen.id && claim.relation === "contains" && claim.target.kind === "reference");
  const targets = contains.map((claim) => byId.get(claim.target.id)?.name);
  assert.ok(targets.includes("BuildingToolbar"), `expected BuildingToolbar in ${JSON.stringify(targets)}`);
  assert.ok(contains.every((claim) => claim.claimState === "observed"));
  assert.ok(contains.every((claim) => claim.evidence.length > 0));
});

test("surfaces outside any resolved render chain stay unattached", async () => {
  const model = await scan();
  const byId = new Map(model.elements.map((item) => [item.id, item]));
  const orphan = model.elements.find((item) => item.kind === "surface" && item.name === "OrphanPanel");
  assert.ok(orphan, "OrphanPanel is still promoted as a surface");
  const contained = model.claims.some((claim) => claim.relation === "contains" &&
    claim.target.kind === "reference" && claim.target.id === orphan.id &&
    byId.get(claim.sourceId)?.kind === "screen");
  assert.equal(contained, false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/scanners/render-containment.test.js`
Expected: FAIL — first test finds `/plan` screen (the new App.tsx Route is picked up by the existing react-vite extractor) but `contains` claims list is empty.

- [ ] **Step 4: Implement the render-chain tracer**

```js
// src/scanners/frontend/render-graph.js
// Deterministic screen -> surface containment. A surface is contained by a
// screen only when a JSX-usage/import chain from the route's rendered
// component provably reaches the surface's defining file. Unresolvable
// chains produce nothing; they never fall back to name or path matching.
import path from "node:path";

const LANG_FOR_EXT = { ".js": "javascript", ".jsx": "javascript", ".ts": "tsx", ".tsx": "tsx" };
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

function resolveImport(fromFile, specifier, fileSet) {
  if (!specifier.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  const candidates = [base,
    ...EXTENSIONS.map((ext) => base + ext),
    ...EXTENSIONS.map((ext) => path.posix.join(base, `index${ext}`))];
  return candidates.find((candidate) => fileSet.has(candidate)) ?? null;
}

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

async function parseFrontendFiles(files, ctx) {
  const fileSet = new Set(files);
  const parsed = new Map();
  for (const file of files) {
    const lang = LANG_FOR_EXT[path.extname(file)];
    if (!lang) continue;
    const tree = await ctx.tree(file, lang);
    if (!tree) continue;
    const imports = new Map();
    const jsxUses = [];
    walk(tree.rootNode, (node) => {
      if (node.type === "import_statement") {
        const sourceNode = node.childForFieldName("source");
        const target = sourceNode ? resolveImport(file, sourceNode.text.slice(1, -1), fileSet) : null;
        if (!target) return;
        walk(node, (child) => {
          if (child.type === "import_specifier") {
            const name = child.childForFieldName("name")?.text;
            const alias = child.childForFieldName("alias")?.text ?? name;
            if (name) imports.set(alias, target);
          }
          if (child.type === "import_clause" && child.firstChild?.type === "identifier") {
            imports.set(child.firstChild.text, target);
          }
        });
      }
      if (node.type === "jsx_opening_element" || node.type === "jsx_self_closing_element") {
        const name = node.childForFieldName("name")?.text;
        if (name && /^[A-Z]/.test(name)) {
          jsxUses.push({ name, line: node.startPosition.row + 1, start: node.startIndex, end: node.endIndex });
        }
      }
    });
    parsed.set(file, { imports, jsxUses });
  }
  return parsed;
}

export async function traceScreenContainment(files, ctx, pageObservations, surfaces) {
  const parsed = await parseFrontendFiles(files, ctx);
  const surfaceIndex = new Map(surfaces.map((item) => [`${item.file} ${item.component}`, item]));
  const found = new Map();

  for (const page of pageObservations) {
    const routeFile = page.evidence?.[0]?.file;
    const routeLine = page.evidence?.[0]?.line;
    const routeInfo = parsed.get(routeFile);
    if (!routeInfo || !routeLine) continue;

    const routeNode = routeInfo.jsxUses.find((use) => use.name === "Route" && use.line === routeLine);
    if (!routeNode) continue;
    const rendered = routeInfo.jsxUses.find((use) => use.name !== "Route" &&
      use.start > routeNode.start && use.end <= routeNode.end);
    if (!rendered) continue;
    // Rendered component resolved through the route file's imports, falling
    // back to the route file itself when the component is defined locally.
    const startFile = routeInfo.imports.get(rendered.name) ?? routeFile;

    const queue = [startFile];
    const visited = new Set(queue);
    while (queue.length) {
      const current = queue.shift();
      const info = parsed.get(current);
      if (!info) continue;
      for (const use of info.jsxUses) {
        const definingFile = info.imports.get(use.name) ?? current;
        const surface = surfaceIndex.get(`${definingFile} ${use.name}`);
        if (surface) {
          const key = `${page.name} ${use.name}`;
          const entry = found.get(key) ?? { screen: String(page.name), surfaceKey: use.name, evidence: [] };
          if (!entry.evidence.some((item) => item.file === current && item.line === use.line)) {
            entry.evidence.push({ file: current, line: use.line });
          }
          found.set(key, entry);
        }
        const next = info.imports.get(use.name);
        if (next && !visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
  }

  return [...found.values()]
    .map((entry) => ({ ...entry, evidence: [...entry.evidence].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line) }))
    .sort((a, b) => a.screen.localeCompare(b.screen) || a.surfaceKey.localeCompare(b.surfaceKey));
}
```

- [ ] **Step 5: Wire the tracer into the scan**

In `src/scanners/index.js`, add the import at the top with the other frontend import:

```js
import { traceScreenContainment } from "./frontend/render-graph.js";
```

After the `frontendBehaviors` block (after line ~178, still inside `scanRepo`), add:

```js
  let screenContainment = [];
  if (stacks.has("react-vite")) {
    try {
      const surfaces = frontendBehaviors
        .filter((behavior) => behavior.door?.kind === "ui_action")
        .map((behavior) => ({ component: String(behavior.door.component), file: behavior.door.source }));
      screenContainment = await traceScreenContainment(
        files, ctx, observations.filter((item) => item.kind === "page"), surfaces);
    } catch (err) {
      diagnostics.push({
        code: "screen-containment-failed", severity: "warning", message: err.message,
        claimState: "unverified", capability: "ui.containment",
      });
    }
  }
```

And pass it to the lift (the existing call, ~line 225):

```js
  const model = liftSystemModel({
    observations,
    behaviors: bindings.behaviors,
    registry,
    convergence: bindings.convergence,
    containment: screenContainment,
    diagnostics,
    scanContext,
  }, { repoPath, systemName: options.systemName });
```

- [ ] **Step 6: Emit the claims in the lift**

In `src/scanners/lift/index.js`, add `containment = []` to the destructured parameter:

```js
export function liftSystemModel({ observations, behaviors, registry, convergence, containment = [], diagnostics = [], scanContext }, options = {}) {
```

After the `for (const behavior of behaviors) { ... }` loop ends (immediately before the `finalDiagnostics` block), add:

```js
  const surfaceKeys = new Set(behaviors
    .filter((item) => item.door?.kind === "ui_action")
    .map((item) => String(item.door.component)));
  const screenKeys = new Set(observations
    .filter((item) => item.kind === "page")
    .map((item) => String(item.name)));
  for (const entry of containment) {
    if (!surfaceKeys.has(entry.surfaceKey) || !screenKeys.has(entry.screen)) continue;
    addClaim({
      source: source("ui", "screen", entry.screen),
      relation: "contains",
      target: reference("ui", "surface", entry.surfaceKey),
      slot: `contains:surface:${entry.surfaceKey}`,
      evidence: entry.evidence,
      capability: "ui.containment",
      observationMethod: "ast",
    });
  }
```

- [ ] **Step 7: Bump the analyzer version**

In `src/system-model/version.js`:

```js
export const SYSTEM_MODEL_ANALYZER_VERSION = "0.4.0";
```

(Schema is unchanged — `contains` is existing kernel vocabulary — so `SYSTEM_MODEL_SCHEMA_VERSION` stays `2`. Existing snapshots keep diffing, with the analyzer-changed warning.)

- [ ] **Step 8: Run the new test, then the full suite**

Run: `node --test test/scanners/render-containment.test.js`
Expected: PASS (both tests).

Run: `npm test`
Expected: PASS. If `test/system-model/anchor-diff.test.js` fails with unexpected semantic changes, the fixture variants are out of sync — re-copy the three `.tsx` files identically into `refactored/` and `contract-changed/`.

- [ ] **Step 9: Commit**

```bash
git add src/scanners/frontend/render-graph.js src/scanners/index.js src/scanners/lift/index.js src/system-model/version.js test/scanners/render-containment.test.js test/fixtures/anchor-lift
git commit -m "feat: screens contain surfaces via resolved render chains"
```

---

### Task 3: Projection — subjects tier, screens nest surfaces, honest unplaced group

Rework `browseByThing` tiers to match the spec: tier 0 = subjects (`aggregate`/`entity`, ranked by behavior count), tier 1 = screens (with `surfaceIds`, screens before unplaced surfaces), tier 2 = everything else (contracts, state, other resources). Contained surfaces stop being roots; their offered behaviors roll up into their screen.

**Files:**
- Modify: `src/system-model/projections/browse-by-thing.js` (full rewrite below)
- Test: `test/system-model/anchor-projection.test.js` (extend)

- [ ] **Step 1: Write the failing test (append to the existing file)**

```js
test("subjects are tier 0, screens nest surfaces, unplaced surfaces stay honest", async () => {
  const value = await model();
  const projection = browseByThing(value);
  const byId = new Map(value.elements.map((item) => [item.id, item]));

  for (const root of projection.roots) {
    const kind = byId.get(root.elementId)?.kind;
    if (["aggregate", "entity"].includes(kind)) assert.equal(root.tier, 0, `${kind} must be tier 0`);
    if (["screen", "surface"].includes(kind)) assert.equal(root.tier, 1, `${kind} must be tier 1`);
    if (["contract", "state"].includes(kind)) assert.equal(root.tier, 2, `${kind} must be tier 2`);
  }

  const screenRoot = projection.roots.find((item) => byId.get(item.elementId)?.name === "/plan");
  assert.ok(screenRoot, "screen /plan is a root");
  assert.ok(screenRoot.surfaceIds.some((id) => byId.get(id)?.name === "BuildingToolbar"));
  assert.ok(screenRoot.behaviorIds.length >= 1, "screen inherits its surfaces' offered behaviors");
  assert.ok(!projection.roots.some((item) => byId.get(item.elementId)?.name === "BuildingToolbar"),
    "contained surfaces are not roots");

  const orphanRoot = projection.roots.find((item) => byId.get(item.elementId)?.name === "OrphanPanel");
  assert.ok(orphanRoot, "unplaced surfaces remain roots");
  assert.equal(orphanRoot.tier, 1);
  assert.ok(projection.diagnostics.some((item) =>
    item.code === "surface-not-placed" && item.elementId === orphanRoot.elementId));

  const tierOne = projection.roots.filter((item) => item.tier === 1);
  const firstSurfaceIndex = tierOne.findIndex((item) => byId.get(item.elementId)?.kind === "surface");
  const lastScreenIndex = tierOne.map((item) => byId.get(item.elementId)?.kind).lastIndexOf("screen");
  if (firstSurfaceIndex >= 0) assert.ok(lastScreenIndex < firstSurfaceIndex, "screens sort before unplaced surfaces");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/system-model/anchor-projection.test.js`
Expected: FAIL — current projection has no `surfaceIds`, contract roots are tier 2 but aggregates with effects are tier 0 only via effect-claims, and `BuildingToolbar` is still a root.

- [ ] **Step 3: Rewrite the projection**

Replace the body of `src/system-model/projections/browse-by-thing.js` with:

```js
import { validateSystemModel } from "../validate.js";
import { EFFECT_RELATIONS, indexModel, interfacesForBehavior } from "./shared.js";

const SUBJECT_KINDS = new Set(["aggregate", "entity"]);

function tierRank(element) {
  if (SUBJECT_KINDS.has(element.kind)) return 0;
  if (element.kind === "screen" || element.kind === "surface") return 1;
  return 2;
}

// Within tier 1, screens come before unplaced surfaces.
function kindRank(element) {
  return element.kind === "surface" ? 1 : 0;
}

export function browseByThing(model) {
  validateSystemModel(model);
  const index = indexModel(model);
  const roots = [];
  const diagnostics = [];

  const containedSurfaceIds = new Set();
  for (const claim of model.claims) {
    if (claim.relation !== "contains" || claim.target.kind !== "reference") continue;
    if (index.elements.get(claim.sourceId)?.kind !== "screen") continue;
    if (index.elements.get(claim.target.id)?.kind !== "surface") continue;
    containedSurfaceIds.add(claim.target.id);
  }

  for (const element of model.elements) {
    const isUiSurface = element.roles.includes("interface") && ["screen", "surface"].includes(element.kind);
    if (!element.roles.includes("resource") && !isUiSurface) continue;
    if (element.kind === "surface" && containedSurfaceIds.has(element.id)) continue;

    const incoming = index.incoming.get(element.id) ?? [];
    const outgoing = index.outgoing.get(element.id) ?? [];
    const effectClaims = incoming.filter((claim) => EFFECT_RELATIONS.has(claim.relation));
    const behaviorIds = new Set(effectClaims.map((claim) => claim.sourceId)
      .filter((id) => index.elements.get(id)?.roles.includes("behavior")));

    const surfaceIds = new Set();
    if (element.kind === "screen") {
      for (const claim of outgoing) {
        if (claim.relation !== "contains" || claim.target.kind !== "reference") continue;
        const surface = index.elements.get(claim.target.id);
        if (surface?.kind !== "surface") continue;
        surfaceIds.add(surface.id);
        for (const offered of index.outgoing.get(surface.id) ?? []) {
          if (offered.relation === "offers" && offered.target.kind === "reference") behaviorIds.add(offered.target.id);
        }
      }
    }
    if (isUiSurface) {
      for (const claim of outgoing) {
        if (claim.relation === "offers" && claim.target.kind === "reference") behaviorIds.add(claim.target.id);
      }
    }

    const interfaceIds = new Set();
    for (const id of behaviorIds) {
      const behavior = index.elements.get(id);
      if (behavior) for (const interfaceId of interfacesForBehavior(behavior, index)) interfaceIds.add(interfaceId);
    }
    if (isUiSurface) interfaceIds.add(element.id);

    roots.push({
      elementId: element.id,
      tier: tierRank(element),
      behaviorIds: [...behaviorIds].sort(),
      surfaceIds: [...surfaceIds].sort(),
      interfaceIds: [...interfaceIds].sort(),
      claimIds: [...new Set([...effectClaims, ...outgoing.filter((claim) => ["offers", "contains"].includes(claim.relation))]
        .map((claim) => claim.id))].sort(),
    });

    if (element.kind === "surface") diagnostics.push({ code: "surface-not-placed", elementId: element.id });
    else if (!behaviorIds.size && element.kind !== "contract") diagnostics.push({
      code: "resource-without-known-behavior",
      elementId: element.id,
    });
  }

  roots.sort((a, b) => a.tier - b.tier ||
    kindRank(index.elements.get(a.elementId)) - kindRank(index.elements.get(b.elementId)) ||
    b.behaviorIds.length - a.behaviorIds.length ||
    a.elementId.localeCompare(b.elementId));
  return {
    kind: "browse-by-thing",
    roots,
    diagnostics: diagnostics.sort((a, b) => a.elementId.localeCompare(b.elementId) || a.code.localeCompare(b.code)),
  };
}
```

- [ ] **Step 4: Run the projection tests, then the full suite**

Run: `node --test test/system-model/anchor-projection.test.js`
Expected: PASS (all tests including the pre-existing three — `BuildingDocument` is an aggregate, so it stays the top root).

Run: `npm test`
Expected: PASS. `test/system-model/projection.test.js` and `test/map.test.js` exercise the old tier semantics — update any assertion that hardcodes the old tier numbers (`0` for interacted contract-less resources, `2` for contracts) to the new kind-based tiers.

- [ ] **Step 5: Commit**

```bash
git add src/system-model/projections/browse-by-thing.js test/system-model/anchor-projection.test.js
git commit -m "feat: tier projection by subject/screen/detail and nest surfaces under screens"
```

---

### Task 4: Reporter parity — subjects-first markdown

`varai map` must tell the same story as the dashboard: subjects, then screens with nested panels, then a one-line pointer to the rest, coverage in plain language.

**Files:**
- Modify: `src/reporters/system-model-markdown.js` (renderSystemModel rewritten below; keep the existing helpers `evidenceLabel`, `targetLabel`, `qualifierLabel`, `claimSentence`, `pathLabel`)
- Test: `test/system-model/renderer.test.js` (extend)

- [ ] **Step 1: Write the failing test (append)**

```js
test("map report is subjects-first with screens nesting panels", async () => {
  const scan = await scanRepo(path.resolve("test/fixtures/anchor-lift/base"), { jobs: 1, cache: false });
  const output = renderSystemModel({ model: scan.model });
  assert.match(output, /## Subjects/);
  assert.match(output, /### BuildingDocument/);
  assert.match(output, /_in-memory model_/);
  assert.match(output, /## Screens/);
  assert.match(output, /### \/plan/);
  assert.match(output, /BuildingToolbar/);
  assert.match(output, /Not placed on a screen/);
  assert.match(output, /OrphanPanel/);
  assert.match(output, /## What varai couldn't determine/);
  assert.ok(output.indexOf("## Subjects") < output.indexOf("## Screens"));
  assert.ok(output.indexOf("### BuildingDocument") < output.indexOf("## Screens"));
  assert.doesNotMatch(output, /## Browse by thing/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/system-model/renderer.test.js`
Expected: FAIL — output still uses "Browse by thing" and flat roots.

- [ ] **Step 3: Rewrite `renderSystemModel`**

Replace the exported function in `src/reporters/system-model-markdown.js` (helpers above it stay; add `kindLabel` to the display-language import):

```js
import { RELATION_LABELS, claimStateLabel, kindLabel } from "./display-language.js";
```

```js
export function renderSystemModel({ model }) {
  const thingView = browseByThing(model);
  const capabilityView = browseByCapability(model);
  const byId = new Map([
    [model.system.id, model.system],
    ...model.subsystems.map((item) => [item.id, item]),
    ...model.elements.map((item) => [item.id, item]),
    ...model.claims.map((item) => [item.id, item]),
  ]);
  const claimsBySource = new Map();
  for (const claim of model.claims) {
    const list = claimsBySource.get(claim.sourceId) ?? [];
    list.push(claim);
    claimsBySource.set(claim.sourceId, list);
  }

  const subjects = thingView.roots.filter((root) => root.tier === 0);
  const screens = thingView.roots.filter((root) => root.tier === 1 && byId.get(root.elementId)?.kind === "screen");
  const unplaced = thingView.roots.filter((root) => root.tier === 1 && byId.get(root.elementId)?.kind === "surface");
  const detail = thingView.roots.filter((root) => root.tier === 2);

  function behaviorLines(root, lines, indent = "") {
    if (!root.behaviorIds.length) lines.push(`${indent}- No connected behavior recovered within current coverage.`);
    for (const behaviorId of root.behaviorIds) {
      const behavior = byId.get(behaviorId);
      const interfaces = root.interfaceIds.map((id) => byId.get(id)).filter(Boolean)
        .filter((item) => item.id === behavior.id ||
          (claimsBySource.get(item.id) ?? []).some((claim) => claim.relation === "offers" && claim.target.id === behavior.id));
      lines.push(`${indent}- **${behavior.name}**${interfaces.length ? ` — reached through ${interfaces.map((item) => item.name).join(", ")}` : ""}`);
      for (const claim of claimsBySource.get(behavior.id) ?? []) {
        lines.push(`${indent}  - ${claimSentence(claim, behavior.name, byId)} — ${evidenceLabel(claim.evidence)}`);
        const trace = pathLabel(claim.implementationPath);
        if (trace) lines.push(`${indent}    - Implementation: ${trace}`);
      }
    }
  }

  const lines = [
    `# ${model.system.name}`,
    "",
    `${subjects.length} subjects · ${screens.length} screens · ${capabilityView.capabilities.length} observed behaviors`,
    "",
    "## Subjects",
    "",
  ];

  if (!subjects.length) lines.push("No system subjects were recovered.", "");
  for (const root of subjects) {
    const element = byId.get(root.elementId);
    lines.push(`### ${element.name}`, "", `_${kindLabel(element.kind)}_`, "");
    behaviorLines(root, lines);
    lines.push(`- Evidence: ${evidenceLabel(element.evidence)}`, "");
  }

  lines.push("## Screens", "");
  if (!screens.length) lines.push("No screens were recovered.", "");
  for (const root of screens) {
    const element = byId.get(root.elementId);
    lines.push(`### ${element.name}`, "");
    for (const surfaceId of root.surfaceIds) {
      const surface = byId.get(surfaceId);
      lines.push(`- **${surface.name}** (${kindLabel(surface.kind)})`);
      for (const claim of claimsBySource.get(surfaceId) ?? []) {
        if (claim.relation !== "offers" || claim.target.kind !== "reference") continue;
        const action = byId.get(claim.target.id);
        if (action) lines.push(`  - offers ${action.name}`);
      }
    }
    if (!root.surfaceIds.length) lines.push("- No panels were resolved into this screen.");
    lines.push("");
  }
  if (unplaced.length) {
    lines.push("### Not placed on a screen", "");
    for (const root of unplaced) {
      const element = byId.get(root.elementId);
      lines.push(`- **${element.name}** (${kindLabel(element.kind)}) — render chain unresolved`);
      behaviorLines(root, lines, "  ");
    }
    lines.push("");
  }

  if (detail.length) {
    lines.push(`_${detail.length} further elements (data contracts, UI state, internal records) are available through structured model output and dashboard search._`, "");
  }

  lines.push("## Capabilities", "");
  for (const item of capabilityView.capabilities) {
    const behavior = byId.get(item.behaviorId);
    const resources = item.resourceIds.map((id) => byId.get(id)?.name).filter(Boolean);
    const interfaces = item.interfaceIds.map((id) => byId.get(id)?.name).filter(Boolean);
    lines.push(`- **${behavior.name}**${resources.length ? ` — acts on ${resources.join(", ")}` : ""}${interfaces.length ? ` — via ${interfaces.join(", ")}` : ""}`);
  }
  if (!capabilityView.capabilities.length) lines.push("No supported behaviors were recovered.");
  lines.push("", "## What varai couldn't determine", "");

  if (!model.coverage.length) lines.push("Nothing was declared out of reach.", "");
  else for (const item of model.coverage) {
    const scope = byId.get(item.scopeId)?.name ?? item.scopeId;
    const detailText = item.details.length ? ` — ${item.details.join("; ")}` : "";
    lines.push(`- ${item.capability} (${scope}): **${item.state}**${detailText}`);
  }

  if (model.diagnostics.length) {
    lines.push("", "## Analysis diagnostics", "");
    for (const item of model.diagnostics) lines.push(`- **${item.severity}** ${item.message} — ${evidenceLabel(item.evidence)}`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
```

- [ ] **Step 4: Run renderer tests, then the full suite**

Run: `node --test test/system-model/renderer.test.js`
Expected: PASS, including the pre-existing test — its assertions (`CreateProjectModal offers Dismiss`, `ui.availability (UI): **partial**`) still hold: unplaced-surface behavior lines and the coverage line format are preserved. The `## Analyzer coverage` heading changed to `## What varai couldn't determine`; if any test asserts the old heading, update it.

Run: `npm test`
Expected: PASS (fix any `test/map.test.js` assertions that reference "Browse by thing" / "System overview" headings the same way).

- [ ] **Step 5: Commit**

```bash
git add src/reporters/system-model-markdown.js test/system-model/renderer.test.js
git commit -m "feat: subjects-first map report with screens nesting panels"
```

---

### Task 5: Server — source snippet endpoint and vocabulary passthrough

**Files:**
- Create: `src/server/source.js`
- Modify: `src/server/index.js:82-116` (payload) and the request handler (~line 130)
- Test: `test/server/source.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/server/source.test.js
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readSourceSnippet } from "../../src/server/source.js";

const repo = path.resolve("test/fixtures/anchor-lift/base");

test("returns the focus line with surrounding context", () => {
  const snippet = readSourceSnippet(repo, "src/components/BuildingToolbar.tsx", 2);
  assert.equal(snippet.file, "src/components/BuildingToolbar.tsx");
  assert.equal(snippet.focusLine, 2);
  assert.equal(snippet.startLine, 1);
  assert.ok(snippet.lines.length >= 3);
  assert.ok(snippet.lines.some((line) => line.includes("deleteStorey")));
});

test("clamps an out-of-range line instead of failing", () => {
  const snippet = readSourceSnippet(repo, "src/components/BuildingToolbar.tsx", 9999);
  assert.ok(snippet.focusLine <= snippet.startLine + snippet.lines.length - 1);
});

test("rejects paths that escape the repository root", () => {
  assert.throws(() => readSourceSnippet(repo, "../../../package.json", 1));
  assert.throws(() => readSourceSnippet(repo, "/etc/hostname", 1));
});

test("rejects missing files", () => {
  assert.throws(() => readSourceSnippet(repo, "src/nope.tsx", 1));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/server/source.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the snippet reader**

```js
// src/server/source.js
// Read-only source peek for the dashboard. Strictly confined to the scanned
// repository: realpath containment check defeats traversal and symlink escape.
import fs from "node:fs";
import path from "node:path";

const CONTEXT_LINES = 10;

export function readSourceSnippet(repoRoot, relativeFile, line) {
  const root = fs.realpathSync(path.resolve(repoRoot));
  const requested = path.resolve(root, String(relativeFile));
  const real = fs.realpathSync(requested);
  if (real !== root && !real.startsWith(root + path.sep)) {
    throw new Error("Path escapes repository root");
  }
  const content = fs.readFileSync(real, "utf8").split("\n");
  const focusLine = Math.min(Math.max(1, Number(line) || 1), content.length);
  const startLine = Math.max(1, focusLine - CONTEXT_LINES);
  const endLine = Math.min(content.length, focusLine + CONTEXT_LINES);
  return { file: String(relativeFile), focusLine, startLine, lines: content.slice(startLine - 1, endLine) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/server/source.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the endpoint and the vocabulary into the server**

In `src/server/index.js`, add imports:

```js
import { readSourceSnippet } from "./source.js";
import { displayLanguage } from "../reporters/display-language.js";
```

In `runScan`, extend the payload:

```js
      latestScan = {
        ...current.scan,
        displayLanguage: displayLanguage(),
        projections: {
          things: browseByThing(current.scan.model),
          capabilities: browseByCapability(current.scan.model),
        },
      };
```

In the request handler, before the `/api/snapshots` branch:

```js
    if (url.pathname === "/api/source") {
      try {
        serveJSON(res, readSourceSnippet(absRepo, url.searchParams.get("file") ?? "", url.searchParams.get("line")));
      } catch {
        res.writeHead(404);
        res.end("Not Found");
      }
      return;
    }
```

- [ ] **Step 6: Smoke-check against the example fixture**

Run: `node ./bin/varai.js start ./test/fixtures/anchor-lift/base --no-open --port 3911 &` then, after "listening" appears:
`curl -s "http://localhost:3911/api/source?file=src/components/BuildingToolbar.tsx&line=2" | head -c 300`
Expected: JSON with `"focusLine":2` and a `lines` array containing `deleteStorey`.
`curl -s -o /dev/null -w "%{http_code}" "http://localhost:3911/api/source?file=../../../package.json&line=1"`
Expected: `404`.
`curl -s "http://localhost:3911/api/model" | head -c 200`
Expected: JSON whose top level includes `displayLanguage`.
Then kill the background server.

- [ ] **Step 7: Commit**

```bash
git add src/server/source.js src/server/index.js test/server/source.test.js
git commit -m "feat: read-only source snippet endpoint and display-vocabulary passthrough"
```

---

### Task 6: UI rework — the three-altitude interface

Full rewrite of `src/ui/app.js` and `src/ui/styles.css`; `index.html` gets minor edits. Keep the dark/teal identity, SSE flow, theme toggle, and status dot. The UI derives no semantics: tiers, surface nesting, labels, and diffs all come from the API.

**Files:**
- Modify: `src/ui/index.html`
- Modify: `src/ui/app.js` (full replacement)
- Modify: `src/ui/styles.css` (full replacement)

- [ ] **Step 1: Update `index.html`**

Replace the search placeholder line and main container (the shell is otherwise unchanged):

```html
        <div class="search-wrap">
          <div class="search-icon">⌕</div>
          <input class="search" id="search" type="text" placeholder="Find anything in this system..." autocomplete="off" spellcheck="false">
          <span class="search-count" id="search-count"></span>
        </div>
        <div class="elements-list" id="elements-list">
          <div class="empty-state">
            <span class="empty-icon">◌</span>
            <span>Scanning repository...</span>
          </div>
        </div>
```

- [ ] **Step 2: Replace `src/ui/app.js`**

```js
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

(function setupTheme() {
  document.documentElement.dataset.theme = localStorage.getItem("varai-theme") || "dark";
  document.addEventListener("DOMContentLoaded", () => $("theme-toggle")?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("varai-theme", next);
  }));
})();

const el = {
  statusDot: $("status-dot"), statusText: $("status-text"), topbarStats: $("topbar-stats"),
  sidebarNav: $("sidebar-nav"), search: $("search"), searchCount: $("search-count"), list: $("elements-list"),
};

let activeView = "system";
let expandedId = null;
let changesOnly = false;
let scanData = null;
let diffData = null;
const snippetCache = new Map();
const openSnippets = new Set();

const events = new EventSource("/api/events");
events.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.type === "model") { scanData = message.data; setStatus("live", "Live"); render(); }
  else if (message.type === "semantic-diff") { diffData = message.data; render(); }
  else if (message.type === "error") setStatus("error", "Error");
});
events.addEventListener("open", () => setStatus("scanning", "Connecting..."));
events.addEventListener("error", () => setStatus("error", "Disconnected"));

fetch("/api/model").then((response) => response.json()).then((data) => {
  if (data.model) { scanData = data; setStatus("live", "Live"); render(); }
}).catch(() => setStatus("error", "Connection error"));
fetch("/api/diff").then((response) => response.json()).then((data) => { diffData = data; render(); });

function setStatus(kind, text) {
  el.statusDot.className = `status-dot ${kind}`;
  el.statusText.textContent = text;
}

function language() {
  return scanData?.displayLanguage ?? { relations: {}, kinds: {}, claimStates: {} };
}
const relationLabel = (relation) => language().relations[relation] ?? relation;
const kindLabel = (kind) => language().kinds[kind] ?? kind;
const stateLabel = (state) => language().claimStates[state] ?? state;

function indexes() {
  const model = scanData.model;
  const byId = new Map([...model.subsystems, ...model.elements, ...model.claims].map((item) => [item.id, item]));
  const claimsBySource = new Map();
  for (const claim of model.claims) {
    const list = claimsBySource.get(claim.sourceId) ?? [];
    list.push(claim);
    claimsBySource.set(claim.sourceId, list);
  }
  return { byId, claimsBySource };
}

function changedIds() {
  const ids = new Set();
  const diff = diffData?.diff;
  if (!diff) return ids;
  for (const item of diff.elements.added) ids.add(item.id);
  for (const item of diff.elements.changed) ids.add(item.after.id);
  for (const item of diff.claims.added) ids.add(item.sourceId);
  for (const item of diff.claims.removed) ids.add(item.sourceId);
  for (const item of diff.claims.changed) ids.add(item.after.sourceId);
  return ids;
}

function rootChanged(root, changed) {
  return changed.has(root.elementId) ||
    root.behaviorIds.some((id) => changed.has(id)) ||
    root.surfaceIds.some((id) => changed.has(id));
}

function render() {
  if (!scanData?.model) return;
  renderTopbar();
  renderNav();
  if (activeView === "capabilities") renderCapabilities();
  else if (activeView === "changes") renderChanges();
  else if (activeView === "everything") renderEverything();
  else if (activeView === "unknowns") renderUnknowns();
  else renderSystem();
}

function renderTopbar() {
  const roots = scanData.projections?.things?.roots ?? [];
  const kindById = new Map(scanData.model.elements.map((item) => [item.id, item.kind]));
  const subjects = roots.filter((root) => root.tier === 0).length;
  const screens = roots.filter((root) => root.tier === 1 && kindById.get(root.elementId) === "screen").length;
  const behaviors = scanData.projections?.capabilities?.capabilities?.length ?? 0;
  el.topbarStats.innerHTML = `<span>${subjects} subjects</span><span>${screens} screens</span><span>${behaviors} observed behaviors</span>`;
}

function renderNav() {
  const changes = diffData?.diff?.summary?.semanticChanges ?? 0;
  el.sidebarNav.innerHTML =
    navItem("system", "◎", "System", null) +
    navItem("capabilities", "↳", "Capabilities", null) +
    navItem("changes", "∆", "Changes", changes || null) +
    `<div class="nav-group"><span class="nav-group-label">Advanced</span>` +
    navItem("everything", "≡", "Everything", scanData.model.elements.length) +
    navItem("unknowns", "◌", "Couldn't determine", scanData.model.coverage.length) +
    `</div>`;
  el.sidebarNav.querySelectorAll("[data-view]").forEach((item) => item.addEventListener("click", () => {
    activeView = item.dataset.view;
    expandedId = null;
    changesOnly = false;
    el.search.value = "";
    render();
  }));
}

function navItem(view, icon, name, count) {
  return `<button class="nav-item${activeView === view ? " active" : ""}" data-view="${view}">` +
    `<span class="nav-icon">${esc(icon)}</span><span class="nav-name">${esc(name)}</span>` +
    `${count == null ? "" : `<span class="nav-count">${count}</span>`}</button>`;
}

function showSearch(placeholder) {
  el.search.closest(".search-wrap").hidden = false;
  el.search.placeholder = placeholder;
}

function stateMark(state) {
  const label = stateLabel(state);
  return label ? `<span class="state-mark">${esc(label)}</span>` : "";
}

function changeBadge() {
  return `<span class="change-badge">changed</span>`;
}

function matchRoot(root, byId, query) {
  if (!query) return true;
  const names = [byId.get(root.elementId)?.name,
    ...root.behaviorIds.map((id) => byId.get(id)?.name),
    ...root.surfaceIds.map((id) => byId.get(id)?.name)];
  return names.some((name) => name?.toLowerCase().includes(query));
}

function renderSystem() {
  const projection = scanData.projections?.things;
  if (!projection) return renderEmpty("This scan does not include projections yet");
  const { byId, claimsBySource } = indexes();
  const changed = changedIds();
  const query = el.search.value.toLowerCase().trim();
  showSearch("Find a subject, screen, or behavior...");

  const visible = (root) => matchRoot(root, byId, query) && (!changesOnly || rootChanged(root, changed));
  const subjects = projection.roots.filter((root) => root.tier === 0 && visible(root));
  const screens = projection.roots.filter((root) => root.tier === 1 && byId.get(root.elementId)?.kind === "screen" && visible(root));
  const unplaced = projection.roots.filter((root) => root.tier === 1 && byId.get(root.elementId)?.kind === "surface" && visible(root));
  el.searchCount.textContent = query ? `${subjects.length + screens.length + unplaced.length} matches` : "";

  const changedRootCount = projection.roots.filter((root) => root.tier <= 1 && rootChanged(root, changed)).length;
  const strip = diffData?.diff?.summary?.hasChanges
    ? `<button class="change-strip${changesOnly ? " active" : ""}" id="change-strip">` +
      `<b>${changedRootCount}</b> ${changedRootCount === 1 ? "area" : "areas"} changed since the last snapshot` +
      `<span>${changesOnly ? "show everything" : "show only changes"}</span></button>`
    : diffData?.error ? `<p class="baseline-note">${esc(diffData.error)}</p>` : "";

  let html = strip + `<h2 class="group-heading">Subjects</h2>`;
  html += subjects.length
    ? subjects.map((root) => subjectCard(root, byId, claimsBySource, changed)).join("")
    : `<p class="empty-copy">No system subjects recovered.</p>`;
  html += `<h2 class="group-heading">Screens</h2>`;
  html += screens.length
    ? screens.map((root) => screenCard(root, byId, claimsBySource, changed)).join("")
    : `<p class="empty-copy">No screens recovered.</p>`;
  if (unplaced.length) {
    html += `<h3 class="subgroup-heading">Not placed on a screen</h3>` +
      unplaced.map((root) => subjectCard(root, byId, claimsBySource, changed)).join("");
  }
  el.list.innerHTML = html;
  bindExpanders();
  bindSnippets();
  $("change-strip")?.addEventListener("click", () => { changesOnly = !changesOnly; render(); });
}

function subjectCard(root, byId, claimsBySource, changed) {
  const item = byId.get(root.elementId);
  const open = expandedId === root.elementId;
  return `<article class="card${open ? " open" : ""}">` +
    `<button class="card-head" data-expand="${esc(root.elementId)}" aria-expanded="${open}">` +
    `<span class="card-title"><strong>${esc(item.name)}</strong><small>${esc(kindLabel(item.kind))}</small></span>` +
    `${rootChanged(root, changed) ? changeBadge() : ""}` +
    `${item.claimState !== "observed" ? stateMark(item.claimState) : ""}` +
    `<span class="count">${root.behaviorIds.length} ${root.behaviorIds.length === 1 ? "behavior" : "behaviors"}</span>` +
    `<span class="chevron">⌄</span></button>` +
    (open ? `<div class="card-detail">${behaviorList(root.behaviorIds, root.interfaceIds, byId, claimsBySource, changed)}</div>` : "") +
    `</article>`;
}

function screenCard(root, byId, claimsBySource, changed) {
  const item = byId.get(root.elementId);
  const open = expandedId === root.elementId;
  let detail = "";
  if (open) {
    const panels = root.surfaceIds.map((surfaceId) => {
      const surface = byId.get(surfaceId);
      const offers = (claimsBySource.get(surfaceId) ?? [])
        .filter((claim) => claim.relation === "offers" && claim.target.kind === "reference")
        .map((claim) => claim.target.id);
      return `<section class="panel-block"><h4>${esc(surface.name)} <small>${esc(kindLabel(surface.kind))}</small></h4>` +
        behaviorList(offers, [surfaceId], byId, claimsBySource, changed) + `</section>`;
    }).join("");
    detail = `<div class="card-detail">${panels || `<p class="empty-copy">No panels were resolved into this screen.</p>`}</div>`;
  }
  return `<article class="card${open ? " open" : ""}">` +
    `<button class="card-head" data-expand="${esc(root.elementId)}" aria-expanded="${open}">` +
    `<span class="card-title"><strong>${esc(item.name)}</strong><small>screen</small></span>` +
    `${rootChanged(root, changed) ? changeBadge() : ""}` +
    `<span class="count">${root.surfaceIds.length} ${root.surfaceIds.length === 1 ? "panel" : "panels"} · ${root.behaviorIds.length} ${root.behaviorIds.length === 1 ? "behavior" : "behaviors"}</span>` +
    `<span class="chevron">⌄</span></button>${detail}</article>`;
}

function behaviorList(behaviorIds, interfaceIds, byId, claimsBySource, changed) {
  if (!behaviorIds.length) return `<p class="empty-copy">No connected behavior recovered within current coverage.</p>`;
  return behaviorIds.map((behaviorId) => {
    const behavior = byId.get(behaviorId);
    if (!behavior) return "";
    const claims = claimsBySource.get(behaviorId) ?? [];
    const interfaces = interfaceIds.map((id) => byId.get(id)).filter((item) => item && (item.id === behaviorId ||
      (claimsBySource.get(item.id) ?? []).some((claim) => claim.relation === "offers" && claim.target.id === behaviorId)));
    return `<section class="behavior${changed.has(behaviorId) ? " behavior-changed" : ""}">` +
      `<h3>${esc(behavior.name)}${changed.has(behaviorId) ? changeBadge() : ""}</h3>` +
      (interfaces.length ? `<p class="reach">reached through ${interfaces.map((item) => esc(item.name)).join(" · ")}</p>` : "") +
      claims.map((claim) => claimRow(claim, byId)).join("") +
      `</section>`;
  }).join("");
}

function claimRow(claim, byId) {
  const target = claim.target.kind === "reference" ? byId.get(claim.target.id)?.name ?? claim.target.id : claim.target.value;
  const trace = claim.implementationPath ?? [];
  const steps = trace.map((step, index) =>
    `<li><button class="trace-step" data-file="${esc(step.file)}" data-line="${step.line ?? 1}">` +
    `<span>${index + 1}</span><code>${esc(step.symbol ? `${step.symbol} · ${step.file}` : step.file)}${step.line ? `:${step.line}` : ""}</code></button>` +
    `<div class="snippet" data-snippet="${esc(`${step.file}:${step.line ?? 1}`)}" hidden></div></li>`).join("");
  const fallback = (claim.evidence ?? []).map((entry) => `${esc(entry.file)}${entry.line ? `:${entry.line}` : ""}`).join(", ");
  return `<div class="claim"><p>${esc(relationLabel(claim.relation))} <strong>${esc(target)}</strong>${stateMark(claim.claimState)}</p>` +
    (steps ? `<ol class="trace">${steps}</ol>` : fallback ? `<small class="evidence">${fallback}</small>` : "") + `</div>`;
}

async function toggleSnippet(button) {
  const key = `${button.dataset.file}:${button.dataset.line}`;
  const holder = button.parentElement.querySelector(`[data-snippet="${CSS.escape(key)}"]`);
  if (!holder) return;
  if (!holder.hidden) { holder.hidden = true; openSnippets.delete(key); return; }
  if (!snippetCache.has(key)) {
    try {
      const response = await fetch(`/api/source?file=${encodeURIComponent(button.dataset.file)}&line=${encodeURIComponent(button.dataset.line)}`);
      if (!response.ok) throw new Error("unavailable");
      snippetCache.set(key, await response.json());
    } catch {
      snippetCache.set(key, null);
    }
  }
  const snippet = snippetCache.get(key);
  holder.innerHTML = snippet
    ? `<pre class="code">${snippet.lines.map((line, index) => {
        const number = snippet.startLine + index;
        return `<span class="line${number === snippet.focusLine ? " focus" : ""}"><i>${number}</i>${esc(line)}</span>`;
      }).join("\n")}</pre>`
    : `<p class="empty-copy">Source unavailable.</p>`;
  holder.hidden = false;
  openSnippets.add(key);
}

function bindSnippets() {
  el.list.querySelectorAll(".trace-step").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSnippet(button);
  }));
}

function renderCapabilities() {
  const projection = scanData.projections?.capabilities;
  if (!projection) return renderEmpty("This scan does not include projections yet");
  const { byId, claimsBySource } = indexes();
  const changed = changedIds();
  const query = el.search.value.toLowerCase().trim();
  showSearch(`Find a behavior across ${projection.capabilities.length} capabilities...`);
  const items = projection.capabilities.filter((item) => {
    const names = [byId.get(item.behaviorId)?.name, ...item.resourceIds.map((id) => byId.get(id)?.name)];
    return !query || names.some((name) => name?.toLowerCase().includes(query));
  });
  el.searchCount.textContent = query ? `${items.length} matches` : "";
  el.list.innerHTML = items.map((item) => {
    const behavior = byId.get(item.behaviorId);
    const open = expandedId === behavior.id;
    const resources = item.resourceIds.map((id) => byId.get(id)?.name).filter(Boolean);
    return `<article class="card${open ? " open" : ""}">` +
      `<button class="card-head" data-expand="${esc(behavior.id)}" aria-expanded="${open}">` +
      `<span class="card-title"><strong>${esc(behavior.name)}</strong>` +
      `<small>${resources.length ? `acts on ${esc(resources.join(", "))}` : "no resolved subject"}</small></span>` +
      `${changed.has(behavior.id) ? changeBadge() : ""}<span class="chevron">⌄</span></button>` +
      (open ? `<div class="card-detail">${behaviorList([behavior.id], item.interfaceIds, byId, claimsBySource, changed)}</div>` : "") +
      `</article>`;
  }).join("") || emptyMarkup("No behaviors match this search");
  bindExpanders();
  bindSnippets();
}

function renderChanges() {
  el.search.closest(".search-wrap").hidden = true;
  if (diffData?.error) return renderEmpty(diffData.error);
  const diff = diffData?.diff;
  if (!diff) return renderEmpty("Semantic diff is not ready");
  if (!diff.summary.hasChanges) return renderEmpty("No semantic changes within declared coverage");
  const label = (id) => diff.labels[id] ?? id;
  const claimText = (item) =>
    `${relationLabel(item.relation)} ${item.target.kind === "reference" ? label(item.target.id) : item.target.value}`;
  let html = `<h2 class="group-heading">${diff.summary.semanticChanges} semantic ${diff.summary.semanticChanges === 1 ? "change" : "changes"}</h2>`;
  for (const item of diff.elements.added) html += changeCard("added", "+", item.name, kindLabel(item.kind));
  for (const item of diff.elements.removed) html += changeCard("removed", "−", item.name, kindLabel(item.kind));
  for (const item of diff.claims.added) html += changeCard("added", "+", label(item.sourceId), claimText(item));
  for (const item of diff.claims.removed) html += changeCard("removed", "−", label(item.sourceId), claimText(item));
  for (const item of diff.claims.changed) html += changeCard("changed", "~", label(item.after.sourceId), claimText(item.after));
  el.list.innerHTML = html;
}

function changeCard(kind, symbol, name, detail) {
  return `<article class="card change-${kind}"><div class="card-head static">` +
    `<span class="card-title"><strong>${symbol} ${esc(name)}</strong><small>${esc(detail)}</small></span></div></article>`;
}

function renderEverything() {
  const { byId, claimsBySource } = indexes();
  const query = el.search.value.toLowerCase().trim();
  const elements = scanData.model.elements.filter((item) => !query ||
    item.name.toLowerCase().includes(query) ||
    item.evidence.some((entry) => entry.file.toLowerCase().includes(query)));
  showSearch(`Search all ${scanData.model.elements.length} elements and source paths...`);
  el.searchCount.textContent = query ? `${elements.length} matches` : "";
  if (!elements.length) return renderEmpty("Nothing matches this search");
  el.list.innerHTML = elements.slice(0, 200).map((item) =>
    `<article class="card"><div class="card-head static">` +
    `<span class="card-title"><strong>${esc(item.name)}</strong><small>${esc(kindLabel(item.kind))}</small></span></div>` +
    `<div class="card-detail open-static">` +
    (claimsBySource.get(item.id) ?? []).map((claim) => claimRow(claim, byId)).join("") +
    `<small class="evidence">${(item.evidence ?? []).map((entry) => `${esc(entry.file)}${entry.line ? `:${entry.line}` : ""}`).join(", ") || "no direct evidence"}</small>` +
    `</div></article>`).join("") +
    (elements.length > 200 ? `<p class="empty-copy">${elements.length - 200} more — narrow the search.</p>` : "");
  bindSnippets();
}

function renderUnknowns() {
  el.search.closest(".search-wrap").hidden = true;
  el.list.innerHTML = `<h2 class="group-heading">What varai couldn't determine</h2>` +
    (scanData.model.coverage.length ? scanData.model.coverage.map((item) =>
      `<article class="card"><div class="card-head static">` +
      `<span class="card-title"><strong>${esc(item.capability)}</strong><small>${esc(item.state)}</small></span></div>` +
      `${item.details.length ? `<div class="card-detail open-static"><p>${esc(item.details.join("; "))}</p></div>` : ""}</article>`).join("")
      : emptyMarkup("Nothing was declared out of reach"));
}

function bindExpanders() {
  el.list.querySelectorAll("[data-expand]").forEach((button) => button.addEventListener("click", () => {
    expandedId = expandedId === button.dataset.expand ? null : button.dataset.expand;
    render();
    if (expandedId) requestAnimationFrame(() => el.list.querySelector(`[data-expand="${CSS.escape(expandedId)}"]`)?.focus());
  }));
}

function renderEmpty(message) { el.list.innerHTML = emptyMarkup(message); }
function emptyMarkup(message) { return `<div class="empty-state"><span class="empty-icon">◌</span><span>${esc(message)}</span></div>`; }

el.search.addEventListener("input", render);
```

- [ ] **Step 3: Replace `src/ui/styles.css`**

Keep the existing `:root`/theme variable blocks (dark lines 3–25, light 28–49, shared 52–58) exactly as they are, then replace everything from the reset (`*, *::before ...`) downward with:

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; }

body {
  font-family: var(--font-ui);
  background: var(--bg);
  color: var(--text);
  font-size: 16px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

.shell { display: grid; grid-template-rows: var(--topbar-h) 1fr; height: 100vh; overflow: hidden; }

/* ── Topbar ── */
.topbar {
  display: flex; align-items: center; gap: 16px; padding: 0 16px;
  background: var(--bg-sidebar); box-shadow: var(--shadow-topbar);
  overflow: hidden; z-index: 10; position: relative;
}
.brand { font-size: 12px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent); flex-shrink: 0; }
.repo-path {
  font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 1; min-width: 0;
}
.topbar-stats { display: flex; gap: 14px; font-size: 13px; color: var(--text-mid); flex-shrink: 0; white-space: nowrap; }
.topbar-status { margin-left: auto; display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--text-mid); flex-shrink: 0; }
.theme-toggle {
  width: 28px; height: 28px; border-radius: var(--radius); border: 1px solid var(--border-mid);
  background: transparent; color: var(--text-mid); cursor: pointer; display: flex;
  align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; margin-left: 4px;
}
.theme-toggle:hover { background: var(--bg-hover); color: var(--text-bright); border-color: var(--accent-border); }

/* ── Layout / sidebar ── */
.layout { display: grid; grid-template-columns: var(--sidebar-w) 1fr; overflow: hidden; }
.sidebar { background: var(--bg-sidebar); box-shadow: var(--shadow-sidebar); overflow-y: auto; padding: 10px 0 16px; z-index: 5; }
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 9px 12px; margin: 0 8px 4px;
  border-radius: var(--radius); cursor: pointer; font-size: 14px; font-weight: 600;
  color: var(--text-mid); border: 1px solid transparent; width: calc(100% - 16px);
  background: transparent; font-family: var(--font-ui); text-align: left; user-select: none;
}
.nav-item:hover { color: var(--text-bright); background: var(--bg-hover); }
.nav-item.active { color: var(--accent-bright); background: var(--accent-bg); border-color: var(--accent-border); }
.nav-icon { width: 18px; text-align: center; flex-shrink: 0; opacity: 0.75; }
.nav-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-count {
  font-size: 12px; background: var(--number-bg); color: var(--number);
  padding: 1px 8px; border-radius: 20px; flex-shrink: 0;
}
.nav-item.active .nav-count { background: var(--accent-bg); color: var(--accent-bright); }
.nav-group { margin-top: 14px; }
.nav-group-label {
  font-size: 11px; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase;
  color: var(--text-dim); padding: 0 20px 6px; display: block;
}

/* ── Main ── */
.main { display: flex; flex-direction: column; overflow: hidden; background: var(--bg); }
.search-wrap {
  flex-shrink: 0; display: flex; align-items: center; margin: 14px 20px 10px;
  background: var(--bg-sidebar); border: 1.5px solid var(--border-mid); border-radius: var(--radius);
}
.search-wrap:focus-within { border-color: var(--accent-border); box-shadow: 0 0 0 3px var(--accent-bg); }
.search-icon { padding: 0 4px 0 12px; font-size: 17px; color: var(--text-dim); pointer-events: none; }
.search { flex: 1; padding: 10px 8px; font-family: var(--font-ui); font-size: 15px; background: transparent; color: var(--text-bright); border: none; outline: none; }
.search::placeholder { color: var(--text-dim); }
.search-count { padding: 0 12px 0 4px; font-size: 12px; color: var(--text-dim); white-space: nowrap; }
.elements-list { flex: 1; overflow-y: auto; padding: 4px 20px 24px; max-width: 980px; }

/* ── Change strip ── */
.change-strip {
  display: flex; align-items: center; gap: 8px; width: 100%; margin: 8px 0 14px; padding: 12px 16px;
  border: 1px solid var(--number); border-radius: var(--radius); background: var(--number-bg);
  color: var(--text-bright); font-family: var(--font-ui); font-size: 15px; cursor: pointer; text-align: left;
}
.change-strip b { color: var(--number); }
.change-strip span { margin-left: auto; font-size: 13px; color: var(--text-mid); text-decoration: underline; }
.change-strip.active { border-color: var(--accent); background: var(--accent-bg); }
.baseline-note { margin: 8px 0 14px; font-size: 13px; color: var(--text-dim); }

/* ── Groups and cards ── */
.group-heading { font-size: 14px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-dim); margin: 18px 0 10px; }
.subgroup-heading { font-size: 13px; font-weight: 600; color: var(--text-dim); margin: 14px 0 8px; }
.card {
  border: 1px solid var(--border); border-left: 3px solid var(--border-mid); border-radius: var(--radius);
  background: var(--bg-sidebar); margin-bottom: 8px; overflow: hidden;
}
.card:hover { border-left-color: var(--accent-border); }
.card.open { border-left-color: var(--accent); }
.card-head {
  width: 100%; min-height: 58px; padding: 10px 16px; display: flex; align-items: center; gap: 12px;
  border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; font-family: var(--font-ui);
}
.card-head.static { cursor: default; }
.card-head:not(.static):hover { background: var(--bg-hover); }
.card-head:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; }
.card-title { min-width: 0; display: flex; flex-direction: column; flex: 1; }
.card-title strong { color: var(--text-bright); font-size: 16px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-title small { color: var(--text-dim); font-size: 13px; }
.count { color: var(--text-mid); font-size: 13px; white-space: nowrap; }
.chevron { color: var(--text-dim); font-size: 16px; transition: transform 0.18s ease; }
.card.open .chevron { transform: rotate(180deg); }

.change-badge {
  padding: 2px 9px; border-radius: 20px; background: var(--number-bg); color: var(--number);
  font-size: 12px; font-weight: 700; white-space: nowrap;
}
.state-mark {
  padding: 2px 9px; border-radius: 20px; border: 1px solid var(--border-mid); color: var(--text-mid);
  font-size: 12px; white-space: nowrap;
}
.card.change-added { border-left-color: var(--accent); }
.card.change-removed { border-left-color: var(--red); }
.card.change-changed { border-left-color: var(--number); }

/* ── Card detail: behaviors, claims, traces ── */
.card-detail { padding: 4px 16px 16px; border-top: 1px solid var(--border); }
.card-detail.open-static { border-top: 1px solid var(--border); }
.behavior { padding: 14px 0; border-bottom: 1px dashed var(--border-mid); }
.behavior:last-child { border-bottom: 0; padding-bottom: 4px; }
.behavior h3 { display: flex; align-items: center; gap: 8px; color: var(--text-bright); font-size: 15px; font-weight: 600; }
.behavior-changed h3 { color: var(--number); }
.reach { color: var(--text-mid); font-size: 14px; margin: 2px 0 4px; }
.panel-block { padding: 12px 0; border-bottom: 1px dashed var(--border-mid); }
.panel-block:last-child { border-bottom: 0; }
.panel-block h4 { font-size: 15px; color: var(--text-bright); }
.panel-block h4 small { color: var(--text-dim); font-weight: 400; font-size: 13px; }
.claim { margin-top: 8px; }
.claim p { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 14px; color: var(--text-mid); }
.claim p strong { color: var(--text); font-weight: 500; }
.evidence { font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); }

.trace { position: relative; display: grid; gap: 3px; margin-top: 8px; list-style: none; }
.trace-step {
  display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: center; gap: 8px;
  border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; padding: 2px 0;
}
.trace-step:hover code { color: var(--accent-bright); }
.trace-step > span {
  width: 18px; height: 18px; display: grid; place-items: center; border: 1px solid var(--accent-border);
  border-radius: 50%; background: var(--bg-surface); color: var(--accent-bright); font-size: 9px; font-family: var(--font-mono);
}
.trace-step code { overflow: hidden; color: var(--text-dim); font-family: var(--font-mono); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }

.snippet { margin: 6px 0 8px 26px; }
.code {
  display: block; overflow-x: auto; padding: 10px 12px; border: 1px solid var(--border);
  border-radius: var(--radius); background: var(--bg-surface);
  font-family: var(--font-mono); font-size: 12.5px; line-height: 1.6; color: var(--text);
}
.code .line { display: block; white-space: pre; }
.code .line i { display: inline-block; width: 3.2em; color: var(--text-dim); font-style: normal; user-select: none; }
.code .line.focus { background: var(--accent-bg); }

.empty-copy { color: var(--text-dim); font-size: 14px; margin: 6px 0; }
.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  height: 220px; color: var(--text-dim); font-size: 14px;
}
.empty-icon { font-size: 28px; opacity: 0.35; }

/* ── Status dot ── */
.status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.status-dot.live { background: var(--accent); box-shadow: 0 0 5px var(--accent); animation: blink 2.4s ease-in-out infinite; }
.status-dot.scanning { background: var(--number); animation: blink 0.7s ease-in-out infinite; }
.status-dot.error { background: var(--red); }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

.sidebar::-webkit-scrollbar, .elements-list::-webkit-scrollbar { width: 3px; }
.sidebar::-webkit-scrollbar-thumb, .elements-list::-webkit-scrollbar-thumb { background: var(--border-mid); border-radius: 2px; }
* { scrollbar-width: thin; scrollbar-color: var(--border-mid) transparent; }

@media (max-width: 820px) {
  :root { --sidebar-w: 180px; }
  .topbar-stats { display: none; }
  .card-head .count { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .chevron { transition: none; }
  .status-dot { animation: none; }
}
```

- [ ] **Step 4: Verify against the fixture server**

Run: `node ./bin/varai.js start ./test/fixtures/anchor-lift/base --no-open --port 3911 &`
Then check with curl that the app assets serve (`curl -s http://localhost:3911/ | grep -c search`, expected ≥1) and open `http://localhost:3911` in a browser. Manual checklist:
- System view shows a **Subjects** group with `BuildingDocument` first and a **Screens** group with `/plan`; `OrphanPanel` appears under "Not placed on a screen"; no flat 24-root list, no "show all" button.
- Opening `/plan` shows the `BuildingToolbar` panel and its Delete-storey behavior; opening `BuildingDocument` shows its behaviors as sentences with "reached through" lines.
- Clicking a numbered implementation-path step loads an inline code snippet with the focus line highlighted; clicking again collapses it.
- Claim-state marks read "not verified"/"inferred", never raw enum values; the words "element"/"claim"/"coverage" don't appear outside Advanced.
- Advanced → Everything lists elements with kind labels; Advanced → Couldn't determine shows coverage in plain language.
- Theme toggle, live dot, and keyboard focus (tab to a card, Enter expands) still work.
Kill the background server when done.

- [ ] **Step 5: Commit**

```bash
git add src/ui/index.html src/ui/app.js src/ui/styles.css
git commit -m "feat: three-altitude dashboard over ranked projections with inline source peek"
```

---

### Task 7: Layering guard tests

Make the spec's two contract rules executable so they can't silently regress.

**Files:**
- Test: `test/architecture/layering.test.js`

- [ ] **Step 1: Write the test**

```js
// test/architecture/layering.test.js
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const CORE_DIRS = ["src/system-model", "src/snapshots", "src/scanners", "src/reporters"];

function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

test("core never imports from the server or UI layers", () => {
  for (const dir of CORE_DIRS) {
    for (const file of jsFiles(dir)) {
      const content = readFileSync(file, "utf8");
      assert.ok(!/from\s+["'][^"']*\/(server|ui)\//.test(content), `${file} imports from server/ui`);
    }
  }
});

test("relation display labels are defined exactly once, in core display language", () => {
  const owner = path.normalize("src/reporters/display-language.js");
  const offenders = [];
  for (const dir of ["src", "bin"]) {
    for (const file of jsFiles(dir)) {
      if (path.normalize(file) === owner) continue;
      if (readFileSync(file, "utf8").includes('"is triggered by"')) offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
});
```

(Note: `jsFiles("src")` in the second test walks `src/ui` too, so a reintroduced label table in `app.js` fails the build.)

- [ ] **Step 2: Run the test**

Run: `node --test test/architecture/layering.test.js`
Expected: PASS (Tasks 1 and 6 already removed the duplicate tables). If it fails, a duplicate survived — remove it rather than weakening the test.

- [ ] **Step 3: Commit**

```bash
git add test/architecture/layering.test.js
git commit -m "test: enforce downward layering and single display vocabulary"
```

---

### Task 8: Full verification and Kalakar acceptance

- [ ] **Step 1: Full suite, both parser backends**

```bash
npm test
VARAI_PARSER=wasm node --test test/scanners/render-containment.test.js test/system-model/anchor-projection.test.js
```
Expected: all PASS.

- [ ] **Step 2: CLI acceptance on Kalakar**

```bash
node ./bin/varai.js map ../kalakar --include services/frontend/src --include services/backend --include src/kalakar | head -80
```
Expected: report opens with `N subjects · M screens · K observed behaviors`, then `## Subjects` with `BuildingModelDocument` among the first entries, then `## Screens` with panels nested. No `## Browse by thing` heading, no flat 313-root wall.

- [ ] **Step 3: Dashboard acceptance on Kalakar**

Restart the running instance (it holds pre-change code):

```bash
node ./bin/varai.js start ../kalakar --no-open --port 3847
```

Check spec acceptance criteria 1–5 in the browser: ≈30 top-level entries; `BuildingModelDocument` first with distinct behaviors; a majority of surfaces nested under screens with the rest under "Not placed on a screen"; an implementation step opens an inline snippet; after editing a public contract and re-snapshotting, the owning subject shows a change badge and the change strip appears.

- [ ] **Step 4: Record results and commit any fixes**

If Kalakar reveals fixable gaps (e.g. containment resolves too few surfaces because Kalakar uses a routing pattern the tracer doesn't cover), record them as diagnostics/known gaps — do not add name-based fallbacks. Commit with:

```bash
git add -A
git commit -m "chore: kalakar acceptance pass for system-interface presentation"
```

---

## Self-review notes (already applied)

- Spec coverage: module map/layering → Tasks 5, 7; containment → Task 2; projection tiers/ranking → Task 3; reporter parity → Task 4; display vocabulary → Task 1; `/api/source` → Task 5; three-altitude UI, change strip/badges, plain language, advanced layer → Task 6; acceptance criteria → Task 8.
- The Task 4 rewrite drops the old `## System overview` block; `varai map` consumers relying on that heading get the new summary line instead — intended, pre-release.
- Task 2's tracer only understands `element={<X/>}` route rendering. Other patterns (route config objects, `component={X}`) yield no containment claims — honest gaps, listed under "Not placed on a screen", to be extended when Kalakar/Trux data demands it.
