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
  const f = fact({ kind: "db_model", name: "User",
                   evidence: [{ file: "alembic/versions/0001.py" },
                              { file: "models/auth/user.py" }] });
  assert.equal(I.matchesSignature(f, sig), true);
});

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
  assert.equal(out.facts[1].stock, undefined);
});

test("tagStock: derived integration facts (e.g. stripe) match as provider role", () => {
  const out = tagStock([
    fact({ kind: "integration", name: "stripe",
           evidence: [{ file: "package.json" }] }),
  ], {});
  assert.deepEqual(out.facts[0].stock, ["payment"]);
});

test("tagStock: multi-tag — fact can be tagged by multiple patterns", () => {
  const out = tagStock([
    fact({ kind: "package", name: "firebase-admin",
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
  assert.equal(out.facts, facts);
});

test("tagStock: does not produce a stock field on facts that match nothing", () => {
  const out = tagStock([
    fact({ kind: "env_var", name: "DATABASE_URL" }),
  ], {});
  assert.equal(out.facts[0].stock, undefined);
});
