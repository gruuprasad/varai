# Purchase Approvals — Technical Trial Results

Gate 8 adversarial proof for the product control room.

- **POC path:** `/home/gp/dreamLand/jodulabs/varai-purchase-approvals-poc`
- **Varai branch:** `feat/product-control-room-slice-1` (worktree)
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
| 5 | Unexpected DELETE | not ready | `needs_attention` | `unaccounted-surface:` reason; surfaceProblems.unaccounted > 0 |
| 6 | Coverage poisoning | not ready | `needs_attention` | coverageRegressions with `transition: degraded` |
| 7 | Pure refactor | still ready | `ready` | helpers relocated; no scenario/surface/requirement regression |
| 8 | Product change (threshold) | progression exists | progression with seedDiff | `context.manager-limit` → 20000; blueprint before/after; two ready sessions |
| 9 | Outside-session edit | unattested | `provenanceHint.state = unattested` | post-ready edit via `recordBuildIntervention` |

## How to reproduce

```bash
cd /home/gp/dreamLand/jodulabs/varai/.worktrees/feat/product-control-room-slice-1
test -d /home/gp/dreamLand/jodulabs/varai-purchase-approvals-poc
export PATH="$HOME/.local/bin:$PATH"
node --test test/poc/*.test.js
```

Optional: `VARAI_POC_PATH=/absolute/path/to/poc`.

## Notes

- UI surfaces were slimmed from the example Seed; API surfaces + scenarios still
  express all seven product rules. Frontend scaffold exists; Varai scan
  `include` is `backend` only.
- Manager limit defaults to 10000 (`context.manager-limit` / `PURCHASE_MANAGER_LIMIT`).
- Trials clone the POC into temp dirs; the sibling repo stays the green baseline.
