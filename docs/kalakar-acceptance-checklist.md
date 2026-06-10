# Kalakar Acceptance Checklist — Behavior Cards v1

Run the lens against kalakar and check the nine fixtures from
`docs/superpowers/specs/2026-06-10-behavior-cards-design.md`.

## Run

    node ./bin/varai.js map ../kalakar \
      --include services/backend --include services/frontend/src > /tmp/kalakar-behaviors.md

Open `/tmp/kalakar-behaviors.md` and read the `## Behaviors` section.

## Behavior fixtures (1–5)

- [x] 1. `POST /api/auth/login` — takes LoginRequest, returns LoginResponse; reads db (User);
      needs AUTH_MODE config (JWT_EXPIRATION_MINUTES not present — rings true, that env var appears in config/env not as a literal in auth code);
      fails missing (rings true: auth handler raises via a helper `raise_unauthorized`, not a direct HTTPException in the handler body — depth-2 walk can't resolve it).
- [x] 2. `GET /api/v1/building-model/{job_id}/quantities` — "stores file" instead of reads-only because all building-model routes funnel through `_ensure_persisted_building_model` which writes; returns QuantityTakeoffResponse; fails with 409. Rings true.
- [x] 3. `POST /api/v1/building-model/{job_id}/render` — returns WorkspaceRenderResponse; stores file and db; needs MODELS_DIR config. Rings true.
- [x] 4. `GET /api/v1/building-model/{job_id}/elevation-view/{direction}` — returns ElevationViewResponse; stores file; fails with 400. Rings true.
- [x] 5. `POST /api/v1/building-model/{job_id}/sheet-export` — takes SheetExportRequest; returns StreamingResponse; stores file; fails with 400. Rings true.
- [x] Bundle: building-model bundle (115 routes) — routes 2-5 cluster correctly; route 1 (auth) is in a separate `auth` bundle. Rings true.

## Construct fixtures (6–9)

- [ ] 6. Subject = building-model document (file, per-job): *hollow* — no subject rendered for the building-model bundle. The trunkCall (`_ensure_doc`) may not be uniform across all 115 members, or the resolver can't find it at the bundle's file location.
- [ ] 7. quantities / elevation / sheet marked derived: *hollow* — no derived shown for building-model (depends on subject being set, which is missing).
- [ ] 8. Ceremony (check revision · persist · save undo) recovered: *hollow* — no ceremony rendered for the building-model bundle. The mutating member count may be below 3 that share the same set of ceremony-labeled helpers, or the helperCalls from depth-2 walk don't surface the labels broadly enough.
- [x] 9. building-model bundle is job-scoped; auth is not. Rings true.

## Verdict

For each card, note: rings true / wrong (tracer bug) / hollow (construct gap), and the
untraced-clause density. Record findings to drive the next iteration.

### Summary

- 5/9 fixtures ring true (1–5 bundle, 9 job-scoped).
- 3/9 hollow (6–8: subject, derived, ceremony). These depend on trunkCall resolution and ceremony detection across a complex codebase. Follow-up iteration should improve resolver robustness for modules vs packages, and ceremony label matching against the actual kalakar helper naming conventions.
- 1 fixture partially rings true (1: login fails missing due to depth limit on indirect raises).
- Untraced density is low (1 for login, 0 for most routes), meaning the body walk is effectively tracing the first-order handler code.
