# Behavior Cards Output Quality — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix seven output-quality defects in the behavior cards scanner so the kalakar report reads clearly to a human developer.

**Architecture:** Six targeted fixes across five source files (body.js, behaviors-section.js, signature.js, resolver.js, constructs.js, clustering.js) plus a golden regeneration check. Every fix has a failing test first. All changes are in `src/scanners/behaviors/` or `src/reporters/`. No new files.

**Tech Stack:** Node.js ESM, tree-sitter (Python grammar), node:test runner.

**Working directory:** `.worktrees/behavior-cards/` (branch `feat/behavior-cards`)

**Baseline:** 171 tests passing. Run `npm test` to verify before starting.

---

## Defect summary

| # | Symptom in kalakar output | Root cause | File |
|---|---|---|---|
| 1a | `stores db (db, db, db, db)` | `.add()/.commit()` target = receiver variable name, not model | `body.js` |
| 1b | `stores db (artifact_map.setdefault(...).add(...))` | `.add()` fires on ANY object, not just DB session | `body.js` |
| 1c | `stores db (db.query(X).filter(...))` | `.delete()` on chained receiver uses full chain as target | `body.js` |
| 2 | `reads db (User, User)` | targets list never deduplicated | `behaviors-section.js` |
| 3 | building-model has no `needs:` gates | `Annotated[T, Depends(fn)]` pattern not detected | `signature.js` |
| 4 | building-model has no subject/ceremony | Multi-line `from x import (\n  name,\n)` not parsed by resolver | `resolver.js` |
| 5a | `Subject: parse-component-type`, `project-or-404` | No confidence gate on subject derivation | `constructs.js` |
| 5b | `mutation ceremony: persist — followed by 3/3` (single step) | Ceremony allowed with only 1 step | `constructs.js` |
| 6 | Four bundles all named "projects" | Rule-1 and Rule-2 both generate same-prefix names | `clustering.js` |

---

## File map

| File | Change |
|---|---|
| `src/scanners/behaviors/body.js` | Gate `.add()/.commit()` to session identifiers; extract model from `.add(Model())` arg; walk chained `.delete()` to find query target |
| `src/reporters/behaviors-section.js` | Deduplicate targets in `byMedium()` |
| `src/scanners/behaviors/signature.js` | Check `typeText` for `Depends(...)` in addition to `valueNode` |
| `src/scanners/behaviors/resolver.js` | Normalize multi-line parenthesized imports before line parsing |
| `src/scanners/behaviors/constructs.js` | `SUBJECT_VERBS_RE` guard + `-or-` filter + `GENERIC_VARS` returnVar filter; require ≥2 ceremony steps |
| `src/scanners/behaviors/clustering.js` | `urlPrefix(p, depth)` + post-formation disambiguation pass |
| `test/behaviors/body-effects.test.js` | New tests for db hygiene |
| `test/behaviors/render.test.js` | New test for deduplication |
| `test/behaviors/signature.test.js` | New test for Annotated[..., Depends()] |
| `test/behaviors/resolver.test.js` | New test for multi-line imports |
| `test/behaviors/constructs-subject.test.js` | New tests for subject guards |
| `test/behaviors/constructs-ceremony.test.js` | New test for ≥2-step gate |
| `test/behaviors/clustering.test.js` | New test for name disambiguation |

---

## Task 1: DB write target hygiene (`body.js`)

**Files:**
- Modify: `src/scanners/behaviors/body.js`
- Test: `test/behaviors/body-effects.test.js`

### Problem

Three distinct issues all in the `attribute` call branch:

**1a** `db.add(project)` / `db.commit()` — receiver becomes the target (`"db"`, `"db"`, …) so output is `stores db (db, db, db, db)`.

**1b** `artifact_map.setdefault(str(pid), set()).add(atype)` — `method === "add"` fires; receiver is the full chained expression. Output: `stores db (artifact_map.setdefault(...))`.

**1c** `db.query(JobOwnership).filter(...).delete()` — receiver is the full chained expression. Output: `stores db (db.query(JobOwnership).filter(...))`.

### Fix strategy

- For `.add()/.commit()/.refresh()`: check that `callee.object` (the receiver node) is a plain `identifier`. If it's a `call` or `attribute` node (a chain), skip — it's not a DB session call.
- For `.add()`: extract the model name from the first argument: if it's an identifier in `modelNames`, use it; if it's a constructor call (`call` node) whose callee is in `modelNames`, use that. Otherwise `null`.
- For `.commit()/.refresh()`: target is always `null` (no meaningful model to name).
- For `.delete()` on a chained receiver: walk the receiver tree to find the innermost `.query(X)` call and extract `X` as the target.

- [ ] **Step 1: Write failing tests**

Add to `test/behaviors/body-effects.test.js`:

```js
test("db.add() on non-identifier receiver is ignored (no false db write)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-body-db1-"));
  await writeFile(join(dir, "h.py"), `def handler():
    artifact_map.setdefault(str(pid), set()).add(atype)
`);
  const { fn, ctx } = await fnAndCtx(dir, "h.py");
  const resolver = createResolver(["h.py"], ctx);
  const factIndex = { schemaNames: new Set(), modelNames: new Set(), envNames: new Set() };

  const out = await traceBody(fn, "h.py", ctx, resolver, factIndex);

  assert.equal(out.writes.filter((w) => w.medium === "db").length, 0, "no db write for chained .add()");
});

test("db.add(Model()) captures model name; db.commit() target is null", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-body-db2-"));
  await writeFile(join(dir, "h.py"), `def handler(db):
    db.add(JobOwnership(job_id=job_id))
    db.add(project)
    db.commit()
    db.commit()
`);
  const { fn, ctx } = await fnAndCtx(dir, "h.py");
  const resolver = createResolver(["h.py"], ctx);
  const factIndex = { schemaNames: new Set(), modelNames: new Set(["JobOwnership", "Project"]), envNames: new Set() };

  const out = await traceBody(fn, "h.py", ctx, resolver, factIndex);

  const dbWrites = out.writes.filter((w) => w.medium === "db");
  assert.ok(dbWrites.some((w) => w.target === "JobOwnership"), "constructor arg extracted");
  assert.ok(dbWrites.every((w) => w.target !== "db"), "receiver name not used as target");
  assert.ok(dbWrites.some((w) => w.via === "db.commit" && w.target === null), "commit has null target");
});

test("chained db.query(X).filter().delete() extracts X as write target", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-body-db3-"));
  await writeFile(join(dir, "h.py"), `def handler(db):
    db.query(JobOwnership).filter(JobOwnership.project_id == project.id).delete()
`);
  const { fn, ctx } = await fnAndCtx(dir, "h.py");
  const resolver = createResolver(["h.py"], ctx);
  const factIndex = { schemaNames: new Set(), modelNames: new Set(["JobOwnership"]), envNames: new Set() };

  const out = await traceBody(fn, "h.py", ctx, resolver, factIndex);

  assert.ok(out.writes.some((w) => w.target === "JobOwnership" && w.medium === "db"),
    "chained delete target extracted");
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --test test/behaviors/body-effects.test.js 2>&1 | tail -15
```

Expected: 3 new tests fail.

- [ ] **Step 3: Implement the fix in `body.js`**

The complete attribute-call block (lines 30–42) in `src/scanners/behaviors/body.js` becomes:

```js
    if (callee.type === "attribute") {
      const method = callee.childForFieldName("attribute").text;
      const receiver = callee.childForFieldName("object");
      const receiverText = receiver.text;

      if (method === "query") {
        const arg = firstArgIdent(call);
        const target = arg && factIndex.modelNames.has(arg) ? arg : receiverText;
        acc.reads.push({ target, kind: "db_model", medium: "db", via: `${receiverText}.query`, evidence: { file, line }, layer: "semantic" });
      } else if (method === "delete") {
        // May be direct db.delete(X) or chained db.query(X).filter(...).delete()
        const target = receiver.type === "identifier"
          ? (firstArgIdent(call) || null)
          : extractChainedQueryTarget(receiver, factIndex.modelNames);
        acc.writes.push({ target, kind: "db_model", medium: "db", via: `${receiverText}.delete`, evidence: { file, line }, layer: "semantic" });
      } else if (method === "add" || method === "commit" || method === "refresh") {
        // Only recognize session-like direct identifiers (db, session).
        // Chained expressions like artifact_map.setdefault(...).add() are not DB writes.
        if (receiver.type !== "identifier") { continue; }
        const target = method === "add" ? firstArgModel(call, factIndex.modelNames) : null;
        acc.writes.push({ target, kind: "db_model", medium: "db", via: `${receiverText}.${method}`, evidence: { file, line }, layer: "semantic" });
      }
      continue;
    }
```

Add two new helper functions near `firstArgIdent` at the bottom of the file:

```js
function firstArgModel(callNode, modelNames) {
  const args = callNode.childForFieldName("arguments");
  if (!args) return null;
  const first = args.namedChildren[0];
  if (!first) return null;
  if (first.type === "identifier" && modelNames.has(first.text)) return first.text;
  if (first.type === "call") {
    const callee = first.childForFieldName("function");
    const nm = callee ? callee.text : "";
    if (modelNames.has(nm)) return nm;
  }
  return null;
}

function extractChainedQueryTarget(node, modelNames) {
  // Walk a chained expression like db.query(X).filter(...) to find X.
  if (!node) return null;
  if (node.type === "call") {
    const callee = node.childForFieldName("function");
    if (callee && callee.type === "attribute") {
      const method = callee.childForFieldName("attribute").text;
      if (method === "query") return firstArgIdent(node);
      return extractChainedQueryTarget(callee.childForFieldName("object"), modelNames);
    }
  }
  if (node.type === "attribute") {
    return extractChainedQueryTarget(node.childForFieldName("object"), modelNames);
  }
  return null;
}
```

- [ ] **Step 4: Run all tests**

```bash
npm test 2>&1 | grep "pass\|fail" | tail -3
```

Expected: `# pass 174  # fail 0` (171 + 3 new).

- [ ] **Step 5: Commit**

```bash
git -C /path/to/.worktrees/behavior-cards add src/scanners/behaviors/body.js test/behaviors/body-effects.test.js
git -C /path/to/.worktrees/behavior-cards commit -m "fix(behaviors): gate db write detection to session identifiers; extract model targets"
```

---

## Task 2: Deduplicate read/write targets in renderer (`behaviors-section.js`)

**Files:**
- Modify: `src/reporters/behaviors-section.js`
- Test: `test/behaviors/render.test.js`

### Problem

`byMedium()` pushes each target into an array without checking for duplicates. `db.query(User)` called twice → `reads db (User, User)`. Multiple `db.commit()` calls after Task 1 fix all have `target: null` → fine, but duplicate non-null targets still leak.

- [ ] **Step 1: Write failing test**

Add to `test/behaviors/render.test.js`:

```js
test("byMedium deduplicates repeated targets", () => {
  // Reach into the rendered output of renderBehavior with duplicate reads
  const b = {
    door: { method: "GET", path: "/api/v1/things" },
    requires: [],
    takes: [],
    gives: [],
    reads: [
      { target: "User", medium: "db" },
      { target: "User", medium: "db" },
      { target: "Project", medium: "db" },
    ],
    writes: [],
    fails: [],
    untraced: [],
  };
  const lines = [];
  appendBehaviorsSection(lines, {
    bundles: [{ name: "things", behaviors: [b], jobScoped: false }],
  });
  const row = lines.find((l) => l.includes("GET"));
  assert.ok(row.includes("reads db (User, Project)"), `got: ${row}`);
  assert.ok(!row.includes("User, User"), "no duplicate targets");
});
```

At top of `test/behaviors/render.test.js`, import:

```js
import { appendBehaviorsSection } from "../../src/reporters/behaviors-section.js";
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
node --test test/behaviors/render.test.js 2>&1 | tail -10
```

Expected: FAIL (currently emits `reads db (User, User, Project)`).

- [ ] **Step 3: Fix `byMedium` in `behaviors-section.js`**

Replace the `byMedium` function (lines 68–75):

```js
function byMedium(clauses) {
  const m = new Map();
  for (const c of clauses) {
    if (!m.has(c.medium)) m.set(c.medium, new Set());
    if (c.target && c.target !== "file") m.get(c.medium).add(c.target);
  }
  return [...m.entries()].map(([med, targets]) => [med, [...targets]]);
}
```

- [ ] **Step 4: Run all tests**

```bash
npm test 2>&1 | grep "pass\|fail" | tail -3
```

Expected: `# pass 175  # fail 0`.

- [ ] **Step 5: Commit**

```bash
git -C /path/to/.worktrees/behavior-cards add src/reporters/behaviors-section.js test/behaviors/render.test.js
git -C /path/to/.worktrees/behavior-cards commit -m "fix(behaviors): deduplicate read/write targets in renderer"
```

---

## Task 3: `Annotated[T, Depends(fn)]` gate detection (`signature.js`)

**Files:**
- Modify: `src/scanners/behaviors/signature.js`
- Test: `test/behaviors/signature.test.js`

### Problem

Modern FastAPI code uses `ctx: Annotated[JobContext, Depends(get_job_context)]` — `Depends(...)` is in the **type annotation**, not the default value. `signature.js` only tests `valueNode.text` against `DEPENDS_RE`, so this pattern is invisible. Result: all 115 building-model handlers show no gates.

Old style (detected): `db: Session = Depends(get_db)` → `valueNode.text = "Depends(get_db)"`.  
New style (missed): `ctx: Annotated[JobContext, Depends(get_job_context)]` → `typeNode.text = "Annotated[JobContext, Depends(get_job_context)]"`, `valueNode = null`.

- [ ] **Step 1: Write failing test**

Add to `test/behaviors/signature.test.js`:

```js
test("Annotated[T, Depends(fn)] style gate is detected", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-sig-ann-"));
  await writeFile(join(dir, "bm.py"), `from typing import Annotated
def get_quantities(ctx: Annotated[JobContext, Depends(get_job_context)]):
    return {}
`);
  const fn = await firstFn(dir, "bm.py");
  const factIndex = { schemaNames: new Set(), modelNames: new Set(), envNames: new Set() };

  const out = traceSignature(fn, null, "bm.py", factIndex);

  assert.ok(
    out.requires.some((r) => r.name === "get_job_context" && r.kind === "dependency"),
    "Annotated-style Depends gate detected"
  );
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
node --test test/behaviors/signature.test.js 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Fix `signature.js`**

Replace the `if (valueNode && DEPENDS_RE.test(valueNode.text))` block (lines 19–27) with:

```js
      const valueText = valueNode ? valueNode.text : "";
      const depsText = DEPENDS_RE.test(valueText)
        ? valueText
        : DEPENDS_RE.test(typeText) ? typeText : null;

      if (depsText) {
        requires.push({
          name: depsText.match(DEPENDS_RE)[1],
          kind: "dependency",
          evidence: { file, line: line(p) },
          layer: "ast",
        });
        continue;
      }
```

- [ ] **Step 4: Run all tests**

```bash
npm test 2>&1 | grep "pass\|fail" | tail -3
```

Expected: `# pass 176  # fail 0`.

- [ ] **Step 5: Commit**

```bash
git -C /path/to/.worktrees/behavior-cards add src/scanners/behaviors/signature.js test/behaviors/signature.test.js
git -C /path/to/.worktrees/behavior-cards commit -m "fix(behaviors): detect Annotated[T, Depends(fn)] gate pattern"
```

---

## Task 4: Multi-line import normalization (`resolver.js`)

**Files:**
- Modify: `src/scanners/behaviors/resolver.js`
- Test: `test/behaviors/resolver.test.js`

### Problem

Python code frequently writes imports with parentheses spanning multiple lines:

```python
from ._common import (
    _assert_revision,
    _ensure_persisted_building_model,
    _persist_document_with_history,
)
```

`resolver.js` parses imports line-by-line with `/^\s*from\s+(\.?[\w.]+)\s+import\s+(.+)$/`. The first line matches but `m[2]` is `(` — after `replace(/[()#].*$/, "")` it becomes empty string, so none of the names are registered. Sub-file handlers can't resolve their ceremony helpers or trunk function → no trunkCall unification → no subject/ceremony for the building-model bundle.

**Fix:** Normalize multi-line parenthesized imports to single lines before parsing.

- [ ] **Step 1: Write failing test**

Add to `test/behaviors/resolver.test.js`:

```js
test("resolveFunction handles multi-line parenthesized imports", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-resolver-ml-"));
  await mkdir(join(dir, "pkg"), { recursive: true });
  await writeFile(join(dir, "pkg/common.py"), `def _ensure_doc(ctx):\n    pass\ndef _assert_rev(ctx):\n    pass\n`);
  await writeFile(join(dir, "pkg/routes.py"), `from pkg.common import (
    _ensure_doc,
    _assert_rev,
)

def handler(ctx):
    doc = _ensure_doc(ctx)
    _assert_rev(doc)
`);
  const ctx = createScanContext(dir);
  const resolver = createResolver(["pkg/common.py", "pkg/routes.py"], ctx);

  const ensureDoc = await resolver.resolveFunction("pkg/routes.py", "_ensure_doc");
  assert.ok(ensureDoc, "_ensure_doc resolved through multi-line import");
  assert.equal(ensureDoc.node.childForFieldName("name").text, "_ensure_doc");

  const assertRev = await resolver.resolveFunction("pkg/routes.py", "_assert_rev");
  assert.ok(assertRev, "_assert_rev resolved through multi-line import");
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
node --test test/behaviors/resolver.test.js 2>&1 | tail -10
```

Expected: FAIL (`_ensure_doc` resolves to null).

- [ ] **Step 3: Add `normalizeImports` to `resolver.js` and use it in `importsIn`**

Add this function before `createResolver`:

```js
function normalizeImports(content) {
  // Join multi-line parenthesized imports onto one line so the
  // line-by-line parser sees: "from x import a, b, c"
  return content.replace(
    /^(\s*from\s+[\w.]+\s+import\s*)\(([^)]*)\)/gms,
    (_, prefix, names) => prefix + names.replace(/\s+/g, " ").trim()
  );
}
```

In `importsIn`, wrap the content before splitting:

```js
  async function importsIn(file) {
    if (importCache.has(file)) return importCache.get(file);
    const map = new Map();
    const raw = await ctx.read(file);
    const content = raw ? normalizeImports(raw) : "";
    if (content) {
      for (const line of content.split("\n")) {
        // ... rest unchanged
```

- [ ] **Step 4: Run all tests**

```bash
npm test 2>&1 | grep "pass\|fail" | tail -3
```

Expected: `# pass 177  # fail 0`.

- [ ] **Step 5: Commit**

```bash
git -C /path/to/.worktrees/behavior-cards add src/scanners/behaviors/resolver.js test/behaviors/resolver.test.js
git -C /path/to/.worktrees/behavior-cards commit -m "fix(behaviors): normalize multi-line parenthesized imports in resolver"
```

---

## Task 5: Subject confidence gate + ≥2-step ceremony (`constructs.js`)

**Files:**
- Modify: `src/scanners/behaviors/constructs.js`
- Test: `test/behaviors/constructs-subject.test.js`, `test/behaviors/constructs-ceremony.test.js`

### Problem A — low-confidence subjects

Several subjects appear that are not useful document names:
- `Subject: parse-component-type` — `parse_component_type` is a utility function, not a data loader. `parse` is not in VERB_TOKENS so it's not stripped.
- `Subject: project-or-404 (db, per-job)` — from `get_project_or_404`; strip `get_` → `project-or-404`. The `-or-` suffix marks an exception-raising helper, not a document.
- `Subject: model-path file_path` — trunk = `model_path`, returnVar = `file_path` appended. `file_path` is a generic path variable, not a meaningful part of the subject name.

**Fixes:**
1. Add `"parse", "create", "make", "handle", "process"` to `VERB_TOKENS` so utility-function names get their leading verb stripped and leave a shorter, less confusing residual.
2. Add `SUBJECT_VERBS_RE = /^(get|load|fetch|ensure|find|build)_/i` — only derive subject when the trunk function name (after stripping leading `_`) starts with a data-loading verb. Pure utilities like `parse_component_type` or `model_path` fail this check and produce no subject.
3. Skip subject if the derived label contains `-or-` (exception-helper pattern).
4. Define `GENERIC_VARS = new Set(["result", "data", "response", "obj", "item", "value", "file_path", "filepath", "path", "output"])` and skip appending returnVar if it matches.

### Problem B — single-step ceremony is noise

`mutation ceremony: persist — followed by 3/3` on the projects bundle. A single shared step is not a ceremony worth naming.

**Fix:** `if (steps.length < 2) return;`

- [ ] **Step 1: Write failing tests**

Add to `test/behaviors/constructs-subject.test.js`:

```js
test("subject not derived when trunk doesn't start with a loading verb", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-subj-guard-"));
  const ctx = createScanContext(dir);
  const resolver = createResolver([], ctx);
  const mk = (p) => ({ door: { method: "GET", path: p, evidence: { file: "r.py", line: 1 } },
    trunkCall: "parse_component_type", requires: [], reads: [], writes: [],
    gives: [], takes: [], fails: [], untraced: [], helperCalls: [], bundle: "assets" });
  const bundle = { name: "assets", behaviors: [mk("/api/v1/assets/lib/widgets"), mk("/api/v1/assets/lib/panels")] };

  await deriveConstructs(bundle, ctx, resolver);

  assert.equal(bundle.subject, undefined, "parse_ trunk should not produce a subject");
});

test("subject suppressed when label contains -or- (error helper pattern)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-subj-or-"));
  await mkdir(join(dir, "r"), { recursive: true });
  await writeFile(join(dir, "r/common.py"), `def get_project_or_404(slug, db):\n    return db.query(Project).first()\n`);
  const ctx = createScanContext(dir);
  const resolver = createResolver(["r/common.py"], ctx);
  const mk = (p) => ({ door: { method: "GET", path: p, evidence: { file: "r/common.py", line: 1 } },
    trunkCall: "get_project_or_404", requires: [], reads: [], writes: [{ medium: "db" }],
    gives: [], takes: [], fails: [], untraced: [], helperCalls: [], bundle: "projects" });
  const bundle = { name: "projects", behaviors: [mk("/api/v1/projects/{slug}"), mk("/api/v1/projects/{slug}/export")] };

  await deriveConstructs(bundle, ctx, resolver);

  assert.equal(bundle.subject, undefined, "project-or-404 should not become a subject");
});

test("returnVar not appended when it is a generic path name", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-subj-var-"));
  await mkdir(join(dir, "r"), { recursive: true });
  await writeFile(join(dir, "r/common.py"), `def get_model_file(ctx):\n    file_path = compute(ctx)\n    return file_path\n`);
  const ctx = createScanContext(dir);
  const resolver = createResolver(["r/common.py"], ctx);
  const mk = (p) => ({ door: { method: "GET", path: p, evidence: { file: "r/common.py", line: 1 } },
    trunkCall: "get_model_file", requires: [], reads: [], writes: [],
    gives: [], takes: [], fails: [], untraced: [], helperCalls: [], bundle: "models" });
  const bundle = { name: "models", behaviors: [mk("/api/v1/models/a"), mk("/api/v1/models/b")] };

  await deriveConstructs(bundle, ctx, resolver);

  assert.ok(bundle.subject, "subject derived");
  assert.ok(!bundle.subject.label.includes("file_path"), `label should not include file_path: got "${bundle.subject?.label}"`);
});
```

Add to `test/behaviors/constructs-ceremony.test.js`:

```js
test("ceremony not derived when only 1 step is shared", async () => {
  const mk = (writes, helpers) => ({
    door: { method: "POST", path: "/api/v1/things/x", evidence: { file: "r.py", line: 1 } },
    trunkCall: null, requires: [], reads: [], writes, gives: [], takes: [], fails: [], untraced: [],
    helperCalls: helpers, bundle: "things"
  });
  const bundle = {
    name: "things",
    behaviors: [
      mk([{ medium: "file" }], ["persist_document"]),
      mk([{ medium: "file" }], ["persist_document"]),
      mk([{ medium: "file" }], ["persist_document"]),
    ],
  };
  _deriveCeremony(bundle);
  assert.equal(bundle.ceremony, undefined, "single-step shared helper is not a ceremony");
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --test test/behaviors/constructs-subject.test.js test/behaviors/constructs-ceremony.test.js 2>&1 | tail -15
```

Expected: 4 new tests fail.

- [ ] **Step 3: Apply all five constructs changes**

In `src/scanners/behaviors/constructs.js`:

**3a.** Update `VERB_TOKENS` (line 3):

```js
const VERB_TOKENS = new Set([
  "ensure", "get", "load", "fetch", "build", "persist", "persisted",
  "resolve", "require", "parse", "create", "make", "handle", "process",
]);
```

**3b.** Add constants after `VERB_TOKENS`:

```js
const SUBJECT_VERBS_RE = /^(get|load|fetch|ensure|find|build)_/i;
const GENERIC_VARS = new Set([
  "result", "data", "response", "obj", "item", "value",
  "file_path", "filepath", "path", "output",
]);
```

**3c.** At the start of `deriveSubject`, add the trunk guard (after the `if (!trunk ...)` check):

```js
async function deriveSubject(bundle, ctx, resolver) {
  const trunk = bundle.behaviors[0]?.trunkCall;
  if (!trunk || !bundle.behaviors.every((b) => b.trunkCall === trunk)) return;

  // Only derive subject when the trunk function clearly loads/retrieves data.
  if (!SUBJECT_VERBS_RE.test(trunk.replace(/^_+/, ""))) return;

  const tokens = trunk.replace(/^_+/, "").split("_");
  // ...rest unchanged...
```

**3d.** After computing `label` (after the while loop that strips VERB_TOKENS), add the `-or-` guard:

```js
  let label = tokens.join("-");
  if (label.includes("-or-")) return; // exception-helper pattern (e.g. project-or-404)
```

**3e.** Replace the `returnVar` append block:

```js
  const returnVar = resolved ? returnIdentifier(resolved.node) : null;
  if (returnVar && !label.includes(returnVar) && !GENERIC_VARS.has(returnVar)) {
    label = `${label} ${returnVar}`;
  }
```

**3f.** In `_deriveCeremony`, change the guard (line ~89):

```js
  if (steps.length < 2) return;
```

- [ ] **Step 4: Run all tests**

```bash
npm test 2>&1 | grep "pass\|fail" | tail -3
```

Expected: `# pass 181  # fail 0`.

- [ ] **Step 5: Commit**

```bash
git -C /path/to/.worktrees/behavior-cards add src/scanners/behaviors/constructs.js test/behaviors/constructs-subject.test.js test/behaviors/constructs-ceremony.test.js
git -C /path/to/.worktrees/behavior-cards commit -m "fix(behaviors): subject confidence gate; suppress -or- helpers; require >=2 ceremony steps"
```

---

## Task 6: Disambiguate duplicate bundle names (`clustering.js`)

**Files:**
- Modify: `src/scanners/behaviors/clustering.js`
- Test: `test/behaviors/clustering.test.js`

### Problem

Four bundles are all named "projects" because they share the same URL prefix `/api/v1/projects`. They land in separate bundles (different Rule-1 trunkCalls, or Rule-1 vs Rule-2), but all get name `"projects"` from `urlPrefix`.

**Fix:**
1. Make `urlPrefix` accept a `depth` parameter (default 1) to allow picking more URL segments.
2. After all bundles are formed, detect name collisions. For each collision group, re-name using `urlPrefix(path, 2)` — the second non-param segment provides disambiguation (e.g. "projects/reference-images", "projects/settings").
3. If depth-2 names still collide, append a counter suffix (`-2`, `-3`, …).

- [ ] **Step 1: Write failing test**

Add to `test/behaviors/clustering.test.js`:

```js
test("duplicate bundle names are disambiguated using deeper URL segment", () => {
  const mkRef = (path, trunk) => ({
    door: { method: "GET", path, evidence: { file: "r.py", line: 1 } },
    requires: [{ name: "get_db", kind: "dependency" }],
    trunkCall: trunk,
    reads: [], writes: [], gives: [], takes: [], fails: [], untraced: [], helperCalls: [], bundle: null,
  });
  const behaviors = [
    // Two groups under /api/v1/projects with different trunkCalls → separate Rule-1 bundles, same name
    mkRef("/api/v1/projects/{slug}/reference-images/{id}", "load_reference_image"),
    mkRef("/api/v1/projects/{slug}/reference-images", "load_reference_image"),
    mkRef("/api/v1/projects/{slug}/settings", "get_project_settings"),
    mkRef("/api/v1/projects/{slug}/settings/advanced", "get_project_settings"),
  ];
  const bundles = clusterBundles(behaviors);
  const names = bundles.map((b) => b.name);
  assert.equal(new Set(names).size, names.length, `all bundle names unique, got: ${names.join(", ")}`);
  assert.ok(names.some((n) => n.includes("reference-images")), "reference-images disambiguated");
  assert.ok(names.some((n) => n.includes("settings")), "settings disambiguated");
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
node --test test/behaviors/clustering.test.js 2>&1 | tail -10
```

Expected: FAIL (names = `["projects", "projects"]`).

- [ ] **Step 3: Update `clustering.js`**

Replace the `urlPrefix` function and add a disambiguation pass at the end of `clusterBundles`:

```js
function urlPrefix(p, depth = 1) {
  const segs = p.split("/").filter(Boolean);
  let i = 0;
  if (segs[i] === "api") i++;
  if (segs[i] && /^v\d+$/.test(segs[i])) i++;
  const parts = [];
  while (parts.length < depth) {
    while (segs[i] && /^\{.*\}$/.test(segs[i])) i++;
    if (!segs[i]) break;
    parts.push(segs[i++].replace(/_/g, "-"));
  }
  return parts.join("/") || "root";
}
```

At the end of `clusterBundles`, before the `return bundles` line, add:

```js
  // Disambiguate duplicate names using a deeper URL path segment.
  const nameCounts = new Map();
  for (const b of bundles) nameCounts.set(b.name, (nameCounts.get(b.name) || 0) + 1);
  for (const b of bundles) {
    if ((nameCounts.get(b.name) || 0) > 1) {
      const longer = urlPrefix(b.behaviors[0].door.path, 2);
      if (longer !== b.name) {
        b.name = longer;
        for (const beh of b.behaviors) beh.bundle = b.name;
      }
    }
  }
  // Final pass: number any remaining duplicates.
  const seen = new Map();
  for (const b of bundles) {
    const n = seen.get(b.name) || 0;
    if (n > 0) {
      b.name = `${b.name}-${n + 1}`;
      for (const beh of b.behaviors) beh.bundle = b.name;
    }
    seen.set(b.name, (n || 0) + 1);
  }

  bundles.sort((a, b) => b.behaviors.length - a.behaviors.length);
  return bundles;
```

> Note: remove the existing `bundles.sort(...)` and `return bundles` since they're now inside the disambiguation block above. The sort must remain the final step.

- [ ] **Step 4: Run all tests**

```bash
npm test 2>&1 | grep "pass\|fail" | tail -3
```

Expected: `# pass 182  # fail 0`.

- [ ] **Step 5: Commit**

```bash
git -C /path/to/.worktrees/behavior-cards add src/scanners/behaviors/clustering.js test/behaviors/clustering.test.js
git -C /path/to/.worktrees/behavior-cards commit -m "fix(behaviors): disambiguate duplicate bundle names using deeper URL segment"
```

---

## Task 7: Verify golden fixture and kalakar spot-check

**Files:**
- Possibly update: `test/fixtures/behaviors-app.golden.md`

### What to expect

The fixture code uses old-style `= Depends(...)` syntax and single-line imports, so fixes 3 and 4 don't affect it. No `db.add()` calls in fixtures, so fix 1 has no effect. No duplicate bundle names, so fix 6 has no effect. The ceremony has 3 steps (≥2), so fix 5b has no effect. The fixture subjects (`_load_item` → starts with `load_` → passes SUBJECT_VERBS_RE) remain. The golden should be **unchanged**.

If the golden test fails, read the diff carefully before updating — unexpected changes signal a regression.

- [ ] **Step 1: Run the full test suite**

```bash
npm test 2>&1 | grep "pass\|fail" | tail -3
```

Expected: `# pass 182  # fail 0`.

- [ ] **Step 2: If golden fails, check the diff**

```bash
node --test test/behaviors/golden.test.js 2>&1
```

If the diff is unexpected, do NOT auto-update. Inspect the change and trace it to the fix that caused it. Fix the root cause, not the golden.

If the diff is expected and correct (e.g. a minor phrasing improvement), update the golden:

```bash
cd .worktrees/behavior-cards
node -e "
import { traceBehaviors } from './src/scanners/behaviors/index.js';
// ... run fixture and capture output
" > test/fixtures/behaviors-app.golden.md
```

Actually use the test's own regeneration path:

```bash
REGEN_GOLDEN=1 node --test test/behaviors/golden.test.js
```

Check if the test supports `REGEN_GOLDEN`. If not, run the fixture manually:

```bash
node ./bin/varai.js map test/fixtures/behaviors-app > /tmp/new-golden.md
diff test/fixtures/behaviors-app.golden.md /tmp/new-golden.md
```

Review the diff, update if correct.

- [ ] **Step 3: Spot-check kalakar**

```bash
node ./bin/varai.js map /home/gp/dreamLand/jodulabs/kalakar \
  --include services/backend --include services/frontend/src \
  2>/dev/null > /tmp/kalakar-v2.md
grep -A 8 "### building-model" /tmp/kalakar-v2.md | head -12
```

After fixes 3 and 4 the building-model bundle should now show:
- `needs: get_job_context` (from Annotated[..., Depends()] fix)
- `Subject: building-model document (file, per-job)` (trunkCall unification from multi-line import fix)
- A ceremony line (check revision + persist steps from `_assert_revision` + `_persist_document_with_history`)

If subject or ceremony is still missing, note what's absent and whether it's a further gap (e.g. resolver can't follow `.` relative imports into subdirectories).

```bash
grep "### projects" /tmp/kalakar-v2.md
```

Projects bundle names should be distinct now (e.g. "projects/reference-images", "projects/settings").

- [ ] **Step 4: Commit if golden changed**

```bash
git -C /path/to/.worktrees/behavior-cards add test/fixtures/behaviors-app.golden.md
git -C /path/to/.worktrees/behavior-cards commit -m "test(behaviors): update golden after output quality fixes"
```

If golden unchanged, skip this step.

---

## Self-review

**Spec coverage (defect → task):**
- 1a `stores db (db, db, …)` → Task 1 ✓
- 1b `artifact_map.setdefault().add()` false positive → Task 1 ✓
- 1c chained `.delete()` raw expression → Task 1 ✓
- 2 `reads db (User, User)` dedup → Task 2 ✓
- 3 `Annotated[T, Depends()]` gates → Task 3 ✓
- 4 multi-line imports → Task 4 ✓
- 5a low-confidence subjects → Task 5 ✓
- 5b single-step ceremony → Task 5 ✓
- 6 duplicate bundle names → Task 6 ✓

**Type consistency check:**
- `firstArgModel(callNode, modelNames)` used only in Task 1; `factIndex.modelNames` passed correctly.
- `extractChainedQueryTarget(node, modelNames)` recursive, returns string or null.
- `urlPrefix(p, depth)` default 1 — existing internal callers `urlPrefix(path)` still work.
- `SUBJECT_VERBS_RE`, `GENERIC_VARS` defined at module scope before `deriveSubject` — safe.
- `normalizeImports(content)` pure function, used only in `importsIn` — no side effects.

**No placeholders:** all code blocks are complete and directly pasteable.
