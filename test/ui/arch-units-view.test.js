import assert from "node:assert/strict";
import test from "node:test";
import {
  unitDisplayName,
  unitSummaryLine,
  unitMatchesQuery,
} from "../../src/ui/arch-units-view.js";

const subsystemsById = new Map([["subsystem:abc", { id: "subsystem:abc", name: "API" }]]);

const unit = (overrides = {}) => ({
  id: "module:app/orders.py",
  memberElementIds: ["element:one", "element:two"],
  outboundUnitIds: ["module:app/users.py"],
  inboundUnitIds: [],
  outboundEdgeCount: 3,
  inboundEdgeCount: 0,
  ...overrides,
});

test("unitDisplayName strips the module prefix and keeps the path", () => {
  assert.equal(unitDisplayName("module:app/orders.py", subsystemsById), "app/orders.py");
});

test("unitDisplayName resolves a subsystem unit to its name", () => {
  assert.equal(unitDisplayName("subsystem:abc", subsystemsById), "API");
});

test("unitDisplayName falls back to the raw id when nothing resolves", () => {
  assert.equal(unitDisplayName("subsystem:unknown", subsystemsById), "subsystem:unknown");
});

test("unitSummaryLine counts parts and both edge directions", () => {
  assert.equal(unitSummaryLine(unit()), "2 parts · depends on 1 · used by nothing");
});

test("unitSummaryLine says nothing rather than zero when a unit is isolated", () => {
  const isolated = unit({ memberElementIds: ["element:one"], outboundUnitIds: [], outboundEdgeCount: 0 });
  assert.equal(unitSummaryLine(isolated), "1 part · depends on nothing · used by nothing");
});

test("unitMatchesQuery matches on the unit name", () => {
  assert.equal(unitMatchesQuery(unit(), "orders", subsystemsById, new Map()), true);
  assert.equal(unitMatchesQuery(unit(), "invoices", subsystemsById, new Map()), false);
});

test("unitMatchesQuery matches on a member element name", () => {
  const byId = new Map([["element:one", { id: "element:one", name: "GET /invoices" }]]);
  assert.equal(unitMatchesQuery(unit(), "invoices", subsystemsById, byId), true);
});

test("unitMatchesQuery admits everything when the query is empty", () => {
  assert.equal(unitMatchesQuery(unit(), "", subsystemsById, new Map()), true);
});
