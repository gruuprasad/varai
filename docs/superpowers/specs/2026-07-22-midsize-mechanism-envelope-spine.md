# Mid-size Mechanism → Envelope Spine

**Date:** 2026-07-22  
**Status:** Implemented (analyzer increments; Region still not promoted)  
**Depends on:** `docs/superpowers/specs/2026-07-19-semantic-assembly-acceptance-corpus.md`

## Goal

Make the mechanism → behavioral-envelope spine reliable on mid-size real repositories
(Khoj, Papermark), not only Kalakar fixtures. Region / Observed Areas promotion stays out of
scope until envelopes exist outside the Kalakar corpus.

## Spine

```text
api_route observations
  → API behavior doors (traced Python handlers, or stub doors for Next.js)
  → UI invokes matched by HTTP method/path
  → reference Claims
  → systemPaths
  → behavioralEnvelopes
```

Literal `invokes` never enter paths. Missing operation extraction therefore yields zero envelopes.

## Analyzer changes

1. **FastAPI named routers** (`fastapi.routes.v1`)
   - Decorators such as `@api_content.get` / `@auth_router.post` extract as `api_route`.
   - Empty paths `""` are allowed and combine with `include_router` prefixes.
   - Route arguments must be URL paths (`""` or `/…`); receivers such as `mock` /
     `responses` / `cache` / `limiter` are rejected so test decorators do not become operations.
2. **Next.js routes** (`nextjs.routes.v1`)
   - App Router `app/**/route.ts` exported HTTP handlers.
   - Pages Router `pages/api/**` method branches (`req.method === …`).
   - Dynamic segments `[param]` → `*`; route groups `(ee)` stripped from URLs.
   - Unhandled (non-Python) routes still become API behavior doors so UI matching works.
   - Concrete UI paths (e.g. `/api/teams/42/documents`) uniquely bind to patterned doors.

Fixture proof: `test/fixtures/nextjs-api-join/` and
`test/system-model/mechanism-envelope-spine.test.js`.

## Live mid-size results (2026-07-22)

### Khoj (`src/khoj`, migrations excluded)

| Metric | Before | After |
|---|---:|---:|
| operations | 0 | 101 |
| frames | 1 | 102 |

Named routers and prefixes recover the API surface. UI→API envelopes on Khoj still need the Next
web client scanned under nested package detection (deferred).

### Papermark (`app`, `components`, `pages`, `lib`)

| Metric | Before | After |
|---|---:|---:|
| operations | 0 | 274 |
| invokes (literal / reference) | 186 / 0 | 77 / 109 |
| system paths | 0 | 109 |
| behavioral envelopes | 0 | 93 |

Envelopes are mostly `open` (thin effect/subject closure). That is expected: this slice restores
the join spine, not domain Resource closure.

## Explicit non-goals

- Promoting Region into the kernel, snapshots, or diff
- Django / Prisma entity extractors
- Nested monorepo `package.json` stack detection beyond root Next/React
- Closing Papermark envelopes to `closed` completeness

## Next evidence question

With envelopes present on a mid-size SaaS, resume Resource-subject and effect binding so some
envelopes become partial/closed—then revisit region parent boundaries.
