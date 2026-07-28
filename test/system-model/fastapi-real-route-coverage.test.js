// Real FastAPI routes use dependency injection, header parameters, and model
// constructors. None of those are unresolved body calls, so none of them may
// keep an otherwise fully understood handler out of analyzed coverage — that is
// what makes sound omission detection reachable on a field-grade repo.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";

const fixture = path.resolve("test/fixtures/fastapi-coverage-realistic");
const modelPromise = scanRepo(fixture, { jobs: 1, cache: false }).then(({ model }) => model);

const ROUTES = [
  "GET /api/slots",
  "POST /api/bookings",
  "POST /api/bookings/{booking_id}/cancel",
];

const operationByKey = (model, key) =>
  model.elements.find((element) => element.kind === "operation" && element.name === key);

const coverageFor = (model, key, capability) => {
  const operation = operationByKey(model, key);
  assert.ok(operation, `operation ${key} is observed`);
  return model.coverage.filter((record) =>
    record.capability === capability && record.scopeId === operation.id);
};

test("every realistic FastAPI route reaches analyzed effect and failure coverage", async () => {
  const model = await modelPromise;
  for (const key of ROUTES) {
    for (const capability of ["api.effect", "api.failure"]) {
      const records = coverageFor(model, key, capability);
      assert.equal(records.length, 1, `${key} has one ${capability} record`);
      assert.equal(records[0].state, "analyzed",
        `${key} ${capability} is analyzed, got ${records[0].state}: ${records[0].details?.join("; ")}`);
    }
  }
});

test("dependency injection, headers, and model constructors are not unresolved calls", async () => {
  const model = await modelPromise;
  const details = model.coverage
    .filter((record) => record.scopeId?.startsWith("element:"))
    .flatMap((record) => record.details ?? []);
  assert.ok(!details.includes("unresolved function"),
    `no route reports an unresolved function, got: ${[...new Set(details)].join("; ")}`);
});

test("analyzed coverage still carries the observed effects it claims to have seen", async () => {
  const model = await modelPromise;
  // Analyzed coverage is only worth having if the effects are actually present:
  // an empty trace that reports analyzed would license false absence verdicts.
  const claimsFrom = (key, relation) => {
    const operation = operationByKey(model, key);
    return model.claims.filter((claim) => claim.sourceId === operation.id && claim.relation === relation);
  };
  const named = (claims) => claims
    .map((claim) => model.elements.find((element) => element.id === claim.target?.id)?.name)
    .filter(Boolean);

  assert.ok(named(claimsFrom("GET /api/slots", "reads")).includes("Slot"));

  const bookWrites = [...named(claimsFrom("POST /api/bookings", "creates")),
    ...named(claimsFrom("POST /api/bookings", "changes"))];
  assert.ok(bookWrites.includes("Booking"), `booking write observed, got ${bookWrites.join(", ")}`);
  assert.ok(bookWrites.includes("Slot"), `slot change observed, got ${bookWrites.join(", ")}`);
  assert.ok(bookWrites.includes("OutboxEntry"),
    `the local notification helper's write is traced, got ${bookWrites.join(", ")}`);

  const cancelRemoves = named(claimsFrom("POST /api/bookings/{booking_id}/cancel", "removes"));
  assert.ok(cancelRemoves.includes("Booking"), `cancel removes Booking, got ${cancelRemoves.join(", ")}`);

  const failures = (key) => claimsFrom(key, "fails_with")
    .map((claim) => Number(claim.target?.value)).sort((a, b) => a - b);
  assert.deepEqual(failures("POST /api/bookings"), [404, 409]);
  assert.deepEqual(failures("POST /api/bookings/{booking_id}/cancel"), [403, 404]);
});
