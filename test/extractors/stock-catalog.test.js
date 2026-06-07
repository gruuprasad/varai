import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CATALOG, getPattern, buildCatalog } from "../../src/scanners/extractors/stock-catalog.js";

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
    /signatures/
  );
  assert.throws(
    () => buildCatalog({ stock: { additional: [{ name: "bad", signatures: [{ kind: "api_route" }] }] } }),
    /nameRegex/
  );
});
