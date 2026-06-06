import assert from "node:assert/strict";
import test from "node:test";
import { deriveIntegrations } from "../../src/scanners/extractors/integration.js";

const pkg = (name, file = "pyproject.toml", ecosystem = "python") =>
  ({ kind: "package", name, ecosystem, evidence: [{ file }], layer: "ast" });
const env = (name, file = ".env") =>
  ({ kind: "env_var", name, evidence: [{ file }], layer: "file" });

test("detects a service from a package signal", () => {
  const out = deriveIntegrations([pkg("stripe")]);
  const stripe = out.find((f) => f.name === "Stripe");
  assert.ok(stripe, "Stripe detected");
  assert.equal(stripe.kind, "integration");
  assert.equal(stripe.category, "payments");
  assert.deepEqual(stripe.signals.packages, ["stripe"]);
  assert.equal(stripe.layer, "ast", "package-backed match is ast layer");
});

test("detects a service from an env-var prefix only", () => {
  const out = deriveIntegrations([env("GITHUB_TOKEN"), env("GITHUB_REPO")]);
  const gh = out.find((f) => f.name === "GitHub API");
  assert.ok(gh, "GitHub API detected from env prefix");
  assert.deepEqual(gh.signals.envVars, ["GITHUB_REPO", "GITHUB_TOKEN"]);
  assert.equal(gh.signals.packages.length, 0);
  assert.equal(gh.layer, "heuristic", "env-only match is heuristic layer");
});

test("merges package and env signals into one integration with combined evidence", () => {
  const out = deriveIntegrations([
    pkg("sentry-sdk", "services/backend/pyproject.toml"),
    pkg("@sentry/react", "services/frontend/package.json", "npm"),
    env("SENTRY_DSN", "services/backend/.env"),
  ]);
  const sentry = out.filter((f) => f.name === "Sentry");
  assert.equal(sentry.length, 1, "one Sentry fact, not three");
  assert.deepEqual(sentry[0].signals.packages, ["@sentry/react", "sentry-sdk"]);
  assert.deepEqual(sentry[0].signals.envVars, ["SENTRY_DSN"]);
  assert.deepEqual(sentry[0].evidence.map((e) => e.file), [
    "services/backend/.env",
    "services/backend/pyproject.toml",
    "services/frontend/package.json",
  ]);
});

test("matches package names case-insensitively", () => {
  const out = deriveIntegrations([pkg("PyGithub")]);
  assert.ok(out.some((f) => f.name === "GitHub API"));
});

test("does not invent integrations from unrelated facts", () => {
  const out = deriveIntegrations([
    pkg("numpy"),
    pkg("lodash", "package.json", "npm"),
    env("MAX_UPLOAD_SIZE_MB"),
    { kind: "component", name: "Button", evidence: [{ file: "Button.tsx" }], layer: "ast" },
  ]);
  assert.equal(out.length, 0, "no false positives");
});

test("longest env prefix wins (POSTGRES_ over PG)", () => {
  const out = deriveIntegrations([env("POSTGRES_HOST")]);
  const matches = out.map((f) => f.name);
  assert.deepEqual(matches, ["PostgreSQL"]);
});

test("output is sorted by service name and deterministic", () => {
  const facts = [pkg("redis"), pkg("stripe"), pkg("openai")];
  const a = deriveIntegrations(facts).map((f) => f.name);
  const b = deriveIntegrations([...facts].reverse()).map((f) => f.name);
  assert.deepEqual(a, b, "order independent of input order");
  assert.deepEqual(a, [...a].sort(), "sorted by name");
});
