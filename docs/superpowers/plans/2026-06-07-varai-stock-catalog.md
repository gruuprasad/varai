# Varai Stock Catalog — Implementation Plan
_2026-06-07_

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Read `docs/superpowers/specs/2026-06-07-varai-stock-catalog-design.md` first** — this plan assumes its decisions.

**Goal:** Add a third, orthogonal axis to the lens: every fact gets tagged with the stock pattern(s) it matches (`auth`, `payment`, `file_storage`, `email`, `notifications`, `settings`, `health`). Markdown reporter and UI dashboard gain a "Standard Patterns" view above the existing kind-based views. Custom (untagged) facts keep appearing in their kind views unchanged.

**Architecture:** A new derived pass `tagStock` runs over the merged fact set *after* `deriveIntegrations` (so derived `integration` facts are themselves taggable). Default catalog ships in `src/scanners/extractors/stock-catalog.js`; per-repo override via `varai.config.json` (`stock.additional` / `stock.disabled`). The shared `varai.config.json` loader moves to `src/scanners/config.js` and is called by both `map.js` and the server.

**Decoupling invariant:** Stock tagging is *post-cache*. Per-file extractors write to the cache before any derived pass runs (`src/scanners/index.js:189`). Stock tags never enter cached entries — there is **no `EXTRACTOR_VERSION` bump**.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/scanners/extractors/stock-catalog.js` | new | default v1 catalog (7 patterns) + `buildCatalog(config)` merger |
| `src/scanners/extractors/stock-tagger.js` | new | `tagStock(facts, config)` evaluator; returns `{ facts, instances }` |
| `src/scanners/config.js` | new | `loadRepoConfig(repoPath)` — shared `varai.config.json` loader |
| `src/scanners/index.js` | modify | call `tagStock` after `deriveIntegrations`; pass `options.config` to `loadRepoConfig` (default: empty) |
| `src/map.js` | modify | use `loadRepoConfig`; pass loaded config into `scanRepo` |
| `src/server/index.js` | modify | use `loadRepoConfig`; pass loaded config into `scanRepo` |
| `src/reporters/inventory.js` | modify | add `appendStandardPatternsSection`; keep all existing sections |
| `src/ui/app.js` | modify | add `STOCK_META`, `STOCK_GROUP` to nav; render chips on fact rows; filter on stock tag |
| `src/ui/index.html` | modify | (probably no change — the sidebar nav is fully JS-rendered) |
| `src/ui/styles.css` | modify | `.stock-chip`, `.nav-stock-group` styles |
| `docs/spec.md` | modify | one-line note in "Fact types" table that `stock` is a first-class field |
| `test/extractors/stock-catalog.test.js` | new | catalog shape, signature matching, role preservation, override merge |
| `test/extractors/stock-tagger.test.js` | new | end-to-end tagging across all 7 patterns; multi-tag; untagged stays untagged; `instances` shape |
| `test/scanner-config.test.js` | new | shared loader: missing file → `{}`; partial config; stock block parsing |
| `test/inventory.test.js` | modify | add cases for `## Standard Patterns` section |

**No `EXTRACTOR_VERSION` bump.** No new `fact` shape fields that are not `stock`.

---

## Fact shape (recap, no schema change)

```js
// Before (still valid)
{ kind, name, evidence: [{ file, line? }], layer }

// After (additive — old consumers ignore `stock`)
{ kind, name, evidence: [{ file, line? }], layer, stock: ["auth"] }   // array, may be absent
```

`stock` is a `string[]` of pattern names. Absent or empty array ⇒ "Custom to this app." Multiple tags allowed.

---

## Task 0: Read the existing code to ground the plan

**No code changes.** Re-read the four files that define what the new code must plug into. Skim, do not modify.

- [ ] **Step 1: Read `src/scanners/index.js:155-175`** — confirm the `deriveIntegrations` call site, the `dedupeFacts`/`sortFacts` ordering, and the return shape (`{ summary, stacks, files, facts }`). Tagging must slot in between `deriveIntegrations` and the final sort.
- [ ] **Step 2: Read `src/scanners/extractors/integration.js:81-126`** — confirm the derived-pass contract: input facts, output new facts (or in our case, mutate + return `{ facts, instances }`).
- [ ] **Step 3: Read `src/scanners/cache.js`** — confirm `EXTRACTOR_VERSION` is currently `2` and is keyed on extractor logic only. Do **not** bump.
- [ ] **Step 4: Read `src/reporters/inventory.js`** — confirm the section-rendering helpers (`appendItemSection`, `appendListSection`) and the `groupByKind` shape. The new `## Standard Patterns` section uses a new helper, not one of these.
- [ ] **Step 5: Read `src/ui/app.js:1-30`** — confirm `KIND_META` and `NAV_GROUPS` shapes. The new stock nav group mirrors this style.

No commit. Once you can recite the `scanRepo` return shape from memory, move to Task 1.

---

## Task 1: Stock catalog module — default v1 patterns

The catalog is a flat array of pattern objects. Each pattern has a `name`, an optional `label` (defaults to title-cased `name`), and a `signatures` array. Each signature has a `kind`, a `nameRegex` (always), an optional `pathRegex` (Tier 2), and a `role`.

**Files:**
- Create: `src/scanners/extractors/stock-catalog.js`
- Create: `test/extractors/stock-catalog.test.js`

- [ ] **Step 1: Write the failing test for the catalog shape**

```js
// test/extractors/stock-catalog.test.js
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CATALOG, getPattern } from "../../src/scanners/extractors/stock-catalog.js";

test("default catalog contains exactly the seven v1 patterns", () => {
  assert.deepEqual(
    DEFAULT_CATALOG.map((p) => p.name).sort(),
    ["auth", "email", "file_storage", "health", "notifications", "payment", "settings"].sort()
  );
});

test("every pattern has a non-empty signatures array", () => {
  for (const p of DEFAULT_CATALOG) {
    assert.ok(p.signatures.length > 0, `pattern ${p.name} has no signatures`);
  }
});

test("every signature has kind, nameRegex, and role", () => {
  for (const p of DEFAULT_CATALOG) {
    for (const sig of p.signatures) {
      assert.equal(typeof sig.kind, "string", `${p.name}: sig.kind must be string`);
      assert.ok(sig.nameRegex instanceof RegExp, `${p.name}: sig.nameRegex must be RegExp`);
      assert.equal(typeof sig.role, "string", `${p.name}: sig.role must be string`);
      if (sig.pathRegex !== undefined) {
        assert.ok(sig.pathRegex instanceof RegExp, `${p.name}: sig.pathRegex must be RegExp`);
      }
    }
  }
});

test("getPattern returns a pattern by name", () => {
  const p = getPattern("auth");
  assert.equal(p.name, "auth");
  assert.ok(p.signatures.length > 0);
});

test("getPattern returns undefined for unknown name", () => {
  assert.equal(getPattern("does_not_exist"), undefined);
});

test("all roles come from a small closed vocabulary", () => {
  const ALLOWED = new Set(["provider", "credential", "endpoint", "entity", "config", "library"]);
  for (const p of DEFAULT_CATALOG) {
    for (const sig of p.signatures) {
      assert.ok(ALLOWED.has(sig.role), `${p.name}: unknown role "${sig.role}"`);
    }
  }
});
```

- [ ] **Step 2: Run, see it fail**

```bash
node --test test/extractors/stock-catalog.test.js
```

Expected: `ERR_MODULE_NOT_FOUND` for `stock-catalog.js`.

- [ ] **Step 3: Create the catalog module with the seven v1 patterns**

```js
// src/scanners/extractors/stock-catalog.js

// Default v1 stock catalog. Curated, conservative, high-precision.
// Tier 1 (self-evidence): name is unambiguous, no path needed.
// Tier 2 (path-evidence): ambiguous name (User, Account, Config) requires pathRegex to also match.
// `role` is inert in v1 — feeds future pattern-instance and gap-detection passes.

const RE = (s, flags = "i") => new RegExp(s, flags);

const PACKAGES = (...names) => RE(`^(?:${names.join("|")})$`);

export const DEFAULT_CATALOG = [
  {
    name: "auth",
    signatures: [
      // providers: SDK packages declare auth
      { kind: "package", nameRegex: PACKAGES("passport", "next-auth", "@auth0\\/[^/]+", "lucia", "authlib",
                                            "firebase", "firebase-admin", "@clerk\\/[^/]+",
                                            "@supabase\\/supabase-js", "jsonwebtoken", "jose"),
        role: "library" },
      { kind: "integration", nameRegex: /^(?:clerk|auth0|firebase|supabase)$/i, role: "provider" },
      // credentials: env-var names
      { kind: "env_var", nameRegex: /^(?:JWT_|SESSION_|OAUTH_|AUTH_)/i, role: "credential" },
      // endpoints: route paths
      { kind: "api_route", nameRegex: /(?:\/|\b)(?:auth|login|logout|session|oauth|register|signup|signin|sso|token|refresh|me)(?:\/|\b)/i,
        role: "endpoint" },
      // entities: db models with path hint
      { kind: "db_model", nameRegex: /^(?:User|Account|Session|Token|RefreshToken|Identity|Credential)$/,
        pathRegex: /(?:auth|user|account|session|login|identity)/i, role: "entity" },
    ],
  },
  {
    name: "payment",
    signatures: [
      { kind: "package", nameRegex: PACKAGES("stripe", "@stripe\\/[^/]+", "paypalrestsdk", "@paypal\\/[^/]+",
                                            "braintree", "@braintree\\/[^/]+", "square", "lemonsqueezy"),
        role: "library" },
      { kind: "integration", nameRegex: /^(?:stripe|paypal|braintree|square)$/i, role: "provider" },
      { kind: "env_var", nameRegex: /^(?:STRIPE_|PAYPAL_|BRAINTREE_|SQUARE_)/i, role: "credential" },
      { kind: "api_route", nameRegex: /(?:\/|\b)(?:payment|checkout|billing|stripe|subscription|invoice|charge|customer)(?:\/|\b)/i,
        role: "endpoint" },
      { kind: "db_model", nameRegex: /^(?:Payment|Subscription|Invoice|Charge|Plan|Order|Customer)$/,
        pathRegex: /(?:payment|billing|checkout|subscription|order)/i, role: "entity" },
    ],
  },
  {
    name: "file_storage",
    signatures: [
      { kind: "package", nameRegex: PACKAGES("boto3", "@aws-sdk\\/[^/]+", "aws-sdk", "google-cloud-storage",
                                            "@google-cloud\\/storage", "cloudinary", "azure-storage-blob",
                                            "@azure\\/storage-blob", "@supabase\\/storage-js"),
        role: "library" },
      { kind: "integration", nameRegex: /^(?:s3|gcs|cloudinary|azure_blob)$/i, role: "provider" },
      { kind: "env_var", nameRegex: /^(?:S3_|AWS_|GCS_|GOOGLE_CLOUD_|GCLOUD_|CLOUDINARY_|AZURE_)/i,
        role: "credential" },
      { kind: "api_route", nameRegex: /(?:\/|\b)(?:upload|storage|s3|file|attachment|media|asset)(?:\/|\b)/i,
        role: "endpoint" },
    ],
  },
  {
    name: "email",
    signatures: [
      { kind: "package", nameRegex: PACKAGES("sendgrid", "@sendgrid\\/mail", "mailgun", "nodemailer",
                                            "mjml", "postmark", "@postmark\\/postmark-client",
                                            "aws-sdk", "@aws-sdk\\/client-ses", "resend", "react-email"),
        role: "library" },
      { kind: "integration", nameRegex: /^(?:sendgrid|mailgun|smtp|postmark|ses|resend)$/i, role: "provider" },
      { kind: "env_var", nameRegex: /^(?:SENDGRID_|MAILGUN_|SMTP_|EMAIL_|POSTMARK_|RESEND_)/i,
        role: "credential" },
      { kind: "api_route", nameRegex: /(?:\/|\b)(?:email|mail|send-mail|sendgrid|mailgun)(?:\/|\b)/i,
        role: "endpoint" },
    ],
  },
  {
    name: "notifications",
    signatures: [
      { kind: "package", nameRegex: PACKAGES("onesignal", "@onesignal\\/[^/]+", "pusher", "pusher-js",
                                            "@react-native-firebase\\/messaging",
                                            "firebase-admin", "web-push", "apn", "@parse\\/node-apn"),
        role: "library" },
      { kind: "integration", nameRegex: /^(?:onesignal|pusher|fcm|apn|web_push)$/i, role: "provider" },
      { kind: "env_var", nameRegex: /^(?:FCM_|ONESIGNAL_|PUSHER_|APN_|VAPID_)/i, role: "credential" },
      { kind: "api_route", nameRegex: /(?:\/|\b)(?:notify|notification|push|alert)(?:\/|\b)/i,
        role: "endpoint" },
    ],
  },
  {
    name: "settings",
    signatures: [
      { kind: "schema", nameRegex: /^(?:Settings|Config|AppConfig|BaseSettings)$/,
        pathRegex: /(?:settings|config)/i, role: "config" },
      { kind: "package", nameRegex: PACKAGES("pydantic-settings", "dotenv", "python-dotenv",
                                            "@nestjs\\/config", "config"),
        role: "library" },
    ],
  },
  {
    name: "health",
    signatures: [
      // Tier 1 only — names are unambiguous, no path needed.
      { kind: "api_route", nameRegex: /^(?:GET|POST|PUT|PATCH|DELETE)\s+\/(?:health|ping|status|ready|alive|healthz|readyz|livez)(?:\/|$)/i,
        role: "endpoint" },
    ],
  },
];

export function getPattern(name) {
  return DEFAULT_CATALOG.find((p) => p.name === name);
}
```

- [ ] **Step 4: Run tests**

```bash
node --test test/extractors/stock-catalog.test.js
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scanners/extractors/stock-catalog.js test/extractors/stock-catalog.test.js
git commit -m "feat: stock catalog v1 — 7 patterns with curated signatures and roles"
```

---

## Task 2: Catalog merger — defaults + per-repo override

`buildCatalog(config)` returns the effective catalog: defaults minus `disabled`, plus any `additional` patterns from the override block. No signature-schema migration in v1.

**Files:**
- Modify: `src/scanners/extractors/stock-catalog.js`
- Modify: `test/extractors/stock-catalog.test.js`

- [ ] **Step 1: Add failing tests for the merger**

Append to `test/extractors/stock-catalog.test.js`:

```js
import { buildCatalog } from "../../src/scanners/extractors/stock-catalog.js";

test("buildCatalog returns defaults when no override is supplied", () => {
  const out = buildCatalog(undefined);
  assert.equal(out.length, DEFAULT_CATALOG.length);
});

test("buildCatalog honors disabled list", () => {
  const out = buildCatalog({ stock: { disabled: ["health", "notifications"] } });
  const names = out.map((p) => p.name);
  assert.ok(!names.includes("health"));
  assert.ok(!names.includes("notifications"));
  assert.ok(names.includes("auth"));
});

test("buildCatalog appends additional patterns after defaults", () => {
  const out = buildCatalog({
    stock: {
      additional: [
        { name: "audit_log", signatures: [{ kind: "api_route", nameRegex: /\/audit\b/i, role: "endpoint" }] },
      ],
    },
  });
  const names = out.map((p) => p.name);
  assert.ok(names.includes("audit_log"));
  assert.ok(names.indexOf("audit_log") > names.indexOf("auth"));
});

test("buildCatalog validates additional pattern shape", () => {
  assert.throws(
    () => buildCatalog({ stock: { additional: [{ name: "bad" }] } }),
    /signatures array is required/
  );
  assert.throws(
    () => buildCatalog({ stock: { additional: [{ name: "bad", signatures: [{ kind: "api_route" }] }] } }),
    /nameRegex.*RegExp/
  );
});
```

- [ ] **Step 2: Run, see the new tests fail**

```bash
node --test test/extractors/stock-catalog.test.js
```

Expected: 4 failures, all complaining `buildCatalog is not a function` or import errors.

- [ ] **Step 3: Implement `buildCatalog`**

Add to `src/scanners/extractors/stock-catalog.js`:

```js
function validateAdditionalPattern(p) {
  if (!p || typeof p.name !== "string") throw new Error("additional pattern: name (string) is required");
  if (!Array.isArray(p.signatures) || p.signatures.length === 0)
    throw new Error(`additional pattern "${p.name}": signatures array is required and must be non-empty`);
  for (const sig of p.signatures) {
    if (typeof sig.kind !== "string")
      throw new Error(`additional pattern "${p.name}": sig.kind (string) is required`);
    if (!(sig.nameRegex instanceof RegExp))
      throw new Error(`additional pattern "${p.name}": sig.nameRegex (RegExp) is required`);
    if (typeof sig.role !== "string")
      throw new Error(`additional pattern "${p.name}": sig.role (string) is required`);
    if (sig.pathRegex !== undefined && !(sig.pathRegex instanceof RegExp))
      throw new Error(`additional pattern "${p.name}": sig.pathRegex must be RegExp if present`);
  }
}

export function buildCatalog(config) {
  const stock = config?.stock ?? {};
  const disabled = new Set(stock.disabled ?? []);
  const out = DEFAULT_CATALOG.filter((p) => !disabled.has(p.name));
  for (const p of stock.additional ?? []) {
    validateAdditionalPattern(p);
    out.push(p);
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

```bash
node --test test/extractors/stock-catalog.test.js
```

Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scanners/extractors/stock-catalog.js test/extractors/stock-catalog.test.js
git commit -m "feat: stock catalog merger — disabled + additional patterns from varai.config.json"
```

---

## Task 3: Signature matcher + `tagStock` evaluator

The matcher decides if a single fact matches a single signature. `tagStock` walks all facts, calls the matcher for every (fact, signature) pair, and writes back the `stock` array plus the `instances` map.

**Files:**
- Create: `src/scanners/extractors/stock-tagger.js`
- Create: `test/extractors/stock-tagger.test.js`

- [ ] **Step 1: Write the failing tests for the matcher and the evaluator**

```js
// test/extractors/stock-tagger.test.js
import assert from "node:assert/strict";
import test from "node:test";
import { tagStock, _internal as I } from "../../src/scanners/extractors/stock-tagger.js";

const fact = (overrides) => ({
  kind: "api_route",
  name: "POST /api/auth/login",
  evidence: [{ file: "services/backend/app/routers/auth.py", line: 24 }],
  layer: "ast",
  ...overrides,
});

// ── matcher: Tier 1 (self-evidence) ────────────────────────────────────────

test("matcher Tier 1: name alone matches when pathRegex is absent", () => {
  const sig = { kind: "env_var", nameRegex: /^STRIPE_/, role: "credential" };
  const f = fact({ kind: "env_var", name: "STRIPE_SECRET_KEY" });
  assert.equal(I.matchesSignature(f, sig), true);
});

test("matcher Tier 1: kind must match", () => {
  const sig = { kind: "env_var", nameRegex: /^STRIPE_/, role: "credential" };
  const f = fact({ kind: "api_route", name: "STRIPE_SECRET_KEY" });
  assert.equal(I.matchesSignature(f, sig), false);
});

// ── matcher: Tier 2 (path-evidence) ────────────────────────────────────────

test("matcher Tier 2: ambiguous name requires path to match", () => {
  const sig = { kind: "db_model", nameRegex: /^User$/, pathRegex: /auth|user/i, role: "entity" };
  const f = fact({ kind: "db_model", name: "User",
                   evidence: [{ file: "models/auth/user.py" }] });
  assert.equal(I.matchesSignature(f, sig), true);
});

test("matcher Tier 2: same name in unrelated file does NOT match", () => {
  const sig = { kind: "db_model", nameRegex: /^User$/, pathRegex: /auth|user/i, role: "entity" };
  const f = fact({ kind: "db_model", name: "User",
                   evidence: [{ file: "models/billing/payment.py" }] });
  assert.equal(I.matchesSignature(f, sig), false);
});

test("matcher Tier 2: path test scans ALL evidence entries, not just [0]", () => {
  const sig = { kind: "db_model", nameRegex: /^User$/, pathRegex: /auth/i, role: "entity" };
  // First evidence is a migration, second is the actual definition
  const f = fact({ kind: "db_model", name: "User",
                   evidence: [{ file: "alembic/versions/0001.py" },
                              { file: "models/auth/user.py" }] });
  assert.equal(I.matchesSignature(f, sig), true);
});

// ── tagStock: end-to-end ────────────────────────────────────────────────────

test("tagStock: tags a STRIPE_ env_var as payment (Tier 1)", () => {
  const out = tagStock([
    fact({ kind: "env_var", name: "STRIPE_SECRET_KEY",
           evidence: [{ file: ".env" }] }),
  ], {});
  assert.deepEqual(out.facts[0].stock, ["payment"]);
});

test("tagStock: tags a User model in auth/ as auth, leaves one in billing/ untagged", () => {
  const out = tagStock([
    fact({ kind: "db_model", name: "User",
           evidence: [{ file: "models/auth/user.py" }] }),
    fact({ kind: "db_model", name: "User",
           evidence: [{ file: "models/billing/payment.py" }] }),
  ], {});
  assert.deepEqual(out.facts[0].stock, ["auth"]);
  assert.equal(out.facts[1].stock, undefined);   // untagged ⇒ absent
});

test("tagStock: derived integration facts (e.g. stripe) match as provider role", () => {
  const out = tagStock([
    fact({ kind: "integration", name: "stripe",
           evidence: [{ file: "package.json" }] }),
  ], {});
  assert.deepEqual(out.facts[0].stock, ["payment"]);
});

test("tagStock: multi-tag — fact can be tagged by multiple patterns", () => {
  // A package that is in both the auth and payment catalogs (unusual but possible)
  const out = tagStock([
    fact({ kind: "package", name: "@auth0/auth0-react",
           evidence: [{ file: "package.json" }] }),
  ], {});
  assert.ok(out.facts[0].stock.includes("auth"));
});

test("tagStock: instances map groups (fact, role) per pattern", () => {
  const out = tagStock([
    fact({ kind: "env_var", name: "STRIPE_SECRET_KEY", evidence: [{ file: ".env" }] }),
    fact({ kind: "api_route", name: "POST /api/payment/charge",
           evidence: [{ file: "routes/payment.py" }] }),
    fact({ kind: "db_model", name: "Payment",
           evidence: [{ file: "models/payment.py" }] }),
  ], {});

  const payment = out.instances.get("payment");
  assert.ok(payment);
  assert.deepEqual(payment.map((m) => m.role).sort(), ["credential", "endpoint", "entity"].sort());
});

test("tagStock: respects `disabled` in config", () => {
  const out = tagStock([
    fact({ kind: "env_var", name: "STRIPE_SECRET_KEY", evidence: [{ file: ".env" }] }),
  ], { stock: { disabled: ["payment"] } });
  assert.equal(out.facts[0].stock, undefined);
});

test("tagStock: respects `additional` patterns in config", () => {
  const out = tagStock([
    fact({ kind: "api_route", name: "GET /api/audit/recent",
           evidence: [{ file: "routes/audit.py" }] }),
  ], {
    stock: {
      additional: [
        { name: "audit_log", signatures: [{ kind: "api_route", nameRegex: /\/audit\b/i, role: "endpoint" }] },
      ],
    },
  });
  assert.deepEqual(out.facts[0].stock, ["audit_log"]);
});

test("tagStock: returns same input array length, mutates in place", () => {
  const facts = [
    fact({ kind: "env_var", name: "DATABASE_URL" }),
    fact({ kind: "api_route", name: "GET /api/users" }),
  ];
  const out = tagStock(facts, {});
  assert.equal(out.facts.length, 2);
  assert.equal(out.facts, facts);   // same array reference
});

test("tagStock: does not produce a stock field on facts that match nothing", () => {
  const out = tagStock([
    fact({ kind: "env_var", name: "DATABASE_URL" }),
  ], {});
  assert.equal(out.facts[0].stock, undefined);
});
```

- [ ] **Step 2: Run, see the suite fail**

```bash
node --test test/extractors/stock-tagger.test.js
```

Expected: `ERR_MODULE_NOT_FOUND` for `stock-tagger.js`.

- [ ] **Step 3: Create the tagger**

```js
// src/scanners/extractors/stock-tagger.js
import { buildCatalog } from "./stock-catalog.js";

// Internal helpers are exported under `_internal` only for testing.
// Production consumers import `tagStock`.
export const _internal = { matchesSignature, matchesAnyPath };

function matchesAnyPath(fact, pathRegex) {
  if (!pathRegex) return true;             // Tier 1: no path required
  for (const ev of fact.evidence ?? []) {
    if (pathRegex.test(ev.file)) return true;
  }
  return false;
}

function matchesSignature(fact, sig) {
  if (fact.kind !== sig.kind) return false;
  if (!sig.nameRegex.test(fact.name)) return false;
  return matchesAnyPath(fact, sig.pathRegex);
}

export function tagStock(facts, config) {
  const catalog = buildCatalog(config);
  const instances = new Map();

  for (const fact of facts) {
    const tags = [];
    for (const pattern of catalog) {
      for (const sig of pattern.signatures) {
        if (matchesSignature(fact, sig)) {
          tags.push(pattern.name);
          let bucket = instances.get(pattern.name);
          if (!bucket) { bucket = []; instances.set(pattern.name, bucket); }
          bucket.push({ fact, role: sig.role });
          break;                             // a fact matches a pattern at most once
        }
      }
    }
    if (tags.length) fact.stock = tags;     // absent ⇒ untagged ⇒ custom
  }

  return { facts, instances };
}
```

- [ ] **Step 4: Run tests**

```bash
node --test test/extractors/stock-tagger.test.js
```

Expected: 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scanners/extractors/stock-tagger.js test/extractors/stock-tagger.test.js
git commit -m "feat: stock tagger — evaluator with role-grouped instances return"
```

---

## Task 4: Shared `varai.config.json` loader

Move the duplicated config-reading logic out of `map.js` and `server/index.js` into `src/scanners/config.js`. Both call sites use it.

**Files:**
- Create: `src/scanners/config.js`
- Create: `test/scanner-config.test.js`
- Modify: `src/map.js`
- Modify: `src/server/index.js`

- [ ] **Step 1: Write the failing tests for the loader**

```js
// test/scanner-config.test.js
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { loadRepoConfig } from "../src/scanners/config.js";

test("missing varai.config.json returns empty object", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  const cfg = await loadRepoConfig(dir);
  assert.deepEqual(cfg, {});
});

test("malformed varai.config.json returns empty object (does not throw)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), "{ this is not json");
  const cfg = await loadRepoConfig(dir);
  assert.deepEqual(cfg, {});
});

test("loads include, stock.additional, stock.disabled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({
    include: ["src"],
    stock: {
      additional: [{ name: "audit", signatures: [{ kind: "api_route", nameRegex: /audit/i, role: "endpoint" }] }],
      disabled: ["health"],
    },
  }));
  const cfg = await loadRepoConfig(dir);
  assert.deepEqual(cfg.include, ["src"]);
  assert.equal(cfg.stock.disabled[0], "health");
  assert.equal(cfg.stock.additional[0].name, "audit");
});

test("partial config: missing stock block is allowed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({ include: ["x"] }));
  const cfg = await loadRepoConfig(dir);
  assert.deepEqual(cfg.include, ["x"]);
  assert.equal(cfg.stock, undefined);
});
```

- [ ] **Step 2: Run, see it fail**

```bash
node --test test/scanner-config.test.js
```

Expected: `ERR_MODULE_NOT_FOUND` for `config.js`.

- [ ] **Step 3: Create the loader**

```js
// src/scanners/config.js
import path from "node:path";
import { readFile } from "node:fs/promises";

export async function loadRepoConfig(repoPath) {
  try {
    const raw = await readFile(path.join(repoPath, "varai.config.json"), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
```

- [ ] **Step 4: Run tests**

```bash
node --test test/scanner-config.test.js
```

Expected: 4 tests pass.

- [ ] **Step 5: Update `src/map.js` to use the shared loader**

```js
// src/map.js  — replace file contents
import path from "node:path";
import { scanRepo } from "./scanners/index.js";
import { renderInventory } from "./reporters/inventory.js";
import { loadRepoConfig } from "./scanners/config.js";

export async function runMap(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const config = await loadRepoConfig(repoPath);
  const include = options.include?.length ? options.include : (config.include ?? []);
  const scanOptions = { include, config };
  if (options.cache !== undefined) scanOptions.cache = options.cache;
  if (options.cacheDir !== undefined) scanOptions.cacheDir = options.cacheDir;
  if (options.jobs !== undefined) scanOptions.jobs = options.jobs;
  if (options.parser !== undefined) scanOptions.parser = options.parser;
  const scan = await scanRepo(repoPath, scanOptions);
  const report = renderInventory({ repoPath, scan });
  process.stdout.write(report);
  return { repoPath, scan };
}
```

- [ ] **Step 6: Update `src/server/index.js` to use the shared loader**

Replace the inline config read at `src/server/index.js:59-67`:

```js
// src/server/index.js — replace lines 57-67
import { loadRepoConfig } from "../scanners/config.js";

export async function startServer({ repoPath, port = 3847, open = true }) {
  const absRepo = path.resolve(repoPath);
  const config = await loadRepoConfig(absRepo);
  const scanOptions = { include: config.include ?? [], config };
  // …rest unchanged…
```

Keep the rest of `startServer` (the file-watcher, SSE broadcaster, etc.) byte-identical.

- [ ] **Step 7: Run the existing tests; nothing should regress**

```bash
npm test
```

Expected: all existing tests still pass. (The two existing `varai.config.json include` tests in `test/map.test.js` continue to work because the loader returns the same shape they assert on.)

- [ ] **Step 8: Commit**

```bash
git add src/scanners/config.js src/map.js src/server/index.js test/scanner-config.test.js
git commit -m "refactor: shared varai.config.json loader; CLI and server both use it"
```

---

## Task 5: Wire `tagStock` into the scanner pipeline

`tagStock` runs after `deriveIntegrations` so derived `integration` facts are themselves taggable. Mutates facts in place (assigns `fact.stock`) — the contract matches the integration pass.

**Files:**
- Modify: `src/scanners/index.js`

- [ ] **Step 1: Add the import and the call**

In `src/scanners/index.js`, add the import near the existing `deriveIntegrations` import (line 14):

```js
import { tagStock } from "./extractors/stock-tagger.js";
```

Then, immediately after the `deriveIntegrations` call (line 160), insert the tagging step and the final sort:

```js
  const derivedFacts = deriveIntegrations(dedupedFacts);
  const merged = [...dedupedFacts, ...derivedFacts];
  // tagStock mutates facts in place to add `stock`; it also returns an
  // `instances` map (per-pattern role-grouped matches) that v1 consumers
  // ignore but the future pattern-instance / gap-detection passes consume.
  tagStock(merged, options.config ?? {});
  const finalFacts = sortFacts(merged);
```

The previous final sort line (`const finalFacts = sortFacts([...dedupedFacts, ...derivedFacts]);`) is replaced. Everything else in `scanRepo` stays byte-identical.

- [ ] **Step 2: Add a fact in the `summary.sectionCounts` calculation? No.**

Stock is not a `kind`. The existing `countByKind`/`sectionCounts` shape stays as-is. (The UI and reporter will compute stock-specific counts themselves from `fact.stock`.)

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: all tests pass. Stock tags now flow through `scanRepo`'s return value on every fact that matches a v1 signature.

- [ ] **Step 4: Manual smoke test against the kalakar repo**

```bash
node bin/varai.js map /home/gp/dreamLand/jodulabs/kalakar --no-cache
```

Expected: report renders normally; the markdown has the existing sections. (The `## Standard Patterns` section lands in Task 6.)

- [ ] **Step 5: Add a focused integration test**

Append to `test/scanner-new.test.js` (or create a new test file `test/stock-integration.test.js`):

```js
// test/stock-integration.test.js
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { scanRepo } from "../src/scanners/index.js";

test("scanRepo tags facts and includes `stock` in output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-stock-int-"));
  await writeFile(join(dir, "requirements.txt"), "fastapi\nstripe\npydantic\n");
  await writeFile(join(dir, ".env.example"), "STRIPE_SECRET_KEY=\nJWT_SECRET=\nDATABASE_URL=\n");
  await mkdir(join(dir, "app"), { recursive: true });
  await writeFile(join(dir, "app/main.py"),
    "from fastapi import FastAPI, APIRouter\n" +
    "router = APIRouter()\n" +
    "@router.post('/api/auth/login')\nasync def login(): pass\n");
  await mkdir(join(dir, "app/models"), { recursive: true });
  await writeFile(join(dir, "app/models/user.py"),
    "from sqlalchemy import Base\nclass User(Base): pass\n");

  const { facts } = await scanRepo(dir, { cache: false });
  const stripe = facts.find((f) => f.kind === "package" && f.name === "stripe");
  const jwt = facts.find((f) => f.kind === "env_var" && f.name === "JWT_SECRET");
  const stripeEnv = facts.find((f) => f.kind === "env_var" && f.name === "STRIPE_SECRET_KEY");
  const user = facts.find((f) => f.kind === "db_model" && f.name === "User");
  const login = facts.find((f) => f.kind === "api_route" && /login/.test(f.name));

  assert.ok(stripe?.stock?.includes("payment"),     "stripe package tagged payment");
  assert.ok(jwt?.stock?.includes("auth"),           "JWT env tagged auth");
  assert.ok(stripeEnv?.stock?.includes("payment"),  "STRIPE_ env tagged payment");
  assert.ok(user?.stock?.includes("auth"),          "User model in app/models/user.py tagged auth");
  assert.ok(login?.stock?.includes("auth"),         "auth login route tagged auth");
});

test("scanRepo honors stock.disabled in varai.config.json", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-stock-int-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({
    stock: { disabled: ["auth"] },
  }));
  await writeFile(join(dir, ".env.example"), "JWT_SECRET=\n");

  const { facts } = await scanRepo(dir, { cache: false });
  const jwt = facts.find((f) => f.kind === "env_var" && f.name === "JWT_SECRET");
  assert.equal(jwt?.stock, undefined, "auth disabled ⇒ no auth tag on JWT_SECRET");
});
```

- [ ] **Step 6: Run the new integration test**

```bash
node --test test/stock-integration.test.js
```

Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/scanners/index.js test/stock-integration.test.js
git commit -m "feat: wire tagStock into scanner pipeline (post-deriveIntegrations)"
```

---

## Task 6: Markdown reporter — `## Standard Patterns` section

Add a new section at the top of the markdown report. Each pattern is a subheading listing the facts tagged with that pattern, with file:line references. Existing kind-based sections stay byte-identical below.

**Files:**
- Modify: `src/reporters/inventory.js`
- Modify: `test/inventory.test.js`

- [ ] **Step 1: Add failing tests for the new section**

Append to `test/inventory.test.js`:

```js
import { tagStock } from "../src/scanners/extractors/stock-tagger.js";

// …at the bottom of the file…

const STOCKED_FACTS = tagStock([
  { kind: "api_route",      name: "POST /api/auth/login",   evidence: [{ file: "routes/auth.py",     line: 24 }], layer: "ast" },
  { kind: "api_route",      name: "GET /api/projects",      evidence: [{ file: "routes/projects.py", line: 8  }], layer: "ast" },
  { kind: "env_var",        name: "JWT_SECRET",             evidence: [{ file: ".env"                       }], layer: "heuristic" },
  { kind: "package",        name: "fastapi",                evidence: [{ file: "pyproject.toml"              }], layer: "heuristic" },
  { kind: "package",        name: "stripe",                 evidence: [{ file: "pyproject.toml"              }], layer: "heuristic" },
  { kind: "env_var",        name: "STRIPE_SECRET_KEY",      evidence: [{ file: ".env"                       }], layer: "heuristic" },
  { kind: "db_model",       name: "User",                   evidence: [{ file: "models/auth/user.py", line: 12 }], layer: "ast" },
  { kind: "db_model",       name: "Project",                evidence: [{ file: "models/project.py",  line: 6  }], layer: "ast" },
  { kind: "integration",    name: "Stripe",                 evidence: [{ file: "package.json"                 }], layer: "ast" },
], {}).facts;

test("Standard Patterns section appears when any facts are tagged", () => {
  const out = renderInventory({ repoPath: "/x/kalakar", scan: { facts: STOCKED_FACTS } });
  assert.ok(out.includes("## Standard Patterns"));
});

test("Standard Patterns section lists a subheading per matched pattern", () => {
  const out = renderInventory({ repoPath: "/x", scan: { facts: STOCKED_FACTS } });
  assert.ok(out.includes("### Auth"));
  assert.ok(out.includes("### Payment"));
});

test("Standard Patterns section shows file:line for each fact", () => {
  const out = renderInventory({ repoPath: "/x", scan: { facts: STOCKED_FACTS } });
  assert.ok(out.includes("routes/auth.py:24"));
});

test("Standard Patterns section is omitted when no facts are tagged", () => {
  const out = renderInventory({ repoPath: "/x", scan: {
    facts: [{ kind: "env_var", name: "DATABASE_URL", evidence: [{ file: ".env" }], layer: "heuristic" }],
  }});
  assert.ok(!out.includes("## Standard Patterns"));
});

test("existing kind sections are unchanged in the presence of stock tags", () => {
  const out = renderInventory({ repoPath: "/x/kalakar", scan: { facts: STOCKED_FACTS } });
  assert.ok(out.includes("## API Routes"));
  assert.ok(out.includes("## Data Models"));
  assert.ok(out.includes("## Packages"));
});
```

- [ ] **Step 2: Run, see the new tests fail**

```bash
node --test test/inventory.test.js
```

Expected: at least 4 new failures.

- [ ] **Step 3: Add the section helper and call it in `renderInventory`**

In `src/reporters/inventory.js`:

```js
const STOCK_LABELS = {
  auth: "Auth",
  payment: "Payment",
  file_storage: "File Storage",
  email: "Email",
  notifications: "Notifications",
  settings: "Settings",
  health: "Health",
};

function appendStandardPatternsSection(lines, facts) {
  const grouped = new Map();
  for (const f of facts) {
    for (const tag of f.stock ?? []) {
      if (!grouped.has(tag)) grouped.set(tag, []);
      grouped.get(tag).push(f);
    }
  }
  if (grouped.size === 0) return;

  lines.push(`## Standard Patterns (${grouped.size})`, "");
  const tagOrder = Object.keys(STOCK_LABELS);
  const sortedTags = [...grouped.keys()].sort(
    (a, b) => (tagOrder.indexOf(a) === -1 ? 99 : tagOrder.indexOf(a))
              - (tagOrder.indexOf(b) === -1 ? 99 : tagOrder.indexOf(b))
  );
  for (const tag of sortedTags) {
    const label = STOCK_LABELS[tag] ?? tag;
    const list = grouped.get(tag);
    lines.push(`### ${label} (${list.length})`, "");
    for (const f of list) {
      const loc = evRef(f.evidence?.[0]);
      writeTwoCol(lines, f.name, loc);
    }
    lines.push("");
  }
}
```

Then in `renderInventory`, insert the call at the top of the body — **after** the summary, **before** any kind-based section:

```js
export function renderInventory({ repoPath, scan }) {
  const lines = [`# App Map — ${path.basename(repoPath)}`, ""];
  appendSummary(lines, scan);
  appendStandardPatternsSection(lines, scan.facts);   // ← new

  const by = groupByKind(scan.facts);

  // …all existing append* calls stay unchanged…
}
```

- [ ] **Step 4: Run tests**

```bash
node --test test/inventory.test.js
```

Expected: all old tests pass, all 5 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/reporters/inventory.js test/inventory.test.js
git commit -m "feat: markdown reporter — '## Standard Patterns' section above kind sections"
```

---

## Task 7: UI dashboard — `Standard` sidebar group + fact-row chips

The dashboard adds:
1. A new top-level sidebar group `Standard` listing each matched pattern as a filter.
2. A small `standard · <tag>` chip on fact rows that have a stock tag, so the kind-filtered list still surfaces the annotation.

**Files:**
- Modify: `src/ui/app.js`
- Modify: `src/ui/styles.css`

- [ ] **Step 1: Add `STOCK_META` near `KIND_META` in `app.js`**

Right after the existing `KIND_META` declaration:

```js
const STOCK_META = {
  auth:          { label: "Auth" },
  payment:       { label: "Payment" },
  file_storage:  { label: "File Storage" },
  email:         { label: "Email" },
  notifications: { label: "Notifications" },
  settings:      { label: "Settings" },
  health:        { label: "Health" },
};
```

- [ ] **Step 2: Add the new sidebar group at the top of `renderNav`**

In `renderNav`, just before the `for (const { label, kinds } of NAV_GROUPS)` loop, insert:

```js
  // ── Standard group ───────────────────────────────────────────────
  const stockCounts = {};
  for (const f of scanData.facts) {
    for (const tag of f.stock ?? []) stockCounts[tag] = (stockCounts[tag] || 0) + 1;
  }
  const stockTags = Object.keys(stockCounts).sort(
    (a, b) => (KIND_META_ORDER.indexOf(a) === -1 ? 99 : KIND_META_ORDER.indexOf(a))
              - (KIND_META_ORDER.indexOf(b) === -1 ? 99 : KIND_META_ORDER.indexOf(b))
  );
  if (stockTags.length) {
    html += `<div class="nav-group"><span class="nav-group-label">Standard</span>`;
    for (const tag of stockTags) {
      const meta = STOCK_META[tag] ?? { label: tag };
      html +=
        `<div class="nav-item${activeKind === `stock:${tag}` ? " active" : ""}" data-kind="stock:${tag}">` +
        `<span class="nav-icon">★</span>` +
        `<span class="nav-name">${esc(meta.label)}</span>` +
        `<span class="nav-count">${stockCounts[tag]}</span>` +
        `</div>`;
    }
    html += `</div>`;
  }
```

(Add a top-level `const KIND_META_ORDER = ["auth", "payment", "file_storage", "email", "notifications", "settings", "health"];` constant outside the function — same shape as the existing tag-ordering in the reporter.)

- [ ] **Step 3: Handle the `stock:*` filter in `renderFacts`**

In `renderFacts`, before the existing `let pool = ...` line:

```js
  let pool;
  if (activeKind?.startsWith("stock:")) {
    const tag = activeKind.slice("stock:".length);
    pool = facts.filter((f) => (f.stock ?? []).includes(tag));
  } else if (activeKind) {
    pool = facts.filter((f) => f.kind === activeKind);
  } else {
    pool = facts;
  }
```

Replace the existing `let pool = activeKind ? facts.filter((f) => f.kind === activeKind) : facts;` with the above.

- [ ] **Step 4: Render the chip on a fact row**

In the row HTML construction, after the `fact-name` div, add a chip if the fact has stock tags:

```js
      const stockChips = (f.stock ?? [])
        .map((t) => `<span class="stock-chip">${esc(t)}</span>`)
        .join("");
```

Then inject `stockChips` inside the `fact-body` div, after the `fact-name` line. (Use the existing `meta.label` resolution pattern — `STOCK_META[t]?.label ?? t` would be nicer UX, but the chip text is the raw pattern name for now to keep the change small.)

- [ ] **Step 5: Add CSS for the chip and the nav group**

Append to `src/ui/styles.css`:

```css
.stock-chip {
  display: inline-block;
  font-size: 10px;
  letter-spacing: 0.04em;
  padding: 1px 6px;
  margin-right: 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  text-transform: lowercase;
}
```

The `.nav-group` / `.nav-item` styles already exist; no new selector needed for the sidebar group itself.

- [ ] **Step 6: Run a manual smoke test**

```bash
node bin/varai.js start /home/gp/dreamLand/jodulabs/kalakar --no-open
```

Then in a browser, open `http://localhost:3847`, hard-refresh. Verify:
- A new `Standard` group appears at the top of the sidebar with `Auth`, `Payment`, etc. as filters
- Clicking a stock filter shows only facts tagged with that pattern
- The fact rows show a small `auth` / `payment` chip when applicable

Stop the server with `Ctrl-C` when done.

- [ ] **Step 7: Commit**

```bash
git add src/ui/app.js src/ui/styles.css
git commit -m "feat: dashboard — Standard sidebar group + fact-row stock chips"
```

---

## Task 8: Golden example — show stock tagging on a real scenario

`examples/golden/stripe-full-loop` already exercises payment flows. Update its `expected-findings.json` (or add a sibling test) to assert that at least one fact carries a `stock` tag, so a future regression in tagging surfaces in CI.

**Files:**
- Modify: `test/scanner-new.test.js` (or a new `test/stock-golden.test.js`)

- [ ] **Step 1: Add a golden test that asserts stock tags on a real scenario**

```js
// test/stock-golden.test.js
import assert from "node:assert/strict";
import test from "node:test";
import { scanRepo } from "../src/scanners/index.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../examples/golden/stripe-full-loop/app");

test("stripe-full-loop scenario produces at least one 'payment' stock tag", async () => {
  const { facts } = await scanRepo(REPO, { cache: false });
  const tagged = facts.filter((f) => (f.stock ?? []).includes("payment"));
  assert.ok(tagged.length > 0, "expected at least one payment-tagged fact in stripe-full-loop");
});
```

- [ ] **Step 2: Run**

```bash
node --test test/stock-golden.test.js
```

Expected: passes. (If it doesn't, list the facts and see which signatures need adjustment — but the catalog is conservative enough that a Stripe-heavy example should match.)

- [ ] **Step 3: Commit**

```bash
git add test/stock-golden.test.js
git commit -m "test: golden scenario asserts stock tagging on stripe-full-loop"
```

---

## Task 9: `docs/spec.md` note + ADR for catalog location

Two small documentation drops. (ADRs only when warranted — the catalog-location decision qualifies: hard to reverse, surprising without context, real trade-off.)

**Files:**
- Modify: `docs/spec.md`
- Create: `docs/adr/0002-stock-catalog-ships-in-source.md`

- [ ] **Step 1: Add a one-line note to `docs/spec.md`**

In the "Fact types" table (around line 17-32), add a single new row at the bottom:

```markdown
| `stock` (field, not kind) | optional array of stock pattern names a fact matches | derived (post-merge pass) |
```

Or, if the table doesn't fit a "field" column, add a one-line paragraph after the table:

> Every fact may also carry an optional `stock: string[]` field — a list of stock pattern names (`auth`, `payment`, `file_storage`, `email`, `notifications`, `settings`, `health`) it matches. Populated by a post-merge derived pass. See `docs/superpowers/specs/2026-06-07-varai-stock-catalog-design.md`.

- [ ] **Step 2: Create the ADR**

```markdown
# ADR 0002: Stock catalog lives in source, with per-repo override

Status: Accepted

## Context

The lens gains a "stock pattern" axis (recognizable SaaS/app building blocks — auth, payment, …) that facts are matched against. The catalog of patterns must live somewhere.

Three options:

1. **Shipped default in source, no override.** Every user gets the same catalog. Simple. Companies with internal "stock" patterns (their own SSO, their audit logging) have no escape hatch.
2. **Per-repo config only.** Every user declares their own. No value out of the box — most users would not bother, and the lens would feel empty on first run.
3. **Shipped default + per-repo override.** Defaults ship in `src/scanners/extractors/stock-catalog.js`; a repo can `disable` patterns or `additional` extend the catalog via the existing `varai.config.json`. Small surface area, no new config file, defaults carry the value, escape hatch preserved.

## Decision

Option 3.

## Consequences

- The defaults are the value. Most users get useful tagging on first run with zero configuration.
- Companies have a small, declared override mechanism. The override schema is documented and non-breaking; signatures use the same shape as defaults, including the `role` field (curated now, even though v1 doesn't consume it — retrofitting later is the kind of migration that never happens).
- Adding a new pattern ships with the tool, behind a SemVer bump. No "is the user on a config version?" question.
- The override is a foot-gun if a user disables a pattern and later forgets. The risk is acceptable: the user explicitly asked for it, and the residual "Custom" bucket is still honest.
```

Save as `docs/adr/0002-stock-catalog-ships-in-source.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/spec.md docs/adr/0002-stock-catalog-ships-in-source.md
git commit -m "docs: spec note + ADR for stock catalog location"
```

---

## Task 10: Full test pass + manual verification

No new code. Final smoke test before declaring the PR done.

- [ ] **Step 1: Full test suite**

```bash
npm test
```

Expected: all tests pass. The new test files add ~30 tests; the total should be at least 30 more than before this PR.

- [ ] **Step 2: Run on kalakar, eyeball the output**

```bash
node bin/varai.js map /home/gp/dreamLand/jodulabs/kalakar --no-cache > /tmp/kalakar-stock.md
head -60 /tmp/kalakar-stock.md
```

Expected: a `## Standard Patterns` section at the top, with subheadings like `### Auth`, `### Payment`, `### File Storage`, `### Email`, `### Health`, listing the kalakar facts that match. The existing kind-based sections follow unchanged.

- [ ] **Step 3: Start the dashboard, eyeball the UI**

```bash
node bin/varai.js start /home/gp/dreamLand/jodulabs/kalakar --no-open
```

Open `http://localhost:3847` in a browser, hard-refresh. Verify the new `Standard` sidebar group, the stock chips on fact rows, and that clicking a stock filter narrows the list correctly. Stop the server with `Ctrl-C`.

- [ ] **Step 4: Cache behavior check**

```bash
# warm cache, then change a catalog entry
node bin/varai.js map /home/gp/dreamLand/jodulabs/kalakar  # populates cache
# edit src/scanners/extractors/stock-catalog.js to disable "health"
node bin/varai.js map /home/gp/dreamLand/jodulabs/kalakar  # re-run, no --no-cache
```

Expected: the second run reflects the catalog edit. Stock tagging is post-cache, so a catalog change does *not* require `--no-cache`. (This is the invariant from the design spec; if the change doesn't appear, the cache is incorrectly caching derived content — investigate.)

- [ ] **Step 5: Commit any final fixes (probably none)**

If Task 4 surfaced an issue, fix and commit. Otherwise no commit.

---

## What this PR is *not*

(Recap from the design spec, repeated here so a subagent doesn't scope-creep.)

- No `EXTRACTOR_VERSION` bump. Tagging is post-cache.
- No change to `kind` or `layer` semantics.
- No change to per-file extractors or stack detection.
- No "Custom" markdown section (kind views are implicitly that).
- No gap detection (the `role` field and `instances` return shape are the only down payments).
- No structured `stock` — stays a flat string array. The pattern-instance view is derived.
- No `package.json` dependency changes.
- No new files in `examples/golden/`.
