# Stock Catalog — One-Page Design
_2026-06-07 — rev 2, incorporates review feedback_

## Recap

The lens currently tags facts only by `kind` (api_route, db_model, package, …) and `layer` (ast, heuristic, semantic). The user wants a third, orthogonal axis: **`stock`** — which recognizable SaaS/app building block a fact belongs to. The renderer groups facts into "Standard Auth / Standard Payment / …" and a residual "Custom to this app" bucket. This is the spec at `docs/superpowers/specs/2026-06-06-varai-simplification-design.md:138` followed: positive stock-pattern matches are recoverable, positive *domain* naming is not.

### Long-term framing

The stock axis is the first step toward a **middle language** — a representation above code, below intent spec, that varai *decompiles out of* generated code. That language has three vocabulary classes:

1. **Stock idioms** — recognized building blocks (this PR).
2. **Domain vocabulary** — the residual; what's custom to *this* app. Only meaningful if stock matches are high-precision, which is why the catalog stays conservative.
3. **Composition** — how idioms and domain pieces wire together (future).

The target shape is not flat tags but **pattern instances with roles**: not "these 9 facts are tagged `auth`" but "one auth subsystem: provider=clerk, session_model=Session, routes={login, logout, refresh}, credential=JWT_SECRET" — the way a decompiler lifts instructions into a for-loop with an induction variable, not tags them "loop-ish". v1 ships flat tags (recoverable into instances later), but two cheap forward investments are made now: a `role` field on every signature, and an evaluator return shape that exposes per-pattern groupings (see below).

## Resolving the three open forks

### Fork 5 — Catalog location: **shipped default + per-repo override**

Two files, one source of truth:
- **Default catalog** ships in `src/scanners/extractors/stock-catalog.js` (sibling of `integration.js`). A curated, conservative list of the most common patterns. Reviewed in-tree, versioned with the tool, no new config surface for first-time users.
- **Override surface** is `varai.config.json` (the same file `varai start` already reads at `src/server/index.js:62`). Schema:
    ```json
    {
      "stock": {
        "additional":  [ /* append patterns to the default catalog */ ],
        "disabled":    [ "notifications", "health" ]
      }
    }
    ```
  The scanner merges defaults + repo overrides. Disabled patterns are skipped entirely; additional patterns are appended. The override schema is small, declared, and non-breaking — a default-only user sees zero new knobs. Signatures in `additional` use the same schema as the shipped catalog, including the `role` field (documented from day one, even though v1 doesn't consume it — retrofitting roles across grown user overrides later is the kind of migration that never happens).

**Config plumbing (previously unspecified):** `varai.config.json` is currently read only by the server (`src/server/index.js:62`); `scanRepo` has no config loading. To keep `varai scan` and the dashboard consistent, `scanRepo` gains an `options.config` parameter, and a shared loader (`loadRepoConfig(repoPath)`) is called by both the CLI entry and the server before invoking the scan. The worker-pool path needs no changes — tagging runs post-merge on the main thread (see below), so the catalog never crosses the worker boundary.

**Why not config-only:** the defaults are the value. Most users will not customize; shipping them in code is what makes the lens useful out of the box. **Why not shipped-only:** companies have internal "stock" patterns (their own SSO, their audit logging) that they want flagged. A small escape hatch keeps the door open.

### Fork 6 — v1 catalog contents: **seven patterns, conservative**

Ship these seven, each with curated signatures across the relevant fact kinds:

| Pattern | Signatures cover |
|---|---|
| `auth` | integrations (auth0, clerk, firebase); env vars (`JWT_*`, `SESSION_*`, `OAUTH_*`, `AUTH_*`); packages (passport, next-auth, jsonwebtoken, lucia, authlib, @auth0/*, @clerk/*, firebase, firebase-admin); api_routes matching `/auth|login|logout|session|oauth|register|signup`; db_models `User|Account|Session|Token|RefreshToken` with path hint |
| `payment` | integrations (stripe, paypal); env vars (`STRIPE_*`, `PAYPAL_*`); packages (stripe, @stripe/*, paypalrestsdk, @paypal/*); api_routes with `payment|checkout|billing|stripe|subscription|invoice` in path; db_models `Payment|Subscription|Invoice|Customer|Charge` with path hint |
| `file_storage` | integrations (s3, gcs, cloudinary); env vars (`S3_*`, `AWS_*`, `GCS_*`, `GOOGLE_CLOUD_*`, `CLOUDINARY_*`); packages (boto3, @aws-sdk/*, google-cloud-storage, @google-cloud/storage, cloudinary); api_routes with `upload|storage|s3|file|attachment` in path |
| `email` | integrations (sendgrid, mailgun); env vars (`SENDGRID_*`, `MAILGUN_*`, `SMTP_*`, `EMAIL_*`); packages (sendgrid, @sendgrid/mail, mailgun, nodemailer) |
| `notifications` | integrations (onesignal, pusher, fcm); env vars (`FCM_*`, `ONESIGNAL_*`, `PUSHER_*`); packages (firebase-admin messaging, @react-native-firebase/messaging, onesignal, pusher, pusher-js) |
| `settings` | schema facts whose base is `BaseSettings`/`Settings` AND path contains `settings|config`; package pydantic-settings |
| `health` | api_routes matching `^/(health|ping|status|ready|alive)(/|$)` (no path hint required — names are unambiguous) |

Derived `integration` facts (from `deriveIntegrations`) are the single most stock-indicative facts in the set — `integration: stripe → payment` is the cheapest, highest-confidence signature in the catalog. This requires the evaluator to run *after* the integration derive pass (see ordering note below).

Conservative means: **name-only matches are accepted only when the name is genuinely unambiguous** (`STRIPE_SECRET_KEY`, `firebase-admin`, `/health`). Ambiguous names like `User`, `Account`, `Config` require a path hint, otherwise the fact stays untagged (residual "Custom"). This is the Tier 1/Tier 2 split the user agreed to. Tier 3 (context-evidence) stays out of v1.

**Path hints match any evidence entry**, not just `evidence[0]` — a `User` model whose first evidence is a migration file must not miss the hint on its actual definition: `sig.path.test(...)` becomes `fact.evidence.some(e => sig.path.test(e.file))`. This only adds matches that genuinely exist, so the conservative direction is preserved.

**Every signature carries a `role` field** — inert in v1, curated now:

```js
{ kind: "env_var",   name: /^STRIPE_/,            role: "credential" }
{ kind: "api_route", name: /payment|checkout/,    role: "endpoint" }
{ kind: "db_model",  name: /Payment|Invoice/,      role: "entity" }
{ kind: "integration", name: /^stripe$/,           role: "provider" }
```

Roles (`provider`, `credential`, `endpoint`, `entity`, `config`) are what later turn flat tags into pattern instances ("auth: provider=clerk, credential=JWT_SECRET, …") and what gap detection consumes ("pattern `auth` found `credential` but no `entity`"). Curating them at catalog-authoring time costs nothing; retrofitting them later across a grown catalog plus user overrides is a migration that never happens.

### Fork 7 — Renderer changes

**Markdown reporter (`src/reporters/inventory.js`):** add a new `## Standard Patterns` section at the top, grouped by stock tag, with subheadings per pattern. The existing kind-based sections stay exactly as they are — `stock` is an *additional* grouping, not a replacement. Custom (no `stock`) facts still appear in their kind sections; they just don't appear in "Standard Patterns."

**UI dashboard (`src/ui/app.js`):** add a new sidebar nav group `Standard` *above* the existing `Infrastructure / Backend / Frontend / Config` groups. Clicking a stock tag (e.g. `auth`) filters to facts whose `stock` array contains that tag. Clicking the existing kind nav still works unchanged. The fact row can show a small `standard · auth` chip when the fact has a stock tag, so a reader scanning the kind-filtered list still sees the stock annotation.

The renderer does *not* show a "Custom" section by default. The kind-based view is already implicitly "everything that didn't fit into a stock group," so a separate custom section would be redundant.

## Implementation shape

```
src/scanners/extractors/stock-catalog.js   NEW    catalog + signature evaluator
src/scanners/config.js                      NEW    loadRepoConfig(repoPath) — shared
                                                     varai.config.json loader
src/scanners/index.js                       MOD    run evaluator AFTER deriveIntegrations
                                             (over the union, see ordering below);
                                             accept options.config
src/server/index.js                         MOD    pass loaded config into scanRepo
bin/varai.js                                MOD    CLI scan path loads config too
src/reporters/inventory.js                  MOD    appendStandardPatternsSection
src/ui/app.js                               MOD    KIND_META + NAV_GROUPS additions
src/ui/index.html, src/ui/styles.css       MOD    new sidebar group + chip styling
docs/spec.md                                MOD    one-line note that `stock` is a
                                                     first-class field on a fact
test/extractors/stock-catalog.test.js      NEW    unit tests for the evaluator
examples/golden/*/expected-findings.json   MOD    one example showing a stock-tagged
                                                     fact (e.g. todo-partial)
```

**No `EXTRACTOR_VERSION` bump.** Tagging is a post-cache derived pass: `extractFileAll` writes facts to the per-file cache *before* the derived passes run (`src/scanners/index.js:189`), so stock tags never enter cached entries. Bumping the version would invalidate the whole cache for a change that doesn't touch cached content. Corollary feature: editing the catalog or the repo override takes effect on the next scan with zero cache invalidation.

**Ordering:** dedupe → `deriveIntegrations` → `tagStock` over the union (`dedupedFacts` + `derivedFacts`) → final sort. Tagging before the derive pass would leave `integration` facts — the strongest stock signals — untagged.

**New fact shape** (additive — old consumers ignore the field):
```js
{ kind: "api_route", name: "POST /api/auth/login",
  evidence: [{ file: ".../routers/auth.py", line: 24 }],
  layer: "ast",
  stock: ["auth"] }   // array, may be empty/absent
```

**Evaluator** runs once over the merged fact set (post-`deriveIntegrations`). It returns per-pattern groupings, not just mutated facts — only the flat tags are persisted in v1, but the grouping return is the natural seam where pattern-instance facts will eventually be emitted, exactly the way `deriveIntegrations` emits `integration` facts today. Pseudocode:

```js
export function tagStock(facts, config) {
  const catalog = buildCatalog(config);          // merge default + repo override
  const instances = new Map();                   // pattern name → [{fact, role}]
  for (const fact of facts) {
    const tags = [];
    for (const pattern of catalog) {
      for (const sig of pattern.signatures) {
        if (matchesSignature(fact, sig)) {
          tags.push(pattern.name);
          getOrInit(instances, pattern.name).push({ fact, role: sig.role });
          break;
        }
      }
    }
    if (tags.length) fact.stock = tags;          // absent field ⇒ untagged ⇒ custom
  }
  return { facts, instances };                   // v1 consumers use only .facts;
}                                                // .instances feeds future instance/gap passes
```

`matchesSignature` is a small dispatcher: by `kind`, by `name` regex (Tier 1), or by `name` regex + path-hint regex tested against **any** evidence entry (`fact.evidence.some(e => sig.path.test(e.file))`) (Tier 2). No file-system access during evaluation — signatures see only the fact and the full fact set is already in memory.

**Gap detection** (the user's "later we can use the lens to say what's missing") is **explicitly out of scope** for this PR. The `role` field is the one piece of it pre-paid now: a future derived pass reads the `instances` groupings and says "pattern `auth` matched roles {credential, endpoint} but no {entity}" directly from curated catalog data, with no signature-schema migration.

## What this PR is *not*

- Not changing the `kind` axis. The 16 existing kinds stay.
- Not changing `layer`. ast/heuristic/semantic semantics are unchanged.
- Not changing the stack-detection or per-stack extractor machinery. Stock is a cross-cutting derived pass, not a new extractor.
- Not adding a "Custom" section. Custom is implicit in the kind-based views.
- Not implementing gap detection. Out of scope (the `role` field and `instances` return are the only down payments).
- Not making `stock` structured. It stays a flat string array on facts — the pattern-instance view is *derived* (from `instances` + roles), never stored. Resisting structure here keeps old consumers trivially compatible and keeps the instance representation free to evolve.
- Not touching the per-file fact cache. Tagging is post-cache; no `EXTRACTOR_VERSION` bump.
