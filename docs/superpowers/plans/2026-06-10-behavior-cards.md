# Behavior Cards and Bundles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `## Behaviors` view to `varai map` that groups FastAPI routes into bundles, each behavior carrying what it takes/returns/reads/stores/fails-with, plus four constructs (subject, authored→derived, ceremony, job-scoped) — all recovered deterministically from code.

**Architecture:** A new scan phase (`traceBehaviors`) runs after fact merge inside `scanRepo`, using the shared `ScanContext` parse trees. It is driven by existing `api_route` facts (the doors), traces each handler's signature and a depth-≤2 body walk, clusters behaviors into bundles, derives constructs over each bundle, and attaches `scan.behaviors`. The markdown reporter renders it; the dashboard receives it for free via the existing scan JSON. No general call graph: signature data is robust, body-walk side effects are best-effort, and anything unresolved is recorded as an explicit `untraced` clause so a card never falsely claims "read-only".

**Tech Stack:** Node ESM, `node:test`, native `tree-sitter` + `tree-sitter-python` (node API: `node.type`, `node.text`, `node.startPosition.row`, `node.childForFieldName(name)`, `node.namedChildren`, `node.descendantsOfType(type)`), existing `queryTree`/`ScanContext` helpers.

**Spec:** `docs/superpowers/specs/2026-06-10-behavior-cards-design.md`

---

## Spec reconciliation (read before starting)

The spec's JSON example (lines 54–55) shows env-var reads inside `reads`, but the spec's rendering example (line 129) and the medium prose (line 65) say config/gates render under "needs" and the `reads`/`writes` medium taxonomy is exactly `db | file | memory | queue`. These are reconciled here, once, for the whole plan:

- **`requires`** holds both gates and config, each clause tagged `kind: "dependency" | "config"`. Renders as "needs …". Env-var/config reads (e.g. `JWT_EXPIRATION_MINUTES`, `AUTH_MODE`) go here.
- **`reads` / `writes`** carry `medium ∈ {db, file, memory, queue}` only. v1 ships detectors for `db` and `file`; `memory`/`queue` have no detector yet (never emitted — fine).
- Acceptance fixture 1 passes if `AUTH_MODE`/`JWT_EXPIRATION_MINUTES` appear as config under `requires`.

## Behavior object shape (used by every task — keep identical)

```js
// One behavior:
{
  door:     { method: "POST", path: "/api/auth/login", evidence: { file, line } },
  bundle:   null,                                   // filled by clustering
  requires: [ { name: "get_db", kind: "dependency", evidence, layer: "ast" } ],
  takes:    [ { schema: "LoginRequest", evidence, layer: "ast" } ],
  gives:    [ { schema: "LoginResponse", evidence, layer: "ast" } ],
  reads:    [ { target: "User", kind: "db_model", medium: "db", evidence, layer: "semantic" } ],
  writes:   [ { target: "ProjectArtifact", kind: "db_model", medium: "db", via: "db.commit", evidence, layer: "semantic" } ],
  fails:    [ { status: 401, evidence, layer: "ast" } ],
  untraced: [ { call: "render_to_glb", reason: "external package / depth limit", evidence } ],
  helperCalls: [ "assert_revision", "persist" ],    // same-repo fns walked into; used by ceremony
  trunkCall: "_ensure_persisted_building_model",    // first same-repo identifier call; used by clustering
}
```

`evidence` on a behavior/clause is a single `{ file, line }` object (not the array used by facts).

## File structure

- Create `src/scanners/behaviors/handlers.js` — find each route's handler function node, build the door.
- Create `src/scanners/behaviors/signature.js` — `requires` / `takes` / `gives` from signature + decorator.
- Create `src/scanners/behaviors/resolver.js` — resolve a called name to a same-repo `function_definition` node.
- Create `src/scanners/behaviors/body.js` — depth-≤2 body walk → `reads` / `writes` / `fails` / `untraced` / `helperCalls` / `trunkCall`.
- Create `src/scanners/behaviors/clustering.js` — group behaviors into bundles.
- Create `src/scanners/behaviors/constructs.js` — subject, derived, ceremony, job-scoped over a bundle.
- Create `src/scanners/behaviors/index.js` — `traceBehaviors` orchestrator + fact index.
- Create `src/reporters/behaviors-section.js` — render the `## Behaviors` markdown.
- Modify `src/scanners/index.js` — call `traceBehaviors`, attach `scan.behaviors`.
- Modify `src/reporters/inventory.js` — call `appendBehaviorsSection`.
- Create `test/behaviors/*.test.js` — unit tests per module.
- Create `test/fixtures/behaviors-app/` + `test/fixtures/behaviors-app.golden.md` — golden mini-app.
- Create `docs/kalakar-acceptance-checklist.md` — manual checklist for fixtures 1–9.

---

### Task 1: Handler discovery + door

**Files:**
- Create: `src/scanners/behaviors/handlers.js`
- Test: `test/behaviors/handlers.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/behaviors/handlers.test.js
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createScanContext } from "../../src/scanners/context.js";
import { findHandlers } from "../../src/scanners/behaviors/handlers.js";

test("findHandlers pairs each route fact with its handler function node", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-handlers-"));
  await mkdir(join(dir, "routes"), { recursive: true });
  await writeFile(join(dir, "routes/auth.py"), `from fastapi import APIRouter
router = APIRouter()

@router.post("/api/auth/login")
def login(data):
    return data
`);
  const ctx = createScanContext(dir);
  const routeFacts = [
    { kind: "api_route", name: "POST /api/auth/login", evidence: [{ file: "routes/auth.py", line: 4 }], layer: "ast" },
  ];
  const handlers = await findHandlers(routeFacts, ctx);
  assert.equal(handlers.length, 1);
  assert.equal(handlers[0].door.method, "POST");
  assert.equal(handlers[0].door.path, "/api/auth/login");
  assert.equal(handlers[0].door.evidence.file, "routes/auth.py");
  assert.equal(handlers[0].handlerNode.type, "function_definition");
  assert.equal(handlers[0].handlerNode.childForFieldName("name").text, "login");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/behaviors/handlers.test.js`
Expected: FAIL — cannot find module `handlers.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/scanners/behaviors/handlers.js
import { queryTree } from "../treesitter.js";

// Drive from existing api_route facts (doors already resolved). For each, open
// the file tree, find the decorated_definition whose decorator sits on the
// fact's evidence line, and return its function_definition as the handler node.
export async function findHandlers(routeFacts, ctx) {
  const handlers = [];
  const byFile = new Map();
  for (const fact of routeFacts) {
    const ev = fact.evidence?.[0];
    if (!ev) continue;
    if (!byFile.has(ev.file)) byFile.set(ev.file, []);
    byFile.get(ev.file).push(fact);
  }

  for (const [file, facts] of byFile) {
    const tree = await ctx.tree(file, "python");
    if (!tree) continue;
    const decorated = await queryTree(tree, "python", "(decorated_definition) @dd");

    // Map decorator line -> function_definition node.
    const lineToFn = new Map();
    for (const { node } of decorated) {
      const fn = node.childForFieldName("definition");
      if (!fn || fn.type !== "function_definition") continue;
      for (const child of node.namedChildren) {
        if (child.type === "decorator") {
          lineToFn.set(child.startPosition.row + 1, fn);
        }
      }
    }

    for (const fact of facts) {
      const handlerNode = lineToFn.get(fact.evidence[0].line);
      if (!handlerNode) continue;
      const [method, ...rest] = fact.name.split(" ");
      handlers.push({
        file,
        handlerNode,
        door: { method, path: rest.join(" "), evidence: { ...fact.evidence[0] } },
      });
    }
  }
  return handlers;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/behaviors/handlers.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scanners/behaviors/handlers.js test/behaviors/handlers.test.js
git commit -m "feat(behaviors): handler discovery pairs route facts with function nodes"
```

---

### Task 2: Signature tracer (requires / takes / gives)

**Files:**
- Create: `src/scanners/behaviors/signature.js`
- Test: `test/behaviors/signature.test.js`

`factIndex` is `{ schemaNames: Set, modelNames: Set, envNames: Set }`. `decoratorText` is the raw decorator source (e.g. `@router.post("/x", response_model=LoginResponse)`), passed by the orchestrator.

- [ ] **Step 1: Write the failing test**

```js
// test/behaviors/signature.test.js
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createScanContext } from "../../src/scanners/context.js";
import { queryTree } from "../../src/scanners/treesitter.js";
import { traceSignature } from "../../src/scanners/behaviors/signature.js";

async function firstFn(dir, file) {
  const ctx = createScanContext(dir);
  const tree = await ctx.tree(file, "python");
  const caps = await queryTree(tree, "python", "(function_definition) @fn");
  return caps[0].node;
}

test("traceSignature extracts gates, request schema, response_model, and config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-sig-"));
  await writeFile(join(dir, "auth.py"), `def login(data: LoginRequest, db: Session = Depends(get_db)):
    x = JWT_EXPIRATION_MINUTES
    return data
`);
  const fn = await firstFn(dir, "auth.py");
  const factIndex = {
    schemaNames: new Set(["LoginRequest", "LoginResponse"]),
    modelNames: new Set(["User"]),
    envNames: new Set(["JWT_EXPIRATION_MINUTES"]),
  };
  const out = traceSignature(fn, `@router.post("/login", response_model=LoginResponse)`, "auth.py", factIndex);

  assert.ok(out.requires.some((r) => r.name === "get_db" && r.kind === "dependency"));
  assert.ok(out.requires.some((r) => r.name === "JWT_EXPIRATION_MINUTES" && r.kind === "config"));
  assert.ok(out.takes.some((t) => t.schema === "LoginRequest"));
  assert.ok(out.gives.some((g) => g.schema === "LoginResponse"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/behaviors/signature.test.js`
Expected: FAIL — cannot find module `signature.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/scanners/behaviors/signature.js
const DEPENDS_RE = /Depends\(\s*([A-Za-z_]\w*)/;

// requires: gates (Depends(...)) + config (env-var identifiers referenced in body).
// takes: a parameter whose type annotation matches a known schema name.
// gives: response_model= from the decorator, else a returned *Response constructor.
export function traceSignature(fnNode, decoratorText, file, factIndex) {
  const requires = [];
  const takes = [];
  const gives = [];
  const line = (n) => n.startPosition.row + 1;

  const params = fnNode.childForFieldName("parameters");
  if (params) {
    for (const p of params.namedChildren) {
      const typeNode = p.childForFieldName("type");
      const valueNode = p.childForFieldName("value");
      const typeText = typeNode ? typeNode.text : "";

      if (valueNode && DEPENDS_RE.test(valueNode.text)) {
        requires.push({
          name: valueNode.text.match(DEPENDS_RE)[1],
          kind: "dependency",
          evidence: { file, line: line(p) },
          layer: "ast",
        });
        continue;
      }
      if (typeText && factIndex.schemaNames.has(typeText)) {
        takes.push({ schema: typeText, evidence: { file, line: line(p) }, layer: "ast" });
      }
    }
  }

  const rm = decoratorText.match(/response_model\s*=\s*([A-Za-z_]\w*)/);
  if (rm && factIndex.schemaNames.has(rm[1])) {
    gives.push({ schema: rm[1], evidence: { file, line: line(fnNode) }, layer: "ast" });
  } else {
    // No response_model: look for a returned constructor (XxxResponse / StreamingResponse).
    const body = fnNode.childForFieldName("body");
    if (body) {
      for (const call of body.descendantsOfType("call")) {
        const callee = call.childForFieldName("function");
        const nm = callee ? callee.text : "";
        if (/Response$/.test(nm) || nm === "StreamingResponse") {
          gives.push({ schema: nm, evidence: { file, line: line(call) }, layer: "heuristic" });
          break;
        }
      }
    }
  }

  // config: env-var identifiers referenced anywhere in the function.
  const seen = new Set();
  for (const id of fnNode.descendantsOfType("identifier")) {
    if (factIndex.envNames.has(id.text) && !seen.has(id.text)) {
      seen.add(id.text);
      requires.push({ name: id.text, kind: "config", evidence: { file, line: line(id) }, layer: "semantic" });
    }
  }

  return { requires, takes, gives };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/behaviors/signature.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scanners/behaviors/signature.js test/behaviors/signature.test.js
git commit -m "feat(behaviors): signature tracer for requires/takes/gives"
```

---

### Task 3: Function resolver

**Files:**
- Create: `src/scanners/behaviors/resolver.js`
- Test: `test/behaviors/resolver.test.js`

Resolves a called name to a same-repo top-level `function_definition` node: first looks for a local definition in the calling file, then a `from <mod> import <name>` resolved to a file in the scanned set.

- [ ] **Step 1: Write the failing test**

```js
// test/behaviors/resolver.test.js
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createScanContext } from "../../src/scanners/context.js";
import { createResolver } from "../../src/scanners/behaviors/resolver.js";

test("resolveFunction finds local and imported same-repo functions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-resolver-"));
  await mkdir(join(dir, "pkg"), { recursive: true });
  await writeFile(join(dir, "pkg/helpers.py"), `def persist(doc):\n    pass\n`);
  await writeFile(join(dir, "pkg/routes.py"), `from pkg.helpers import persist\n\ndef local_helper():\n    pass\n\ndef handler():\n    local_helper()\n    persist(1)\n`);
  const ctx = createScanContext(dir);
  const resolver = createResolver(["pkg/helpers.py", "pkg/routes.py"], ctx);

  const local = await resolver.resolveFunction("pkg/routes.py", "local_helper");
  assert.equal(local.file, "pkg/routes.py");
  assert.equal(local.node.childForFieldName("name").text, "local_helper");

  const imported = await resolver.resolveFunction("pkg/routes.py", "persist");
  assert.equal(imported.file, "pkg/helpers.py");
  assert.equal(imported.node.childForFieldName("name").text, "persist");

  assert.equal(await resolver.resolveFunction("pkg/routes.py", "nonexistent"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/behaviors/resolver.test.js`
Expected: FAIL — cannot find module `resolver.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/scanners/behaviors/resolver.js
import path from "node:path";
import { queryTree } from "../treesitter.js";

// Resolve a called name to a same-repo top-level function_definition node.
// v1: local definitions, then direct `from <mod> import <name>` imports. No
// re-export chains, no dynamic dispatch (spec call-graph stance).
export function createResolver(files, ctx) {
  const fileSet = new Set(files.filter((f) => f.endsWith(".py")));
  const modToFile = buildModuleMap(fileSet);
  const fnCache = new Map();   // file -> Map(name -> node)
  const importCache = new Map(); // file -> Map(name -> targetFile)

  async function functionsIn(file) {
    if (fnCache.has(file)) return fnCache.get(file);
    const map = new Map();
    const tree = await ctx.tree(file, "python");
    if (tree) {
      for (const { node } of await queryTree(tree, "python", "(function_definition) @fn")) {
        const nameNode = node.childForFieldName("name");
        if (nameNode) map.set(nameNode.text, node);
      }
    }
    fnCache.set(file, map);
    return map;
  }

  async function importsIn(file) {
    if (importCache.has(file)) return importCache.get(file);
    const map = new Map();
    const content = await ctx.read(file);
    if (content) {
      for (const line of content.split("\n")) {
        const m = line.match(/^\s*from\s+(\.?[\w.]+)\s+import\s+(.+)$/);
        if (!m) continue;
        const target = resolveModule(m[1], file, modToFile, fileSet);
        if (!target) continue;
        for (const raw of m[2].replace(/[()#].*$/, "").split(",")) {
          const nm = raw.trim().split(/\s+as\s+/)[0].trim();
          if (nm && nm !== "*") map.set(nm, target);
        }
      }
    }
    importCache.set(file, map);
    return map;
  }

  return {
    async resolveFunction(fromFile, name) {
      const local = await functionsIn(fromFile);
      if (local.has(name)) return { file: fromFile, node: local.get(name) };
      const imports = await importsIn(fromFile);
      const targetFile = imports.get(name);
      if (targetFile) {
        const fns = await functionsIn(targetFile);
        if (fns.has(name)) return { file: targetFile, node: fns.get(name) };
      }
      return null;
    },
  };
}

function buildModuleMap(fileSet) {
  const map = new Map();
  for (const file of fileSet) {
    const dir = path.dirname(file);
    const base = path.basename(file, ".py");
    const mod = dir === "." ? base : dir.replace(/\//g, ".") + "." + base;
    map.set(mod, file);
    if (base === "__init__" && dir !== ".") map.set(dir.replace(/\//g, "."), file);
  }
  return map;
}

function resolveModule(mod, fromFile, modToFile, fileSet) {
  if (mod.startsWith(".")) {
    const depth = mod.match(/^\.+/)[0].length;
    let dir = path.dirname(fromFile);
    for (let i = 1; i < depth; i++) dir = path.dirname(dir);
    const parts = mod.replace(/^\.+/, "").split(".").filter(Boolean);
    const py = path.join(dir, ...parts) + ".py";
    const init = path.join(dir, ...parts, "__init__.py");
    if (fileSet.has(py)) return py;
    if (fileSet.has(init)) return init;
    return null;
  }
  if (modToFile.has(mod)) return modToFile.get(mod);
  const parts = mod.split(".");
  for (let i = 0; i < parts.length; i++) {
    const suffix = parts.slice(i).join(".");
    for (const [m, f] of modToFile) if (m.endsWith("." + suffix)) return f;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/behaviors/resolver.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scanners/behaviors/resolver.js test/behaviors/resolver.test.js
git commit -m "feat(behaviors): same-repo function resolver (local + direct imports)"
```

---

### Task 4: Body walk — reads / writes (db + file)

**Files:**
- Create: `src/scanners/behaviors/body.js`
- Test: `test/behaviors/body-effects.test.js`

The body walker is the heart of the tracer. This task implements detection of db reads/writes, file writes, and the `trunkCall`. Failure modes, untraced, and depth recursion come in Task 5 — so this task implements `traceBody` walking depth 0 only (handler body), and Task 5 extends it to depth ≤ 2.

Detectors over `call` descendants of the body:
- attribute call `.query(` / `.delete(` → `reads`/`writes` medium `db`, target = first identifier arg if it matches a model name (else the receiver text).
- attribute call `.add(` / `.commit(` / `.refresh(` → `writes` medium `db`, `via` = `<receiver>.<method>`.
- identifier call whose name matches `/(?:dump|persist|save|write|snapshot)/i` with any string/attribute arg → `writes` medium `file`.

- [ ] **Step 1: Write the failing test**

```js
// test/behaviors/body-effects.test.js
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createScanContext } from "../../src/scanners/context.js";
import { queryTree } from "../../src/scanners/treesitter.js";
import { createResolver } from "../../src/scanners/behaviors/resolver.js";
import { traceBody } from "../../src/scanners/behaviors/body.js";

async function fnAndCtx(dir, file) {
  const ctx = createScanContext(dir);
  const tree = await ctx.tree(file, "python");
  const caps = await queryTree(tree, "python", "(function_definition) @fn");
  return { fn: caps[0].node, ctx };
}

test("traceBody detects db reads/writes and file writes at depth 0", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-body-"));
  await writeFile(join(dir, "h.py"), `def render(db):
    project = db.query(Project).first()
    artifact = ProjectArtifact()
    db.add(artifact)
    db.commit()
    _atomic_json_dump(doc, "out.glb")
`);
  const { fn, ctx } = await fnAndCtx(dir, "h.py");
  const resolver = createResolver(["h.py"], ctx);
  const factIndex = { schemaNames: new Set(), modelNames: new Set(["Project", "ProjectArtifact"]), envNames: new Set() };

  const out = await traceBody(fn, "h.py", ctx, resolver, factIndex);

  assert.ok(out.reads.some((r) => r.target === "Project" && r.medium === "db"));
  assert.ok(out.writes.some((w) => w.via === "db.commit" && w.medium === "db"));
  assert.ok(out.writes.some((w) => w.medium === "file"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/behaviors/body-effects.test.js`
Expected: FAIL — cannot find module `body.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/scanners/behaviors/body.js
const FILE_WRITE_RE = /(?:dump|persist|save|write|snapshot)/i;

// v1: depth-0 walk (handler body). Task 5 adds depth-<=2 recursion, fails, untraced.
export async function traceBody(fnNode, file, ctx, resolver, factIndex) {
  const reads = [];
  const writes = [];
  const helperCalls = [];
  let trunkCall = null;

  const body = fnNode.childForFieldName("body");
  if (!body) return { reads, writes, fails: [], untraced: [], helperCalls, trunkCall };

  for (const call of body.descendantsOfType("call")) {
    const callee = call.childForFieldName("function");
    if (!callee) continue;
    const line = call.startPosition.row + 1;

    if (callee.type === "attribute") {
      const method = callee.childForFieldName("attribute").text;
      const receiver = callee.childForFieldName("object").text;
      if (method === "query" || method === "delete") {
        const arg = firstArgIdent(call);
        const target = arg && factIndex.modelNames.has(arg) ? arg : receiver;
        const bucket = method === "delete" ? writes : reads;
        bucket.push({ target, kind: "db_model", medium: "db", via: `${receiver}.${method}`, evidence: { file, line }, layer: "semantic" });
      } else if (method === "add" || method === "commit" || method === "refresh") {
        writes.push({ target: receiver, kind: "db_model", medium: "db", via: `${receiver}.${method}`, evidence: { file, line }, layer: "semantic" });
      }
      continue;
    }

    if (callee.type === "identifier") {
      const name = callee.text;
      if (trunkCall === null) {
        const resolved = await resolver.resolveFunction(file, name);
        if (resolved) { trunkCall = name; if (!helperCalls.includes(name)) helperCalls.push(name); }
      }
      if (FILE_WRITE_RE.test(name)) {
        writes.push({ target: "file", kind: "file", medium: "file", detail: name, evidence: { file, line }, layer: "heuristic" });
      }
    }
  }

  return { reads, writes, fails: [], untraced: [], helperCalls, trunkCall };
}

function firstArgIdent(call) {
  const args = call.childForFieldName("arguments");
  if (!args) return null;
  for (const a of args.namedChildren) {
    if (a.type === "identifier") return a.text;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/behaviors/body-effects.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scanners/behaviors/body.js test/behaviors/body-effects.test.js
git commit -m "feat(behaviors): body walk depth-0 db/file effect detection"
```

---

### Task 5: Body walk — fails, untraced, depth-≤2 recursion

**Files:**
- Modify: `src/scanners/behaviors/body.js`
- Test: `test/behaviors/body-depth.test.js`

Extend `traceBody` to: collect `raise HTTPException(...)` status codes; recurse into resolved same-repo helper calls up to depth 2 (merging their effects and recording their names in `helperCalls`); and record `untraced` for identifier calls that don't resolve to a same-repo function and aren't a known file-write idiom.

- [ ] **Step 1: Write the failing test**

```js
// test/behaviors/body-depth.test.js
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createScanContext } from "../../src/scanners/context.js";
import { queryTree } from "../../src/scanners/treesitter.js";
import { createResolver } from "../../src/scanners/behaviors/resolver.js";
import { traceBody } from "../../src/scanners/behaviors/body.js";

async function fnByName(ctx, file, name) {
  const tree = await ctx.tree(file, "python");
  const caps = await queryTree(tree, "python", "(function_definition) @fn");
  return caps.map((c) => c.node).find((n) => n.childForFieldName("name").text === name);
}

test("traceBody recurses into helpers (<=2), collects fails, records untraced", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-depth-"));
  await writeFile(join(dir, "h.py"), `def persist(doc):
    _atomic_json_dump(doc, "f.json")

def update(db):
    if not ok:
        raise HTTPException(status_code=409, detail="conflict")
    persist(doc)
    external_lib_call(doc)
`);
  const ctx = createScanContext(dir);
  const resolver = createResolver(["h.py"], ctx);
  const factIndex = { schemaNames: new Set(), modelNames: new Set(), envNames: new Set() };
  const fn = await fnByName(ctx, "h.py", "update");

  const out = await traceBody(fn, "h.py", ctx, resolver, factIndex);

  assert.ok(out.fails.some((f) => f.status === 409));
  assert.ok(out.writes.some((w) => w.medium === "file"), "file write found via helper recursion");
  assert.ok(out.helperCalls.includes("persist"));
  assert.ok(out.untraced.some((u) => u.call === "external_lib_call"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/behaviors/body-depth.test.js`
Expected: FAIL — no recursion/fails/untraced yet.

- [ ] **Step 3: Write minimal implementation**

Replace the entire contents of `src/scanners/behaviors/body.js` with:

```js
// src/scanners/behaviors/body.js
const FILE_WRITE_RE = /(?:dump|persist|save|write|snapshot)/i;
const STATUS_RE = /HTTP_(\d{3})\b/;

export async function traceBody(fnNode, file, ctx, resolver, factIndex) {
  const acc = { reads: [], writes: [], fails: [], untraced: [], helperCalls: [], trunkCall: null };
  await walk(fnNode, file, ctx, resolver, factIndex, acc, 0, new Set());
  return acc;
}

async function walk(fnNode, file, ctx, resolver, factIndex, acc, depth, seen) {
  const body = fnNode.childForFieldName("body");
  if (!body) return;

  for (const raise of body.descendantsOfType("raise_statement")) {
    const text = raise.text;
    const line = raise.startPosition.row + 1;
    const named = text.match(STATUS_RE);
    const numeric = text.match(/status_code\s*=\s*(\d{3})/) || text.match(/HTTPException\(\s*(\d{3})/);
    const status = named ? Number(named[1]) : numeric ? Number(numeric[1]) : null;
    if (status && !acc.fails.some((f) => f.status === status)) {
      acc.fails.push({ status, evidence: { file, line }, layer: "ast" });
    }
  }

  for (const call of body.descendantsOfType("call")) {
    const callee = call.childForFieldName("function");
    if (!callee) continue;
    const line = call.startPosition.row + 1;

    if (callee.type === "attribute") {
      const method = callee.childForFieldName("attribute").text;
      const receiver = callee.childForFieldName("object").text;
      if (method === "query" || method === "delete") {
        const arg = firstArgIdent(call);
        const target = arg && factIndex.modelNames.has(arg) ? arg : receiver;
        const bucket = method === "delete" ? acc.writes : acc.reads;
        bucket.push({ target, kind: "db_model", medium: "db", via: `${receiver}.${method}`, evidence: { file, line }, layer: "semantic" });
      } else if (method === "add" || method === "commit" || method === "refresh") {
        acc.writes.push({ target: receiver, kind: "db_model", medium: "db", via: `${receiver}.${method}`, evidence: { file, line }, layer: "semantic" });
      }
      continue;
    }

    if (callee.type !== "identifier") continue;
    const name = callee.text;

    if (FILE_WRITE_RE.test(name)) {
      acc.writes.push({ target: "file", kind: "file", medium: "file", detail: name, evidence: { file, line }, layer: "heuristic" });
    }

    const resolved = await resolver.resolveFunction(file, name);
    if (resolved) {
      if (acc.trunkCall === null) acc.trunkCall = name;
      if (!acc.helperCalls.includes(name)) acc.helperCalls.push(name);
      const key = `${resolved.file}::${name}`;
      if (depth < 2 && !seen.has(key)) {
        seen.add(key);
        await walk(resolved.node, resolved.file, ctx, resolver, factIndex, acc, depth + 1, seen);
      }
    } else if (depth === 0 && !FILE_WRITE_RE.test(name) && !KNOWN_NOISE.has(name)
               && !factIndex.schemaNames.has(name) && !/Response$/.test(name)) {
      // Only the handler's own direct (depth-0) unresolved calls become untraced.
      // Schema/Response constructors are known outputs, not unverified side effects.
      acc.untraced.push({ call: name, reason: "external package / depth limit", evidence: { file, line } });
    }
  }
}

const KNOWN_NOISE = new Set(["HTTPException", "len", "str", "int", "dict", "list", "print"]);

function firstArgIdent(call) {
  const args = call.childForFieldName("arguments");
  if (!args) return null;
  for (const a of args.namedChildren) if (a.type === "identifier") return a.text;
  return null;
}
```

- [ ] **Step 4: Run both body tests to verify they pass**

Run: `node --test test/behaviors/body-effects.test.js test/behaviors/body-depth.test.js`
Expected: PASS (depth-0 detection still works; recursion/fails/untraced now work).

- [ ] **Step 5: Commit**

```bash
git add src/scanners/behaviors/body.js test/behaviors/body-depth.test.js
git commit -m "feat(behaviors): body walk depth-2 recursion, fails, untraced"
```

---

### Task 6: Orchestrator + fact index

**Files:**
- Create: `src/scanners/behaviors/index.js`
- Test: `test/behaviors/trace.test.js`

`traceBehaviors(repoPath, files, ctx, facts)` builds the fact index, finds handlers, traces each behavior's signature + body, attaches the decorator text, and returns `{ behaviors }` (clustering attaches in Task 7; here `bundle` stays null). It must read the decorator text from the handler's `decorated_definition` parent.

- [ ] **Step 1: Write the failing test**

```js
// test/behaviors/trace.test.js
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createScanContext } from "../../src/scanners/context.js";
import { traceBehaviors } from "../../src/scanners/behaviors/index.js";

test("traceBehaviors produces a full behavior for a login route", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-trace-"));
  await mkdir(join(dir, "routes"), { recursive: true });
  await writeFile(join(dir, "routes/auth.py"), `from fastapi import APIRouter, Depends
router = APIRouter()

class LoginRequest: pass
class LoginResponse: pass

@router.post("/api/auth/login", response_model=LoginResponse)
def login(data: LoginRequest, db = Depends(get_db)):
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=401, detail="no")
    return LoginResponse()
`);
  const ctx = createScanContext(dir);
  const facts = [
    { kind: "api_route", name: "POST /api/auth/login", evidence: [{ file: "routes/auth.py", line: 7 }], layer: "ast" },
    { kind: "schema", name: "LoginRequest", evidence: [{ file: "routes/auth.py", line: 4 }], layer: "ast" },
    { kind: "schema", name: "LoginResponse", evidence: [{ file: "routes/auth.py", line: 5 }], layer: "ast" },
    { kind: "db_model", name: "User", evidence: [{ file: "routes/auth.py", line: 1 }], layer: "ast" },
  ];
  const { behaviors } = await traceBehaviors(dir, ["routes/auth.py"], ctx, facts);

  assert.equal(behaviors.length, 1);
  const b = behaviors[0];
  assert.equal(b.door.path, "/api/auth/login");
  assert.ok(b.requires.some((r) => r.name === "get_db"));
  assert.ok(b.takes.some((t) => t.schema === "LoginRequest"));
  assert.ok(b.gives.some((g) => g.schema === "LoginResponse"));
  assert.ok(b.reads.some((r) => r.target === "User"));
  assert.ok(b.fails.some((f) => f.status === 401));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/behaviors/trace.test.js`
Expected: FAIL — cannot find module `index.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/scanners/behaviors/index.js
import { findHandlers } from "./handlers.js";
import { traceSignature } from "./signature.js";
import { traceBody } from "./body.js";
import { createResolver } from "./resolver.js";

export function buildFactIndex(facts) {
  const schemaNames = new Set();
  const modelNames = new Set();
  const envNames = new Set();
  for (const f of facts) {
    if (f.kind === "schema") schemaNames.add(f.name);
    else if (f.kind === "db_model") modelNames.add(f.name);
    else if (f.kind === "env_var") envNames.add(f.name);
  }
  return { schemaNames, modelNames, envNames };
}

export async function traceBehaviors(repoPath, files, ctx, facts) {
  const routeFacts = facts.filter((f) => f.kind === "api_route");
  const factIndex = buildFactIndex(facts);
  const resolver = createResolver(files, ctx);
  const handlers = await findHandlers(routeFacts, ctx);

  const behaviors = [];
  for (const h of handlers) {
    const decoratorText = decoratorTextFor(h.handlerNode);
    const sig = traceSignature(h.handlerNode, decoratorText, h.file, factIndex);
    const body = await traceBody(h.handlerNode, h.file, ctx, resolver, factIndex);
    behaviors.push({
      door: h.door,
      bundle: null,
      requires: sig.requires,
      takes: sig.takes,
      gives: sig.gives,
      reads: body.reads,
      writes: body.writes,
      fails: body.fails,
      untraced: body.untraced,
      helperCalls: body.helperCalls,
      trunkCall: body.trunkCall,
    });
  }
  return { behaviors, resolver };
}

function decoratorTextFor(fnNode) {
  const parent = fnNode.parent;
  if (parent && parent.type === "decorated_definition") {
    for (const child of parent.namedChildren) {
      if (child.type === "decorator") return child.text;
    }
  }
  return "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/behaviors/trace.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scanners/behaviors/index.js test/behaviors/trace.test.js
git commit -m "feat(behaviors): orchestrator wires signature + body per behavior"
```

---

### Task 7: Bundle clustering

**Files:**
- Create: `src/scanners/behaviors/clustering.js`
- Modify: `src/scanners/behaviors/index.js` (call clustering, return `{ bundles }`)
- Test: `test/behaviors/clustering.test.js`

Rules in order: (1) identical non-empty gate-name set AND identical `trunkCall` → one bundle, named from the longest common directory of member door files; (2) remaining → group by URL prefix (first two segments after `/api` and an optional `/vN`); (3) singletons collected under "Other". Each behavior's `bundle` is set to its bundle name.

- [ ] **Step 1: Write the failing test**

```js
// test/behaviors/clustering.test.js
import assert from "node:assert/strict";
import test from "node:test";
import { clusterBundles } from "../../src/scanners/behaviors/clustering.js";

function bhv(path, file, gates, trunk) {
  return { door: { method: "GET", path, evidence: { file, line: 1 } },
    requires: gates.map((g) => ({ name: g, kind: "dependency" })), trunkCall: trunk,
    reads: [], writes: [], gives: [], takes: [], fails: [], untraced: [], helperCalls: [], bundle: null };
}

test("rule 1 groups by shared gate set + trunk; login stays separate", () => {
  const behaviors = [
    bhv("/api/v1/building-model/{job_id}/quantities", "routes/building_model/r.py", ["get_job_context"], "_ensure_doc"),
    bhv("/api/v1/building-model/{job_id}/render", "routes/building_model/r.py", ["get_job_context"], "_ensure_doc"),
    bhv("/api/v1/building-model/{job_id}/elevation", "routes/building_model/r.py", ["get_job_context"], "_ensure_doc"),
    bhv("/api/auth/login", "routes/auth.py", ["get_db"], "verify_password"),
  ];
  const bundles = clusterBundles(behaviors);
  const bm = bundles.find((b) => b.behaviors.length === 3);
  assert.ok(bm, "three building-model behaviors clustered");
  assert.ok(bm.name.includes("building"));
  assert.ok(!bm.behaviors.some((b) => b.door.path === "/api/auth/login"));
});

test("rule 2 groups leftovers by URL prefix", () => {
  const behaviors = [
    bhv("/api/auth/login", "a.py", ["get_db"], null),
    bhv("/api/auth/signup", "a.py", ["get_db2"], null),
  ];
  const bundles = clusterBundles(behaviors);
  const auth = bundles.find((b) => b.name === "auth");
  assert.equal(auth.behaviors.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/behaviors/clustering.test.js`
Expected: FAIL — cannot find module `clustering.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/scanners/behaviors/clustering.js

export function clusterBundles(behaviors) {
  const bundles = [];
  const claimed = new Set();

  // Rule 1: shared non-empty gate set + identical trunkCall.
  const groups = new Map();
  for (const b of behaviors) {
    const gates = b.requires.filter((r) => r.kind === "dependency").map((r) => r.name).sort();
    if (gates.length === 0 || !b.trunkCall) continue;
    const key = gates.join(",") + "|" + b.trunkCall;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const name = urlPrefix(members[0].door.path);  // name from the shared URL segment
    for (const b of members) { b.bundle = name; claimed.add(b); }
    bundles.push({ name, behaviors: members });
  }

  // Rule 2: leftovers by URL prefix.
  const byPrefix = new Map();
  for (const b of behaviors) {
    if (claimed.has(b)) continue;
    const prefix = urlPrefix(b.door.path);
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(b);
  }
  for (const [prefix, members] of byPrefix) {
    if (members.length < 2) continue;
    for (const b of members) { b.bundle = prefix; claimed.add(b); }
    bundles.push({ name: prefix, behaviors: members });
  }

  // Rule 3: singletons under "Other".
  const others = behaviors.filter((b) => !claimed.has(b));
  if (others.length) {
    for (const b of others) b.bundle = "Other";
    bundles.push({ name: "Other", behaviors: others });
  }

  bundles.sort((a, b) => b.behaviors.length - a.behaviors.length);
  return bundles;
}

function urlPrefix(p) {
  const segs = p.split("/").filter(Boolean);
  let i = 0;
  if (segs[i] === "api") i++;
  if (segs[i] && /^v\d+$/.test(segs[i])) i++;
  return (segs[i] || "root").replace(/_/g, "-");
}
```

- [ ] **Step 4: Modify the orchestrator to cluster and return bundles**

In `src/scanners/behaviors/index.js`, add the import at the top:

```js
import { clusterBundles } from "./clustering.js";
```

Change the final `return` of `traceBehaviors` from:

```js
  return { behaviors, resolver };
```

to:

```js
  const bundles = clusterBundles(behaviors);
  return { behaviors, bundles, resolver };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/behaviors/clustering.test.js test/behaviors/trace.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/scanners/behaviors/clustering.js src/scanners/behaviors/index.js test/behaviors/clustering.test.js
git commit -m "feat(behaviors): bundle clustering (gate+trunk, url prefix, other)"
```

---

### Task 8: Constructs — subject + job-scoped

**Files:**
- Create: `src/scanners/behaviors/constructs.js`
- Test: `test/behaviors/constructs-subject.test.js`

`deriveConstructs(bundle, ctx, resolver)` mutates the bundle, adding `subject`, `jobScoped`, `derived`, `ceremony`. This task implements `subject` and `jobScoped`; Task 9 adds `derived`, Task 10 adds `ceremony`. Run all three at task completion of 10.

- **jobScoped**: true if a `{<name>_id}` or `{job_id}` path param is shared by ≥2 members. Records `subject.idParam`.
- **subject**: only for bundles formed by rule 1 (a shared `trunkCall`). Label derived from the trunk function name: strip leading `_`, split on `_`, drop leading verb tokens (`ensure|get|load|fetch|build|persist|persisted|resolve|require`), join remaining with `-`. If the trunk function's `return` statement returns a bare identifier, append that word (e.g. `document`). `medium` from members' write mediums (file beats db if both present — the authored home). Skip subject if no shared trunkCall.

- [ ] **Step 1: Write the failing test**

```js
// test/behaviors/constructs-subject.test.js
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createScanContext } from "../../src/scanners/context.js";
import { createResolver } from "../../src/scanners/behaviors/resolver.js";
import { deriveConstructs } from "../../src/scanners/behaviors/constructs.js";

test("subject label from trunk + return var; jobScoped from {job_id}", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-subj-"));
  await mkdir(join(dir, "bm"), { recursive: true });
  await writeFile(join(dir, "bm/common.py"), `def _ensure_persisted_building_model(ctx):
    document = load(ctx)
    return document
`);
  const ctx = createScanContext(dir);
  const resolver = createResolver(["bm/common.py"], ctx);
  const mk = (p) => ({ door: { method: "GET", path: p, evidence: { file: "bm/common.py", line: 1 } },
    trunkCall: "_ensure_persisted_building_model", requires: [], reads: [], writes: [{ medium: "file" }],
    gives: [], takes: [], fails: [], untraced: [], helperCalls: [], bundle: "building-model" });
  const bundle = { name: "building-model", behaviors: [
    mk("/api/v1/building-model/{job_id}/quantities"),
    mk("/api/v1/building-model/{job_id}/render"),
  ]};

  await deriveConstructs(bundle, ctx, resolver);

  assert.equal(bundle.jobScoped, true);
  assert.equal(bundle.subject.label, "building-model document");
  assert.equal(bundle.subject.medium, "file");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/behaviors/constructs-subject.test.js`
Expected: FAIL — cannot find module `constructs.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/scanners/behaviors/constructs.js
import { queryTree } from "../treesitter.js";

const VERB_TOKENS = new Set(["ensure", "get", "load", "fetch", "build", "persist", "persisted", "resolve", "require"]);
const ID_PARAM_RE = /\{(\w*_id|job_id)\}/;

export async function deriveConstructs(bundle, ctx, resolver) {
  deriveJobScoped(bundle);
  await deriveSubject(bundle, ctx, resolver);
  // deriveDerived(bundle)  — added in Task 9
  // deriveCeremony(bundle) — added in Task 10
}

function deriveJobScoped(bundle) {
  const counts = new Map();
  for (const b of bundle.behaviors) {
    const m = b.door.path.match(ID_PARAM_RE);
    if (m) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  }
  let idParam = null;
  for (const [p, c] of counts) if (c >= 2) idParam = p;
  bundle.jobScoped = idParam !== null;
  if (idParam) bundle.idParam = idParam;
}

async function deriveSubject(bundle, ctx, resolver) {
  const trunk = bundle.behaviors[0]?.trunkCall;
  if (!trunk || !bundle.behaviors.every((b) => b.trunkCall === trunk)) return;

  const tokens = trunk.replace(/^_+/, "").split("_");
  while (tokens.length && VERB_TOKENS.has(tokens[0].toLowerCase())) tokens.shift();
  let label = tokens.join("-");

  const file = bundle.behaviors[0].door.evidence.file;
  const resolved = await resolver.resolveFunction(file, trunk);
  const returnVar = resolved ? returnIdentifier(resolved.node) : null;
  if (returnVar && !label.includes(returnVar)) label = `${label} ${returnVar}`;

  const mediums = new Set();
  for (const b of bundle.behaviors) for (const w of b.writes) mediums.add(w.medium);
  const medium = mediums.has("file") ? "file" : mediums.has("db") ? "db" : null;

  bundle.subject = { label: label.trim(), medium, perJob: !!bundle.jobScoped };
}

function returnIdentifier(fnNode) {
  const body = fnNode.childForFieldName("body");
  if (!body) return null;
  for (const ret of body.descendantsOfType("return_statement")) {
    const child = ret.namedChildren[0];
    if (child && child.type === "identifier") return child.text;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/behaviors/constructs-subject.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scanners/behaviors/constructs.js test/behaviors/constructs-subject.test.js
git commit -m "feat(behaviors): subject + job-scoped construct derivation"
```

---

### Task 9: Construct — authored → derived

**Files:**
- Modify: `src/scanners/behaviors/constructs.js`
- Test: `test/behaviors/constructs-derived.test.js`

`bundle.derived` = the short names of `gives` from read-only members (members with no `writes`). Short name = strip trailing `Response`/`View` and lowercase (e.g. `QuantityTakeoffResponse` → `quantitytakeoff`; keep simple — strip suffix, lowercase). Only set when the bundle has a `subject`.

- [ ] **Step 1: Write the failing test**

```js
// test/behaviors/constructs-derived.test.js
import assert from "node:assert/strict";
import test from "node:test";
import { _deriveDerived } from "../../src/scanners/behaviors/constructs.js";

test("derived lists read-only members' gives, skips mutating members", () => {
  const bundle = {
    subject: { label: "building-model document" },
    behaviors: [
      { writes: [], gives: [{ schema: "QuantitiesResponse" }] },
      { writes: [], gives: [{ schema: "ElevationResponse" }] },
      { writes: [{ medium: "file" }], gives: [{ schema: "RenderResponse" }] }, // mutating, excluded
    ],
  };
  _deriveDerived(bundle);
  assert.deepEqual(bundle.derived.sort(), ["elevation", "quantities"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/behaviors/constructs-derived.test.js`
Expected: FAIL — `_deriveDerived` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/scanners/behaviors/constructs.js`, add the function and export it, and call it from `deriveConstructs`:

```js
export function _deriveDerived(bundle) {
  if (!bundle.subject) return;
  const names = new Set();
  for (const b of bundle.behaviors) {
    if (b.writes.length > 0) continue;
    for (const g of b.gives) {
      const short = g.schema.replace(/(Response|View)$/i, "").toLowerCase();
      if (short) names.add(short);
    }
  }
  bundle.derived = [...names];
}
```

And in `deriveConstructs`, replace the comment line `// deriveDerived(bundle) — added in Task 9` with:

```js
  _deriveDerived(bundle);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/behaviors/constructs-derived.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scanners/behaviors/constructs.js test/behaviors/constructs-derived.test.js
git commit -m "feat(behaviors): authored->derived construct"
```

---

### Task 10: Construct — ceremony

**Files:**
- Modify: `src/scanners/behaviors/constructs.js`
- Test: `test/behaviors/constructs-ceremony.test.js`

Ceremony recovered from repetition among mutating members (members with `writes.length > 0`). A "ceremony step" is a `helperCalls` name present in ≥60% of mutating members. Map known helper names to plain labels via regex; unknown helpers keep their raw name. Adherence: a mutating member is adherent if its `helperCalls` includes every ceremony step. Requires ≥3 mutating members (per spec); fewer → no ceremony.

```
labels: /assert.*rev|revision/i → "check revision"
        /persist|dump|save|write/i → "persist"
        /undo|snapshot|history/i → "save undo"
```

A member's `helperCalls` already includes names gathered transitively (depth ≤2) by the body walk — so a member that calls `_persist_document_with_history` (which internally calls `push_undo_snapshot` + `_atomic_json_dump`) surfaces both `persist` and `save undo`. This is what makes fixtures' two by-hand files count as adherent.

- [ ] **Step 1: Write the failing test**

```js
// test/behaviors/constructs-ceremony.test.js
import assert from "node:assert/strict";
import test from "node:test";
import { _deriveCeremony } from "../../src/scanners/behaviors/constructs.js";

test("ceremony recovered from >=3 mutating members; deviant reported", () => {
  const mut = (helpers) => ({ writes: [{ medium: "file" }], helperCalls: helpers, door: { path: "/x" } });
  const bundle = {
    behaviors: [
      mut(["_assert_revision", "_persist_document_with_history", "push_undo_snapshot"]),
      mut(["_assert_revision", "_persist_document_with_history", "push_undo_snapshot"]),
      mut(["_assert_revision", "_persist_document_with_history", "push_undo_snapshot"]),
      mut(["_persist_document"]), // deviant: missing revision + undo
      { writes: [], helperCalls: [], door: { path: "/read" } }, // read-only, ignored
    ],
  };
  _deriveCeremony(bundle);
  assert.deepEqual(bundle.ceremony.steps, ["check revision", "persist", "save undo"]);
  assert.equal(bundle.ceremony.followed, 3);
  assert.equal(bundle.ceremony.total, 4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/behaviors/constructs-ceremony.test.js`
Expected: FAIL — `_deriveCeremony` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/scanners/behaviors/constructs.js`, add and export:

```js
const CEREMONY_LABELS = [
  [/assert.*rev|revision/i, "check revision"],
  [/persist|dump|save|write/i, "persist"],
  [/undo|snapshot/i, "save undo"],
];

// Map a helper name to a known ceremony label, or null if it is not part of the
// ceremony vocabulary. Wrapper names (e.g. apply_mutation) map to null so they
// never become spurious steps; only recognized actions count toward the ceremony.
function labelFor(helper) {
  for (const [re, label] of CEREMONY_LABELS) if (re.test(helper)) return label;
  return null;
}

export function _deriveCeremony(bundle) {
  const mutating = bundle.behaviors.filter((b) => b.writes.length > 0);
  if (mutating.length < 3) return;

  // Count label occurrences across mutating members (dedupe labels per member).
  // Only recognized ceremony labels count; unmapped helpers are ignored.
  const labelCounts = new Map();
  const memberLabels = mutating.map((b) => {
    const labels = new Set(b.helperCalls.map(labelFor).filter(Boolean));
    for (const l of labels) labelCounts.set(l, (labelCounts.get(l) || 0) + 1);
    return labels;
  });

  const threshold = mutating.length * 0.6;
  const ORDER = ["check revision", "persist", "save undo"];
  const steps = [...labelCounts.entries()]
    .filter(([, c]) => c >= threshold)
    .map(([l]) => l)
    .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
  if (steps.length === 0) return;

  let followed = 0;
  const deviants = [];
  memberLabels.forEach((labels, i) => {
    if (steps.every((s) => labels.has(s))) followed++;
    else deviants.push(mutating[i].door.path);
  });

  bundle.ceremony = { steps, followed, total: mutating.length, deviants };
}
```

And in `deriveConstructs`, replace `// deriveCeremony(bundle) — added in Task 10` with:

```js
  _deriveCeremony(bundle);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/behaviors/constructs-ceremony.test.js test/behaviors/constructs-subject.test.js test/behaviors/constructs-derived.test.js`
Expected: PASS.

- [ ] **Step 5: Wire deriveConstructs into the orchestrator**

In `src/scanners/behaviors/index.js`, add import:

```js
import { deriveConstructs } from "./constructs.js";
```

Change the clustering tail of `traceBehaviors` from:

```js
  const bundles = clusterBundles(behaviors);
  return { behaviors, bundles, resolver };
```

to:

```js
  const bundles = clusterBundles(behaviors);
  for (const bundle of bundles) await deriveConstructs(bundle, ctx, resolver);
  return { behaviors, bundles };
```

- [ ] **Step 6: Run the trace test to confirm nothing broke**

Run: `node --test test/behaviors/trace.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/scanners/behaviors/constructs.js src/scanners/behaviors/index.js test/behaviors/constructs-ceremony.test.js
git commit -m "feat(behaviors): ceremony construct from repetition; wire constructs into orchestrator"
```

---

### Task 11: Markdown rendering

**Files:**
- Create: `src/reporters/behaviors-section.js`
- Test: `test/behaviors/render.test.js`

`appendBehaviorsSection(lines, behaviorsResult)` pushes a `## Behaviors (N across M bundles)` section. Per bundle: header with job-scoped + gate note; subject line, derived line, ceremony line when present; then one line per behavior in plain words.

Plain-word rendering per behavior:
- `takes X` if `takes`; `returns X` if `gives`.
- `reads <medium> (targets)` grouped by medium; `stores <medium> (targets)` for writes.
- `needs <names>` from `requires` (dependency names + "config" names rendered as "X config").
- `fails with N, N` from `fails`.
- read-only rule: if no `writes` and no `untraced` → prefix `reads only`. If no `writes` but `untraced.length` → `no writes found · N calls unverified`.

- [ ] **Step 1: Write the failing test**

```js
// test/behaviors/render.test.js
import assert from "node:assert/strict";
import test from "node:test";
import { appendBehaviorsSection } from "../../src/reporters/behaviors-section.js";

test("renders bundle header, subject, ceremony, and plain-word behavior lines", () => {
  const result = { bundles: [{
    name: "building-model", jobScoped: true,
    subject: { label: "building-model document", medium: "file", perJob: true },
    derived: ["quantities", "elevation"],
    ceremony: { steps: ["check revision", "persist", "save undo"], followed: 33, total: 33, deviants: [] },
    behaviors: [
      { door: { method: "GET", path: "/api/v1/building-model/{job_id}/quantities" },
        requires: [{ name: "get_job_context", kind: "dependency" }], takes: [], gives: [{ schema: "QuantitiesResponse" }],
        reads: [], writes: [], fails: [{ status: 409 }], untraced: [] },
      { door: { method: "POST", path: "/api/v1/building-model/{job_id}/render" },
        requires: [{ name: "get_job_context", kind: "dependency" }], takes: [], gives: [{ schema: "RenderResponse" }],
        reads: [], writes: [{ target: "file", medium: "file" }, { target: "ProjectArtifact", medium: "db" }], fails: [], untraced: [] },
    ],
  }]};
  const lines = [];
  appendBehaviorsSection(lines, result);
  const out = lines.join("\n");
  assert.ok(out.includes("## Behaviors (2 across 1 bundles)"));
  assert.ok(out.includes("### building-model (2) — job-scoped"));
  assert.ok(out.includes("Subject: building-model document (file"));
  assert.ok(out.includes("mutation ceremony: check revision · persist · save undo — followed by 33/33"));
  assert.ok(out.includes("reads only"));
  assert.ok(out.includes("stores file") && out.includes("db (ProjectArtifact)"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/behaviors/render.test.js`
Expected: FAIL — cannot find module `behaviors-section.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/reporters/behaviors-section.js
export function appendBehaviorsSection(lines, result) {
  const bundles = result?.bundles ?? [];
  if (bundles.length === 0) return;
  const total = bundles.reduce((n, b) => n + b.behaviors.length, 0);

  lines.push(`## Behaviors (${total} across ${bundles.length} bundles)`, "");

  for (const bundle of bundles) {
    const gates = sharedGates(bundle);
    const head = [`### ${bundle.name} (${bundle.behaviors.length})`];
    if (bundle.jobScoped) head.push("job-scoped");
    if (gates) head.push(`needs: ${gates}`);
    lines.push(head.join(" — "), "");

    if (bundle.subject) {
      const med = bundle.subject.medium ? ` (${bundle.subject.medium}${bundle.subject.perJob ? ", per-job" : ""})` : "";
      lines.push(`  Subject: ${bundle.subject.label}${med}`);
    }
    if (bundle.derived?.length) {
      lines.push(`  derived (recomputed, never edited directly): ${bundle.derived.join(", ")}`);
    }
    if (bundle.ceremony) {
      const c = bundle.ceremony;
      const tail = c.deviants?.length ? ` — followed by ${c.followed}/${c.total} (deviants: ${c.deviants.join(", ")})`
                                      : ` — followed by ${c.followed}/${c.total}`;
      lines.push(`  mutation ceremony: ${c.steps.join(" · ")}${tail}`);
    }
    if (bundle.subject || bundle.ceremony) lines.push("");

    for (const b of bundle.behaviors) lines.push(`  ${renderBehavior(b)}`);
    lines.push("");
  }
}

function sharedGates(bundle) {
  const sets = bundle.behaviors.map((b) => new Set(b.requires.filter((r) => r.kind === "dependency").map((r) => r.name)));
  if (sets.length === 0) return "";
  const shared = [...sets[0]].filter((g) => sets.every((s) => s.has(g)));
  return shared.join(", ");
}

function renderBehavior(b) {
  const door = `${b.door.method.padEnd(5)} ${b.door.path}`;
  const parts = [];

  const readonly = b.writes.length === 0;
  if (readonly) parts.push(b.untraced.length ? `no writes found · ${b.untraced.length} calls unverified` : "reads only");

  if (b.takes.length) parts.push(`takes ${b.takes.map((t) => t.schema).join(", ")}`);
  if (b.gives.length) parts.push(`returns ${b.gives.map((g) => g.schema).join(", ")}`);

  const reads = byMedium(b.reads);
  for (const [m, ts] of reads) parts.push(`reads ${m} (${ts.join(", ")})`);
  const writes = byMedium(b.writes);
  for (const [m, ts] of writes) parts.push(`stores ${m}${ts.length ? ` (${ts.join(", ")})` : ""}`);

  const config = b.requires.filter((r) => r.kind === "config").map((r) => r.name);
  if (config.length) parts.push(`needs ${config.join(", ")} config`);

  if (b.fails.length) parts.push(`fails with ${b.fails.map((f) => f.status).join(", ")}`);

  return `${door}    ${parts.join(" · ")}`;
}

function byMedium(clauses) {
  const m = new Map();
  for (const c of clauses) {
    if (!m.has(c.medium)) m.set(c.medium, []);
    if (c.target && c.target !== "file") m.get(c.medium).push(c.target);
  }
  return [...m.entries()];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/behaviors/render.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reporters/behaviors-section.js test/behaviors/render.test.js
git commit -m "feat(behaviors): markdown rendering of bundles, subject, ceremony, cards"
```

---

### Task 12: Wire into scanRepo and the inventory reporter

**Files:**
- Modify: `src/scanners/index.js` (around lines 160–177)
- Modify: `src/reporters/inventory.js` (around lines 11–12)
- Test: `test/behaviors/integration.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/behaviors/integration.test.js
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { renderInventory } from "../../src/reporters/inventory.js";

test("scanRepo attaches behaviors and renderInventory shows the section", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-bint-"));
  await mkdir(join(dir, "routes"), { recursive: true });
  await writeFile(join(dir, "pyproject.toml"), `[project]\nname="x"\ndependencies=["fastapi"]\n`);
  await writeFile(join(dir, "routes/auth.py"), `from fastapi import APIRouter, Depends
router = APIRouter()

class LoginRequest: pass

@router.post("/api/auth/login")
def login(data: LoginRequest, db = Depends(get_db)):
    raise HTTPException(status_code=401, detail="no")

@router.post("/api/auth/signup")
def signup(data: LoginRequest, db = Depends(get_db)):
    return data
`);
  const scan = await scanRepo(dir, { cache: false });
  assert.ok(scan.behaviors, "scan.behaviors attached");
  assert.ok(scan.behaviors.bundles.length >= 1);

  const md = renderInventory({ repoPath: dir, scan });
  assert.ok(md.includes("## Behaviors"));
  assert.ok(md.includes("/api/auth/login"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/behaviors/integration.test.js`
Expected: FAIL — `scan.behaviors` is undefined.

- [ ] **Step 3: Wire the tracer into scanRepo**

In `src/scanners/index.js`, add the import near the other extractor imports (after line 16, `import { tagStock } ...`):

```js
import { traceBehaviors } from "./behaviors/index.js";
```

Then in `scanRepo`, locate this block (lines ~162–177):

```js
  const merged = [...dedupedFacts, ...derivedFacts];
  tagStock(merged, options.config ?? {});
  const finalFacts = sortFacts(merged);

  // "base" is an internal always-on stack; don't surface it to the report.
  const displayStacks = [...stacks].filter((s) => s !== "base");

  const sectionCounts = countByKind(finalFacts);
  const summary = {
    fileCount: files.length,
    factCount: finalFacts.length,
    stacks: displayStacks,
    sectionCounts
  };

  return { summary, stacks: displayStacks, files, facts: finalFacts };
```

Replace it with (adds the behavior trace after final facts, attaches to the result):

```js
  const merged = [...dedupedFacts, ...derivedFacts];
  tagStock(merged, options.config ?? {});
  const finalFacts = sortFacts(merged);

  // Behavior trace: a post-fact pass that needs parse trees, so it runs here
  // with the main-thread ctx (parses on demand; v1 accepts an uncached trace).
  let behaviors = { bundles: [] };
  if (stacks.has("fastapi")) {
    try {
      const traced = await traceBehaviors(repoPath, files, ctx, finalFacts);
      behaviors = { bundles: traced.bundles };
    } catch (err) {
      process.stderr.write(`varai: behavior trace failed (${err.message})\n`);
    }
  }

  // "base" is an internal always-on stack; don't surface it to the report.
  const displayStacks = [...stacks].filter((s) => s !== "base");

  const sectionCounts = countByKind(finalFacts);
  const summary = {
    fileCount: files.length,
    factCount: finalFacts.length,
    stacks: displayStacks,
    sectionCounts
  };

  return { summary, stacks: displayStacks, files, facts: finalFacts, behaviors };
```

- [ ] **Step 4: Wire the section into the reporter**

In `src/reporters/inventory.js`, add the import at the top (after line 1):

```js
import { appendBehaviorsSection } from "./behaviors-section.js";
```

Then in `renderInventory`, immediately after `appendSummary(lines, scan);` (line 11) and before `appendStandardPatternsSection(lines, scan.facts);`, add:

```js
  appendBehaviorsSection(lines, scan.behaviors);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/behaviors/integration.test.js`
Expected: PASS.

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS (all existing tests still green; behavior tests green).

- [ ] **Step 7: Commit**

```bash
git add src/scanners/index.js src/reporters/inventory.js test/behaviors/integration.test.js
git commit -m "feat(behaviors): wire tracer into scanRepo and inventory reporter"
```

---

### Task 13: Golden fixture mini-app

**Files:**
- Create: `test/fixtures/behaviors-app/pyproject.toml`
- Create: `test/fixtures/behaviors-app/app/models.py`
- Create: `test/fixtures/behaviors-app/app/common.py`
- Create: `test/fixtures/behaviors-app/app/items.py`
- Create: `test/fixtures/behaviors-app/app/auth.py`
- Create: `test/fixtures/behaviors-app.golden.md`
- Test: `test/behaviors/golden.test.js`

A minimal FastAPI app exercising every clause type and all four constructs: an `items` bundle (shared `get_ctx` gate + `_load_item` trunk; read-only `quantities`/`elevation`, an `export` returning StreamingResponse, and ≥3 mutating routes following the ceremony), plus a standalone `auth` login.

- [ ] **Step 1: Create the fixture app files**

`test/fixtures/behaviors-app/pyproject.toml`:

```toml
[project]
name = "behaviors-app"
version = "0.0.0"
dependencies = ["fastapi", "sqlalchemy"]
```

`test/fixtures/behaviors-app/app/models.py`:

```python
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Item(Base):
    __tablename__ = "items"


class ItemArtifact(Base):
    __tablename__ = "item_artifacts"
```

`test/fixtures/behaviors-app/app/common.py`:

```python
from fastapi import HTTPException


def get_ctx(job_id):
    return {"job_id": job_id}


def _load_item(ctx):
    document = read_from_disk(ctx)
    return document


def assert_revision(document, base):
    if document is None:
        raise HTTPException(status_code=409, detail="conflict")


def persist_document(document):
    _atomic_json_dump(document, "item.json")


def push_undo_snapshot(document):
    save_snapshot(document)


def apply_mutation(ctx, document, base, fn):
    assert_revision(document, base)
    persist_document(document)
    push_undo_snapshot(document)
    return document
```

`test/fixtures/behaviors-app/app/items.py`:

```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.common import get_ctx, _load_item, apply_mutation, assert_revision, persist_document, push_undo_snapshot

router = APIRouter(prefix="/api/v1/items")


class QuantitiesResponse(BaseModel):
    total: int


class ElevationResponse(BaseModel):
    view: str


class MutationResponse(BaseModel):
    revision: int


@router.get("/{job_id}/quantities", response_model=QuantitiesResponse)
def quantities(ctx = Depends(get_ctx)):
    document = _load_item(ctx)
    return QuantitiesResponse(total=compute_quantities(document))


@router.get("/{job_id}/elevation", response_model=ElevationResponse)
def elevation(ctx = Depends(get_ctx)):
    document = _load_item(ctx)
    return ElevationResponse(view=compute_elevation(document))


@router.get("/{job_id}/export")
def export(ctx = Depends(get_ctx)):
    document = _load_item(ctx)
    return StreamingResponse(render_pdf(document))


@router.patch("/{job_id}/site", response_model=MutationResponse)
def update_site(ctx = Depends(get_ctx)):
    document = _load_item(ctx)
    return apply_mutation(ctx, document, 1, update_site_fn)


@router.patch("/{job_id}/grid", response_model=MutationResponse)
def update_grid(ctx = Depends(get_ctx)):
    document = _load_item(ctx)
    return apply_mutation(ctx, document, 1, update_grid_fn)


@router.patch("/{job_id}/constraint", response_model=MutationResponse)
def update_constraint(ctx = Depends(get_ctx)):
    document = _load_item(ctx)
    assert_revision(document, 1)
    persist_document(document)
    push_undo_snapshot(document)
    return MutationResponse(revision=2)
```

`test/fixtures/behaviors-app/app/auth.py`:

```python
import os
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.models import Item

router = APIRouter(prefix="/api/auth")

JWT_EXPIRATION_MINUTES = os.getenv("JWT_EXPIRATION_MINUTES")


class LoginRequest(BaseModel):
    email: str


class LoginResponse(BaseModel):
    token: str


@router.post("/login", response_model=LoginResponse)
def login(data: LoginRequest, db = Depends(get_db)):
    x = JWT_EXPIRATION_MINUTES
    user = db.query(Item).first()
    if not user:
        raise HTTPException(status_code=401, detail="bad")
    return LoginResponse(token="t")
```

- [ ] **Step 2: Write the golden test (generate-then-assert)**

```js
// test/behaviors/golden.test.js
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { appendBehaviorsSection } from "../../src/reporters/behaviors-section.js";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "../fixtures/behaviors-app");
const goldenPath = join(here, "../fixtures/behaviors-app.golden.md");

test("behaviors golden output is stable", async () => {
  const scan = await scanRepo(appDir, { cache: false });
  const lines = [];
  appendBehaviorsSection(lines, scan.behaviors);
  const actual = lines.join("\n") + "\n";

  if (process.env.UPDATE_GOLDEN) {
    await writeFile(goldenPath, actual);
  }
  const expected = await readFile(goldenPath, "utf8");
  assert.equal(actual, expected);
});
```

- [ ] **Step 3: Generate the golden file and inspect it by hand**

Run: `UPDATE_GOLDEN=1 node --test test/behaviors/golden.test.js`
Then read `test/fixtures/behaviors-app.golden.md` and verify against the spec by eye:
- An `items` bundle: job-scoped, gate `get_ctx`, Subject `items document` (file, per-job) or `item document`, derived includes `quantities`, `elevation`; ceremony `check revision · persist · save undo — followed by 3/3`.
- `export` shows `no writes found · N calls unverified` or `reads only`.
- A separate `auth` bundle/Other with `login`: `takes LoginRequest · returns LoginResponse · reads db (Item) · needs JWT_EXPIRATION_MINUTES config · fails with 401`.

If any line contradicts the spec, fix the relevant tracer module (not the golden) and regenerate. Only when it reads correctly, keep the generated golden.

- [ ] **Step 4: Run the golden test without the update flag**

Run: `node --test test/behaviors/golden.test.js`
Expected: PASS (committed golden matches fresh output).

- [ ] **Step 5: Commit**

```bash
git add test/fixtures/behaviors-app test/fixtures/behaviors-app.golden.md test/behaviors/golden.test.js
git commit -m "test(behaviors): golden fixture mini-app exercising all clauses and constructs"
```

---

### Task 14: Kalakar acceptance checklist

**Files:**
- Create: `docs/kalakar-acceptance-checklist.md`

The spec's fixtures 1–9 are a manual checklist (kalakar is not vendored into the test suite). This task records how to run the lens against kalakar and what to verify, so judgment day is repeatable.

- [ ] **Step 1: Write the checklist document**

```markdown
# Kalakar Acceptance Checklist — Behavior Cards v1

Run the lens against kalakar and check the nine fixtures from
`docs/superpowers/specs/2026-06-10-behavior-cards-design.md`.

## Run

    node ./bin/varai.js map ../kalakar \
      --include services/backend --include services/frontend/src > /tmp/kalakar-behaviors.md

Open `/tmp/kalakar-behaviors.md` and read the `## Behaviors` section.

## Behavior fixtures (1–5)

- [ ] 1. `POST /api/auth/login` — takes LoginRequest, returns LoginResponse; reads db (User);
      needs JWT_EXPIRATION_MINUTES / AUTH_MODE config; fails with 401, 403.
- [ ] 2. `GET /api/v1/building-model/{job_id}/quantities` — needs get_job_context; reads only
      OR "no writes found · N calls unverified"; returns QuantityTakeoffResponse; fails with 409.
- [ ] 3. `POST /api/v1/building-model/{job_id}/render` — needs get_job_context; stores file (.glb)
      and db (ProjectArtifact); returns WorkspaceRenderResponse.
- [ ] 4. `GET /api/v1/building-model/{job_id}/elevation-view/{direction}` — needs get_job_context;
      reads only; returns ElevationViewResponse; fails with 400.
- [ ] 5. `POST /api/v1/building-model/{job_id}/sheet-export` — needs get_job_context; reads only;
      returns a stream; fails with 400.
- [ ] Bundle: routes 2–5 cluster into one `building-model` bundle; route 1 does not.

## Construct fixtures (6–9)

- [ ] 6. Subject = building-model document (file, per-job), phases readable.
- [ ] 7. quantities / elevation / sheet marked derived; none marked authored.
- [ ] 8. Ceremony (check revision · persist · save undo) recovered; `dimensions.py` and
      `compound_walls.py` (by-hand persisters) reported adherent, not deviant.
- [ ] 9. building-model bundle is job-scoped; auth is not.

## Verdict

For each card, note: rings true / wrong (tracer bug) / hollow (construct gap), and the
untraced-clause density. Record findings to drive the next iteration.
```

- [ ] **Step 2: Run the checklist against kalakar once and record results inline**

Run: `node ./bin/varai.js map ../kalakar --include services/backend --include services/frontend/src > /tmp/kalakar-behaviors.md`
Then read the Behaviors section and tick what holds; note any wrong/hollow cards at the bottom of the checklist doc (do not fix tracer logic here — record only; fixes are a follow-up driven by what you learn).

- [ ] **Step 3: Commit**

```bash
git add docs/kalakar-acceptance-checklist.md
git commit -m "docs(behaviors): kalakar acceptance checklist for fixtures 1-9"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** Behavior/door/clauses (Tasks 1–6), call-graph stance via depth-≤2 + untraced (Tasks 4–5), bundles (Task 7), subject/derived/ceremony/job constructs (Tasks 8–10), plain-word rendering with read-only honesty (Task 11), scanRepo+reporter wiring (Task 12), golden fixture (Task 13), kalakar fixtures 1–9 (Task 14). The `medium` taxonomy is `db|file|memory|queue` with only db/file detectors in v1 (documented in the reconciliation note).
- **Determinism:** No LLM anywhere. Every clause derives from tree-sitter nodes and existing facts.
- **Honesty rule enforced in rendering:** a behavior with `untraced` clauses never prints "reads only" — it prints "no writes found · N calls unverified" (Task 11, `renderBehavior`).
- **Type consistency:** the behavior object shape at the top is the single source of truth; `helperCalls`/`trunkCall` flow body → clustering/constructs; `factIndex` is `{schemaNames, modelNames, envNames}` everywhere.
- **Deferred (out of v1 scope, per spec):** frontend tracing, scripts/workers/pages as doors, diff/snapshots/checks, dashboard UI panel (behaviors already reach the dashboard via `scan.behaviors` in the SSE payload; a dedicated UI view is a follow-up), memory/queue detectors, ceremony step ordering checks.
```
