# ADR 0002: Stock catalog ships in source with per-repo override

Status: Superseded by ADR 0004

The stock catalog and its configuration were removed during the one-model consolidation. Common-pattern classification may return later only as evidence-backed System Model Claims or an explicitly separate overlay; it is not a parallel fact product.

## Context

The lens gains a "stock pattern" axis — recognizable SaaS/building-block patterns (`auth`, `payment`, `file_storage`, `email`, `notifications`, `settings`, `health`) — that facts are matched against. The catalog of stock patterns and their signatures (kind, name regex, path regex, role) must live somewhere.

Three options:

1. **Shipped default in source, no override.** Every user gets the same catalog. Simple and deterministic. Companies with internal "stock" patterns (their own SSO pattern, their audit-logging convention) have no way to extend or adapt the tool.
2. **Per-repo config only.** Every repo declares its own catalog via `varai.config.json`. Full flexibility, but zero value out of the box — most users would not write a catalog, and the lens would feel empty on first run.
3. **Shipped default + per-repo override.** Defaults ship in `src/scanners/extractors/stock-catalog.js` (reviewed in-tree, versioned with the tool). A repo can `disable` patterns or `additional` extend the catalog via the existing `varai.config.json` under a `stock` block. Small surface area; no new config file; defaults carry the value; the escape hatch preserves flexibility for advanced users.

## Decision

Option 3: shipped default in source with a declared override mechanism in `varai.config.json`.

## Consequences

- The defaults are the primary value. Most users get useful stock tagging on first run with zero configuration — the same way integration extraction works out of the box.
- Companies with internal patterns have a small, declared override mechanism. The override schema is documented and validated; additional signatures use the same shape as shipped defaults, including the `role` field (curated in v1 even though no v1 consumer reads it — retrofitting roles across a grown user-catalog later is a migration risk that costs nothing to prevent now).
- The catalog is versioned with the tool. Adding a new pattern or updating a shipped signature ships behind a SemVer bump. No "is the user on the catalog version from before the signature change?" question.
- The override is a potential foot-gun if a user disables a pattern and later forgets. The risk is acceptable: the user explicitly declared the disable, the residual "Custom" bucket is still honest, and the disabled entry is visible in `varai.config.json` under version control.
