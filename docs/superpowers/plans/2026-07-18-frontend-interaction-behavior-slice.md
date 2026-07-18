# Frontend Interaction Behavior Slice

## Goal

Make Varai detect the semantic change exposed by the second Kalakar dogfood run: the `CreateProjectModal` dismissal action becomes unavailable while project creation is loading.

The first slice must produce one stable behavior change with two evidence locations:

```text
~ CreateProjectModal dismissal
  + disabled when loading
```

It must not claim that dismissal is restored after failure. That conclusion requires state-flow analysis beyond what the JSX alone proves.

## Product decisions

- Treat the shared callback action—not an individual button label or source position—as the semantic identity. Both `onClick={onClose}` controls belong to `CreateProjectModal`'s dismissal action.
- Represent frontend actions as behaviors in the Analysis IR, alongside HTTP behaviors, using a typed door such as `{ kind: "ui_action", source, component, event, action }`.
- Add a first-class `guards` clause collection. The initial clause is `{ kind: "disabled_when", condition: "loading" }`.
- Merge duplicate clauses by semantic identity so the header close button and Cancel button yield one clause carrying two evidence locations.
- Emit only direct AST observations in this slice: identifier callbacks and identifier-valued `disabled` attributes. Unsupported expressions remain absent or explicitly diagnosed; they are never upgraded into confident behavior claims.
- Keep labels out of identity. `aria-label` and visible text may help rendering, but changing them must not remove and re-add the behavior.

## Implementation plan

### 1. Lock the dogfood finding into a fixture

Add a minimal before/after React fixture under `test/fixtures/frontend-interaction/`:

- `before/package.json` and `after/package.json` with a Vite/React marker.
- `before/src/components/CreateProjectModal.tsx` with two `onClick={onClose}` controls and no loading guard.
- `after/src/components/CreateProjectModal.tsx` with `disabled={loading}` on both controls.
- Preserve a small `useState(false)` declaration, form submit handler, and `createProject()` call so the fixture remains representative, but do not assert lifecycle inference yet.

Add an end-to-end failing test that scans both directories and diffs their Analysis IR. Assert:

- zero added or removed behaviors;
- exactly one changed UI behavior;
- exactly one added `guards` clause: `disabled_when loading`;
- exactly two evidence locations on that clause;
- no API, navigation, success, or failure semantic changes.

Critical files:

- `test/fixtures/frontend-interaction/before/src/components/CreateProjectModal.tsx`
- `test/fixtures/frontend-interaction/after/src/components/CreateProjectModal.tsx`
- `test/frontend-interaction-diff.test.js`

### 2. Extract deterministic JSX interaction observations

Refactor `src/scanners/extractors/react-vite.js` only as needed to parse component files with tree-sitter instead of relying solely on component regexes.

Add a focused helper module, preferably `src/scanners/frontend/interactions.js`, that:

1. Finds exported function components, including `export default function Name(...)` used by Kalakar.
2. Walks JSX opening/self-closing elements within the component.
3. Recognizes event attributes whose value is a direct identifier expression, initially `onClick={onClose}`.
4. Recognizes a direct identifier guard on the same element, initially `disabled={loading}`.
5. Groups observations by normalized source file + component + normalized event + callback identifier. The source file prevents unrelated same-named components from colliding; element type, label, line, evidence, and guard condition remain outside identity.
6. Emits one UI behavior per group and attaches source lines from all matching controls.

Keep extraction backend-neutral by using only the documented tree node contract (`type`, `text`, `namedChildren`, `childForFieldName`, and positions). Add focused native and WASM extractor tests for TSX node handling.

Do not infer that `onClose` means dismissal solely from English prose. A small deterministic presentation mapping may render `onClose` as “dismissal”; the stored identity remains the callback symbol.

Critical files:

- `src/scanners/extractors/react-vite.js`
- `src/scanners/frontend/interactions.js` (new)
- `test/extractors/react-vite.test.js`
- `test/extractors/react-vite-ext.js`

### 3. Promote UI observations into the versioned Analysis IR

Generalize behavior identity in `src/ir/identity.js`:

- Preserve the existing HTTP identity exactly.
- Add UI identity based on `ui_action + normalized source file + component + event + action`.
- Reject or diagnose doors without a recognized kind rather than silently hashing empty HTTP fields.

Extend canonicalization, validation, semantic expectation evaluation, and behavior diffing to include `guards` as a recognized clause collection. Give guard identity a typed payload `{ kind, condition }`; evidence must not affect semantic identity.

Wire React behavior extraction into `scanRepo` whenever the `react-vite` stack is active. Merge it with FastAPI behavior output rather than making the stacks mutually exclusive, so a full-stack repo produces both HTTP and UI behaviors.

Because the serialized IR shape changes, increment `ANALYSIS_SCHEMA_VERSION`. Increment `ANALYZER_VERSION` so snapshot comparisons clearly warn across analyzer generations. Update validation and compatibility tests accordingly.

Critical files:

- `src/scanners/index.js`
- `src/ir/identity.js`
- `src/ir/canonicalize.js`
- `src/ir/validate.js`
- `src/ir/version.js`
- `src/diff/behaviors.js`
- `src/semantic/evaluate.js`
- `test/semantic/identity.test.js`
- `test/semantic/analysis-ir.test.js`
- `test/diff/behaviors.test.js`

### 4. Render the new behavior without HTTP assumptions

Update all behavior presentation surfaces to dispatch on door kind:

- Markdown semantic diff renders `CreateProjectModal dismissal` and `disabled when loading`.
- Inventory/behavior rendering presents the current UI action and its guards.
- Dashboard uses the same formatter or equivalent structured fields; it must not show `undefined undefined` for a UI door.
- JSON output remains structured and retains both evidence locations.

Centralize door and clause labels if practical so CLI and dashboard terminology cannot drift.

Critical files:

- `src/reporters/diff-markdown.js`
- `src/reporters/behaviors-section.js`
- `src/ui/app.js`
- any new shared presentation helper and its focused tests

### 5. Invalidate caches and prove execution parity

Because extractor logic changes, bump `EXTRACTOR_VERSION` in `src/scanners/cache.js` in the same commit.

Verify the fixture through every scanner execution path:

- serial and worker scans produce byte-identical Analysis IR;
- native and WASM parsers produce equivalent UI behaviors and evidence;
- cached and uncached scans agree after the extractor-version bump;
- repeated scans/diffs are deterministic;
- existing FastAPI behavior identity and semantic diffs remain unchanged.

Critical files:

- `src/scanners/cache.js`
- `test/scanner-parity.test.js`
- `test/cache.test.js`
- relevant tree-sitter parity tests

### 6. Re-run the real Kalakar dogfood scenario

Because the Analysis IR schema changes, recreate the clean Kalakar frontend baseline snapshot with the upgraded analyzer, then scan the linked worktree `fix-create-project-modal-pending` with the identical `services/frontend/src` scope and scan options. Do not compare the old schema-v1 snapshot to schema v2.

Acceptance output:

```text
Behaviors: +0 -0 ~1

~ CreateProjectModal dismissal
  + disabled when loading
```

The JSON diff must show one `ui_action` behavior, one added guard clause, and evidence for both changed JSX controls. The added accessible label may appear as evidence/supporting metadata but must not determine identity or create a second semantic change.

Record the exact command and observed output in the dogfood notes or the implementation commit message so this remains a reproducible regression scenario.

## Verification commands

Run, at minimum:

```bash
npm test
node --test test/extractors/react-vite.test.js test/extractors/react-vite-ext.js
node --test test/semantic/identity.test.js test/semantic/analysis-ir.test.js
node --test test/diff/behaviors.test.js test/frontend-interaction-diff.test.js
```

Then run scanner parity under native/WASM and serial/worker modes using the repository's existing parity test options, followed by the real Kalakar snapshot-to-worktree diff.

## Non-goals for this slice

- Proving that failure re-enables dismissal by correlating `setLoading(false)` with the JSX guard.
- General React control-flow, hook dependency, or state-machine analysis.
- Inline callback identity, compound guard normalization such as `loading || !valid`, or callback aliases.
- Treating CSS disabled classes as behavior evidence.
- Deriving behavior identity from button text, `aria-label`, DOM position, or test descriptions.
- Extracting semantic intent from frontend tests.

## Follow-up slice

After this vertical slice survives another real dogfood task, add bounded component-local state-flow: identify state setters, associate state transitions with async action success/failure/finally paths, and only then support claims such as “dismissal is restored after failure.”
