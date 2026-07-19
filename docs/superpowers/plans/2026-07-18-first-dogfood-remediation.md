# First Dogfood Remediation — Implementation Plan

> Status: Superseded as an implementation plan. Relevant scenarios were retained as System Model tests; the Analysis IR architecture was removed.

**Goal:** Make Varai usable in Kalakar's real session-workflow: linked Git worktrees share one semantic history, and the default diff shows semantic contract changes without line-shift noise.

**Dogfood evidence:** The `fix-current-job-response-contract` worktree correctly produced `+ gives CurrentJobResponse` and `+ schema CurrentJobResponse`, but required a one-off cross-store bridge and rendered 17 unrelated evidence-only behavior changes (147 clause entries).

**Compatibility:** Preserve the complete evidence-change information in the structured diff. Change only storage discovery and the default projection/summary; do not discard evidence or change stable semantic identities.

**Implementation result (2026-07-18):** Completed. Direct linked-worktree diff and dashboard lookup resolve the shared baseline. The first dogfood now reports one changed behavior and one added schema by default; 187 evidence-location movements remain available through JSON and `--show-evidence-moves`.

---

## Gate 0 — Land deterministic canonical clauses

### Files

- Modify: `src/ir/canonicalize.js`
- Modify: `src/ir/version.js`
- Modify: `test/semantic/identity.test.js`

### Tasks

- [ ] Merge duplicate clauses with the same stable clause ID.
- [ ] Merge and canonically sort their evidence.
- [ ] When duplicate observations disagree, retain the least-confident claim state.
- [ ] Keep the analyzer version bump so stored output records the analyzer change.
- [ ] Retain the regression proving reversed traversal order produces byte-identical IR.

### Acceptance

- [ ] Two independent Kalakar backend scans produce byte-identical canonical Analysis IR.
- [ ] The complete test suite passes.

---

## Gate 1 — Resolve one shared semantic store for linked worktrees

### Design

Analysis always reads source/config from the requested worktree. Semantic objects, snapshots, and commit refs live under the repository's shared worktree root, derived from Git's common directory.

```text
requested worktree source
  -> git rev-parse --path-format=absolute --git-common-dir
  -> parent of shared .git directory
  -> <shared-root>/.varai/{objects,snapshots,refs}
```

For a normal repository, the shared root equals the requested repository root. The scanner cache remains local to the requested worktree; it is not semantic history.

### Files

- Modify: `src/snapshots/git-state.js`
- Modify: `src/snapshots/store.js`
- Modify: `src/snapshots/snapshot.js`
- Modify: `src/semantic-commands.js`
- Modify: `src/server/index.js`
- Add/modify: `test/snapshots/git-state.test.js`
- Add/modify: `test/snapshots/store.test.js`
- Add: `test/snapshots/worktree.test.js`

### Tasks

- [ ] Extend Git state with absolute `gitCommonDir` and `semanticStoreRoot`.
- [ ] Introduce an async repository/store resolver rather than guessing from the input path.
- [ ] Make `snapshot`, `log`, `diff`, and dashboard baseline lookup use the resolved shared store.
- [ ] Continue scanning and hashing files from the requested worktree.
- [ ] Keep clean commit refs shared; dirty snapshots must not replace them.
- [ ] Produce a precise error for non-Git repositories instead of silently creating unrelated history.
- [ ] Avoid following `.varai` or `.git` through linked-worktree paths.

### Acceptance

- [ ] A snapshot created in a main checkout is visible through `varai log <linked-worktree>`.
- [ ] Bare `varai diff <linked-worktree>` resolves the main checkout's clean baseline for the shared HEAD.
- [ ] Different linked worktrees on different commits resolve their own commit refs.
- [ ] Creating a dirty worktree snapshot cannot overwrite the clean ref.
- [ ] Normal single-worktree repositories retain their existing storage path and behavior.

---

## Gate 2 — Separate semantic changes from evidence movement

### Diff contract

Keep two explicit projections:

```text
semanticChanges  # add/remove/contract/claim-state changes
evidenceChanges  # file/line movement for stable semantic identities
```

Evidence movement is supporting metadata. It is not a changed behavior, fact, state, pattern, or intent artifact in the primary summary.

### Files

- Modify: `src/diff/behaviors.js`
- Modify: `src/diff/facts.js`
- Modify: `src/diff/index.js`
- Modify: `src/diff/summary.js`
- Modify: `src/reporters/diff-markdown.js`
- Modify: `test/diff/behaviors.test.js`
- Add/modify: `test/diff/facts.test.js`
- Add: `test/diff/summary.test.js`

### Tasks

- [ ] Classify behavior clause/door evidence movement separately from semantic clause changes.
- [ ] Classify fact evidence movement separately from fact payload changes.
- [ ] Compare state locations semantically without treating their aggregated evidence as state changes.
- [ ] Apply the same semantic-versus-evidence distinction to pattern and intent-artifact projections where evidence exists.
- [ ] Count a behavior as changed only when it contains at least one semantic clause/claim change.
- [ ] Make `hasChanges` mean semantic changes by default; expose a separate evidence-change count/flag.
- [ ] Preserve evidence changes in JSON so no information is lost.
- [ ] Keep evidence adjacent to every real semantic change.

### Acceptance

- [ ] Inserting a line above 17 stable routes produces zero semantic behavior changes.
- [ ] Adding `CurrentJobResponse` produces exactly one changed behavior and one added schema fact.
- [ ] Moving a handler file remains available as evidence movement but the default semantic diff is empty.
- [ ] New writes, removed gates, schema changes, and confidence regressions remain prominent.

---

## Gate 3 — Add an evidence-movement opt-in projection

### Commands

```text
varai diff <repo-or-worktree>
varai diff <repo-or-worktree> --show-evidence-moves
varai diff <repo-or-worktree> --json
```

JSON always contains both semantic and evidence classifications. `--show-evidence-moves` affects the Markdown projection only.

### Files

- Modify: `bin/varai.js`
- Modify: `src/semantic-commands.js`
- Modify: `src/reporters/diff-markdown.js`
- Add/modify CLI/renderer tests under `test/diff/`

### Tasks

- [ ] Parse and document `--show-evidence-moves`.
- [ ] Hide evidence-only behavior/fact/state sections in default Markdown.
- [ ] When requested, render evidence movements in a collapsed secondary section, grouped by behavior/file rather than mixed with contract changes.
- [ ] Show semantic and evidence counts separately in the summary when evidence output is enabled.
- [ ] Keep `--json` renderer-independent and complete.

### Acceptance

- [ ] Default output for the first dogfood is short and semantic-first.
- [ ] The opt-in output still explains all shifted evidence.
- [ ] JSON and Markdown semantic classifications agree.

---

## Gate 4 — Keep dashboard and CLI on the same projection

### Files

- Modify: `src/server/index.js`
- Modify: `src/ui/app.js`
- Modify: `src/ui/styles.css` only if needed
- Add server/UI data-shape tests where practical

### Tasks

- [ ] Make the dashboard use the semantic summary for badges and primary cards.
- [ ] Do not render evidence-only behaviors as changed cards.
- [ ] Add a secondary evidence-movement disclosure/count when present.
- [ ] Ensure linked-worktree dashboard sessions use the shared baseline store.

### Acceptance

- [ ] CLI and dashboard report one changed behavior for the current-job experiment.
- [ ] Both surfaces expose 17 evidence-only affected behaviors only as secondary information.

---

## Gate 5 — Re-run the exact first dogfood as the release fixture

### Fixture

```text
Main checkout: ../kalakar
Baseline commit: 9aa993dc2ba3b9348d4cdd789488f1b0d97caf76
Baseline snapshot: 10ac6222482369681851dfe2
Task worktree: ../kalakar/.worktrees/fix-current-job-response-contract
Scope: services/backend
```

### Run

```bash
node ./bin/varai.js diff \
  ../kalakar/.worktrees/fix-current-job-response-contract \
  --include services/backend \
  --jobs 1 \
  --no-cache
```

### Expected default output

```text
Behaviors: +0 -0 ~1

~ GET /api/v1/projects/{slug}/current-job
  + gives CurrentJobResponse

Supporting facts:
  + schema CurrentJobResponse
```

Exact formatting may vary, but no unrelated route may appear in the primary output.

### Final verification

- [ ] Direct worktree CLI invocation succeeds without copying `.varai` or using a one-off bridge.
- [ ] Default diff contains one changed behavior and one added schema.
- [ ] `--show-evidence-moves` exposes the known line shifts.
- [ ] `--json` retains both classifications.
- [ ] `npm test` passes.
- [ ] Native/WASM and serial/worker canonical parity still pass on the focused fixture.
- [ ] Repeated Kalakar scans remain byte-identical.
- [ ] `git diff --check` passes.

---

## After this remediation

Run a second real domain experiment that changes an effect or failure contract, not only a response schema. Good candidates are a bounded route change that adds/removes a database or file write, or introduces a new evidenced failure mode. Do not broaden analyzer heuristics until that experiment identifies a concrete missing or false claim.
