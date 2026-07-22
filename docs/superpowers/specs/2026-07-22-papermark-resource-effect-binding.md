# Papermark Resource/Effect Binding

**Date:** 2026-07-22  
**Status:** Implemented (analyzer increment; Region still not promoted)  
**Depends on:** `docs/superpowers/specs/2026-07-22-midsize-mechanism-envelope-spine.md`,
`docs/superpowers/plans/2026-07-22-papermark-resource-effect-binding.md`

## Goal

Close thin Next.js API envelope terminals by binding same-file Prisma client calls to
named `db_model` Resources, so some mid-size SaaS envelopes become `partial`/`closed`
instead of staying `open` after UI→API joins alone.

## Architecture

```text
prisma.models.v1 (*.prisma model blocks)
  → db_model observations
  → declaration registry seed (no Python AST required)
  → Next.js stub doors enriched with prisma.<delegate>.<op> effects
  → bindBehaviorReferents + lift api.effect Claims
  → behavioralEnvelopes gain primarySubjectIds
```

Kernel completeness rules are unchanged. This slice does not follow helpers into `lib/**`
and does not invent Resources from REST path segments.

## Analyzer changes

1. **`prisma.models.v1`** — text extract of `model Name {` from `*.prisma` (including
   multi-file `prisma/schema/` folders). Stack `prisma` from `@prisma/client` / `prisma`
   deps or any walked `.prisma` file.
2. **Declaration registry seed** — orphan `db_model` facts become persisted declarations
   when no Python class AST exists for that name.
3. **`classifyPrismaEffects`** — AST walk of route files for
   `prisma|db .<delegate> .<create|update|delete|find*|…>`; `$transaction` / raw SQL skipped.
4. **Stub-door enrichment** — after Next.js stub doors are minted, attach reads/writes from
   the door’s source file when models are known.

## Fixture proof

`test/fixtures/prisma-dataroom-create/` + `test/system-model/prisma-resource-binding.test.js`:

- UI `AddDataroomModal` → `POST /api/datarooms` → `creates Dataroom` → envelope not `open`
- UI `UpdateDocumentButton` → patterned documents update → `changes Document`
- `POST /api/documents` with no Prisma call does **not** invent a Document effect

## Live Papermark results (2026-07-22)

Scan of `.scratch/eval-repos/papermark` on this branch (serial fallback after worker retry):

| Metric | Spine-only | After this slice |
|---|---:|---:|
| entity Resources | 0 | 75 (includes Document, Dataroom, …) |
| reference effect Claims | 0 | 968 |
| behavioral envelopes | 93 | 113 |
| envelopes `open` / `partial` / `closed` | ~93 / 0 / 0 | **22 / 0 / 91** |

Examples with `Dataroom` primary subject: Create dataroom from folder, Duplicate Dataroom,
handle Freeze, handle Submit (closed). Examples with `Document`: Complete, handle Bulk Hide,
and other UI actions whose matched route files call `prisma.document.*` (closed).

## Explicit non-goals (still deferred)

- Region promotion / Observed Areas polish
- Roadmap §3 analyzer-contract refactor
- Khoj nested-stack web UI scanning
- Full TypeScript value-flow / following Prisma through `lib/api/**` helpers
- Application-operation hop for Prisma aggregates

## Next evidence question

Many Papermark routes only call shared `lib/**` helpers. Same-file enrichment leaves those
terminals open. Bounded helper follow (or a thin application-operation path for Prisma
delegates) is the natural next increment—still before Region promotion.
