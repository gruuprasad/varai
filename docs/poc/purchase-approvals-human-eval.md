# Purchase Approvals — Human Evaluation Protocol

> Historical evaluation protocol. It remains the recommended human-learning
> template, but it targets the earlier purchase-approval pilot rather than the
> current Signal demonstration.

Protocol from Gate 8 of
[product-control-room.md](../product-control-room.md) and the product-control-room
POC plan (`docs/superpowers/plans/2026-07-28-product-control-room-poc.md` on the
main checkout).

**Status: pending.** This session did not recruit five target users. Do not treat
the product release gate as passed until this protocol is completed.

## Participants

Recruit at least five target users (product owners / operators who would decide
whether a purchase-approval build is ready — not only engineers who wrote the
POC).

## Tasks

Give each participant these five tasks, using only the Varai control room against
the sibling POC at `../varai-purchase-approvals-poc` (or
`VARAI_POC_PATH`):

1. Explain who may approve which request using only Blueprint.
2. Change the approval threshold through chat.
3. Decide whether to accept a newly proposed public endpoint.
4. Identify why a deliberately broken build is not ready.
5. Find the frontend, backend, and data evidence without reading a full diff.

## Capture metrics

For each participant, record:

| Metric | Target |
| --- | --- |
| Time to first approved Seed | — |
| Assistant turns and unresolved items | — |
| Manual JSON edits | 0 |
| Manual binding edits by the human | 0 |
| Time to understand a failed rule | — |
| False-green count | 0 |
| Unaccounted-surface detection of seeded extras | 100% |
| Critical scenario execution | 100% |
| Explanation accuracy (auth model) before/after Blueprint | — |
| Chooses blueprint/change UI over raw builder chat for second change | yes |

## Product release gate (human portion)

Proceed toward a product only if, in addition to the nine technical trials:

- all five users can make the threshold change without JSON/code;
- at least four of five correctly explain the authorization model and broken build;
- the runtime mapping requires no per-change manual repair by the product owner;
- the architecture view changes at least one real user decision;
- verification adds understandable confidence rather than merely more status.

## Stop or pivot (from the plan)

Stop expanding the builder/control-room product if meaningful policies cannot be
expressed without implementation vocabulary, runtime verification requires
bespoke per-app test code, a seeded authorization/surface fault can still produce
`ready`, users treat the blueprint as decoration, or keeping mappings current
costs more human effort than reviewing generated code.
