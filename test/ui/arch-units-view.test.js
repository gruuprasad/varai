import assert from "node:assert/strict";
import test from "node:test";
import {
  archUnitsNotice,
  renderArchUnitsOutline,
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

const projection = {
  kind: "arch-units",
  grain: "module",
  units: [
    {
      id: "module:app/orders.py",
      memberElementIds: ["element:one"],
      outboundUnitIds: ["module:app/users.py"],
      inboundUnitIds: [],
      outboundEdgeCount: 2,
      inboundEdgeCount: 0,
    },
    {
      id: "module:app/users.py",
      memberElementIds: ["element:two"],
      outboundUnitIds: [],
      inboundUnitIds: ["module:app/orders.py"],
      outboundEdgeCount: 0,
      inboundEdgeCount: 2,
    },
  ],
  edges: [{
    fromUnitId: "module:app/orders.py",
    toUnitId: "module:app/users.py",
    claimIds: ["claim:a", "claim:b"],
    edgeCount: 2,
  }],
};

const outlineCtx = {
  projection,
  subsystemsById: new Map(),
  byId: new Map([
    ["element:one", { id: "element:one", name: "GET /orders", kind: "operation" }],
    ["element:two", { id: "element:two", name: "GET /users", kind: "operation" }],
  ]),
  query: "",
  expandedId: null,
  changedElements: new Set(),
};

test("archUnitsNotice is silent when edges were observed", () => {
  assert.equal(archUnitsNotice(projection), "");
});

test("archUnitsNotice names the coverage limit when no edges were observed", () => {
  const notice = archUnitsNotice({ ...projection, edges: [] });
  assert.match(notice, /No dependencies were observed/);
  assert.match(notice, /Python imports/);
});

test("renderArchUnitsOutline lists every unit by display name", () => {
  const rendered = renderArchUnitsOutline(outlineCtx);
  assert.match(rendered.masterHtml, /app\/orders\.py/);
  assert.match(rendered.masterHtml, /app\/users\.py/);
  assert.equal(rendered.matchCount, 2);
});

test("renderArchUnitsOutline filters by query and reports the match count", () => {
  const rendered = renderArchUnitsOutline({ ...outlineCtx, query: "orders" });
  assert.match(rendered.masterHtml, /app\/orders\.py/);
  assert.doesNotMatch(rendered.masterHtml, /app\/users\.py/);
  assert.equal(rendered.matchCount, 1);
});

test("renderArchUnitsOutline marks the expanded unit selected and exposes its id", () => {
  const rendered = renderArchUnitsOutline({ ...outlineCtx, expandedId: "module:app/orders.py" });
  assert.match(rendered.masterHtml, /class="card selected open"/);
  assert.match(rendered.masterHtml, /data-expand="module:app\/orders\.py"/);
});

test("unit detail names outbound dependencies with their edge counts", () => {
  const rendered = renderArchUnitsOutline({ ...outlineCtx, expandedId: "module:app/orders.py" });
  assert.match(rendered.detailHtml, /Depends on/);
  assert.match(rendered.detailHtml, /app\/users\.py/);
  assert.match(rendered.detailHtml, /2 references/);
});

test("unit detail names inbound dependents", () => {
  const rendered = renderArchUnitsOutline({ ...outlineCtx, expandedId: "module:app/users.py" });
  assert.match(rendered.detailHtml, /Used by/);
  assert.match(rendered.detailHtml, /app\/orders\.py/);
});

test("unit detail lists member elements", () => {
  const rendered = renderArchUnitsOutline({ ...outlineCtx, expandedId: "module:app/orders.py" });
  assert.match(rendered.detailHtml, /GET \/orders/);
});

test("unit detail states plainly when a unit has no dependencies either way", () => {
  const lone = {
    ...projection,
    units: [{
      id: "module:app/lone.py", memberElementIds: ["element:one"],
      outboundUnitIds: [], inboundUnitIds: [], outboundEdgeCount: 0, inboundEdgeCount: 0,
    }],
    edges: [],
  };
  const rendered = renderArchUnitsOutline({ ...outlineCtx, projection: lone, expandedId: "module:app/lone.py" });
  assert.match(rendered.detailHtml, /No dependencies were observed for this unit/);
});

test("renderArchUnitsOutline escapes unit names", () => {
  const nasty = {
    ...projection,
    units: [{
      id: `module:app/<script>.py`, memberElementIds: [],
      outboundUnitIds: [], inboundUnitIds: [], outboundEdgeCount: 0, inboundEdgeCount: 0,
    }],
    edges: [],
  };
  const rendered = renderArchUnitsOutline({ ...outlineCtx, projection: nasty });
  assert.doesNotMatch(rendered.masterHtml, /<script>/);
  assert.match(rendered.masterHtml, /&lt;script&gt;/);
});

test("renderArchUnitsOutline returns an empty-state master when there are no units", () => {
  const rendered = renderArchUnitsOutline({ ...outlineCtx, projection: { ...projection, units: [], edges: [] } });
  assert.match(rendered.masterHtml, /No architectural units were observed/);
  assert.equal(rendered.matchCount, 0);
});
