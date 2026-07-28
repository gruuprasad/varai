# Purchase Approvals — Technical Trial Results

Gate 8 adversarial proof for the product control room.

- **POC path:** `/home/gp/dreamLand/jodulabs/varai-purchase-approvals-poc`
- **POC HEAD:** `3957b29`
- **Varai branch:** `feat/product-control-room-slice-1` (worktree)
- **Varai HEAD:** *(see latest `fix(poc): harden trial honesty…` commit)*
- **Harness:** `test/poc/purchase-approvals-trials.test.js`
- **Human eval:** **pending** — see [purchase-approvals-human-eval.md](purchase-approvals-human-eval.md)
- **Product release gate:** **not passed** (human evaluation required before go/no-go)

## Technical criteria assessment

| Criterion | Result |
| --- | --- |
| All nine technical trials produce expected state | **passed** |
| False greens | **0** |
| Human evaluation (5 users) | **pending** |
| Product go/no-go | **blocked on human eval** |

**Conclusion:** technical proof **passed**; human eval **required** before product go/no-go.

## Trial summary

| # | Trial | Expected | Observed | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Green build | `ready` | `ready` | 9/9 scenarios passed; surfaces missing/unaccounted/ambiguous/stale = 0 |
| 2 | Omitted audit | not ready | `needs_attention` | scenario failures on audit-recording journeys |
| 3 | Inverted authorization | not ready | `needs_attention` | `scenario.non-owner-cannot-withdraw` failed |
| 4 | State corruption after denial | not ready | `needs_attention` | `scenario.non-owner-cannot-withdraw` failed (follow-up state) |
| 5 | Unexpected DELETE | not ready; positives hold | `needs_attention` | `scenarios.failed === 0`, no requirement regressions, `unaccounted > 0` |
| 6 | Coverage poisoning | not ready | `needs_attention` | coverageRegressions with `transition: degraded` |
| 7 | Pure refactor | still ready | `ready` | helpers relocated; no scenario/surface/requirement regression |
| 8 | Product change (programmatic Seed draft+ratify) | progression exists | progression with seedDiff | threshold → 20000; chat Change deferred to human eval |
| 9 | Outside-session edit | unattested | `provenanceHint.state = unattested` | real file edit + watcher-style `recordBuildIntervention` → `runBuildStatus` |

## How to reproduce

```bash
cd /home/gp/dreamLand/jodulabs/varai/.worktrees/feat/product-control-room-slice-1
test -d /home/gp/dreamLand/jodulabs/varai-purchase-approvals-poc
export PATH="$HOME/.local/bin:$PATH"
node --test test/poc/*.test.js
# or: node scripts/poc-trials.js   # fails hard if POC missing
```

Optional: `VARAI_POC_PATH=/absolute/path/to/poc`.

Without a sibling POC, `npm test` / `node --test test/poc/*.test.js` **skips** the nine
adversarial trials (harness unit tests still run). `scripts/poc-trials.js` remains
the explicit Gate 8 runner and exits non-zero if the POC is absent.

## Notes

- UI surfaces were slimmed from the example Seed; API surfaces + scenarios still
  express all seven product rules. Frontend scaffold exists; Varai scan
  `include` is `backend` only.
- Manager limit defaults to 10000 (`context.manager-limit` / `PURCHASE_MANAGER_LIMIT`).
- Trials clone the POC into temp dirs; the sibling repo stays the green baseline.
- POC discovery: `VARAI_POC_PATH`, else sibling of git main checkout (`--git-common-dir`),
  else walk-up from the worktree looking for `varai-purchase-approvals-poc` next to `varai/`.
- Trial 9 does not claim filesystem-alone detection: the product marks post-ready
  edits unattested via watcher → `recordBuildIntervention` (same path exercised here).
- Trial 8 proves Seed/implementation progression with programmatic draft+ratify;
  multi-turn chat Change is left to human evaluation.
