# Kalakar Acceptance Checklist — Anchor Lift

This checklist evaluates whether Varai makes Kalakar understandable at system level. It does not require framework-shaped cards or a fixed number of anchors.

## Focused scan

```bash
node ./bin/varai.js map ../kalakar \
  --include services/frontend/src \
  --include services/backend \
  --include src/kalakar
```

## Questions the model must answer

- [x] Is `BuildingModel` or `BuildingModelDocument` recovered as a Resource subject?
- [x] Does the Resource cite the declaration and the convergent interactions that promoted it?
- [x] Are wall editing, storey deletion, import, rendering, and export retained as distinct Behaviors?
- [x] Can a selected Behavior be followed through its API/UI reach and ordered implementation path to source?
- [x] Are public request/response contracts visible while private intermediate DTOs stay out of the default overview?
- [x] Can a developer find where wall rendering happens without starting from a route/file inventory?
- [x] Are unresolved file effects, calls, or representation links shown as partial/ambiguous coverage rather than invented Resources?
- [x] Does the default view remain subject-oriented while all canonical Elements stay searchable?

## Invariance checks

- [x] Splitting or renaming a private helper changes evidence/implementation paths only.
- [x] Adding a route to an existing Resource does not rename or replace the Resource.
- [x] Changing a public contract field produces a structural semantic diff.
- [x] Same-named declarations are not merged without structural linkage.

## Guardrails

After the focused Kalakar run, scan Varai and Trux. Record findings as one of:

- analyzer capability gap;
- semantic-language gap;
- prominence/ranking issue;
- renderer/navigation issue.

Do not change kernel vocabulary or promotion rules solely to improve a Kalakar label or ranking.

## 2026-07-19 dogfood result

- Kalakar: 1,100 source files produced 762 Elements and 3,349 Claims. `BuildingModelDocument` ranked first with 29 connected Behaviors.
- Coverage stayed explicit: 14 grouped diagnostics remained (10 unresolved effect targets, 2 untraced-call groups, and 2 exhausted analysis budgets).
- Varai and Trux currently expose analyzer capability gaps: their CLI/library and Flutter application structures do not yet produce useful subject roots. This is not evidence for expanding the semantic kernel.
- The next work is analyzer coverage and resolution precision, not new System Model vocabulary.
