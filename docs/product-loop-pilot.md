# Product-loop pilot: Slotkeeper

Date: 2026-07-28

The trials ran in a detached disposable Git worktree of Slotkeeper. The normal
pilot checkout was not modified.

## Baseline and recorded carry-forward

The approved format-1 Seed was explicitly migrated to format 2 and approved.
The realization was updated to the new approved semantic hash, then Varai ran:

```text
varai build begin <worktree> --no-cache
varai build close <worktree> --mode carry-forward --no-cache
varai check <worktree> --no-cache
```

Session `build:2c812b05d7b25c644cf6` closed as `carry-forward`. The later
check reported `recorded_carry_forward`, 12 `holds`, 1 `cannot_verify`, and 4
recorded-only `performs` requirements. This validates the provenance seam:
the builder map was current *and* attributable to an exact completed build.

## Dishonest-binding trial

The `resource.booking` binding was intentionally changed to point at the
existing `Slot` entity, which was already bound by `resource.slot`. The check
reported five affected bindings as `ambiguous` / `concept-collision` and their
requirements as `cannot_verify`; it did not report any false `holds`.

| Trial | Expected | Observed |
| --- | --- | --- |
| Carry-forward provenance | Recorded session | `recorded_carry_forward` |
| Colliding binding | No false pass | 0 false passes; 5 ambiguous bindings |

## Current release-gate result

### Exact-coverage omission trial

A separate disposable worktree added the small requirement
`commitment.trial-creates-booking`, bound to `POST /api/trial-bookings`. Its
initial `db.add(Booking(...))` implementation held. A `built` session,
`build:5eb3224bf7e75f8de57e`, then replaced that write with `return None`.
The closed report recorded one `violated` result with
`claim-absent-under-analyzed-coverage` and exact
`api.effect: analyzed` coverage for that route.

This closes the key soundness proof: a real omitted implementation becomes
`violated`, not `cannot_verify`, only when its exact scope is analyzed.

The original availability requirement remains `cannot_verify` because its
framework trace is partial. That is an analyzer-coverage opportunity, not a
candidate for a sound absence verdict.
