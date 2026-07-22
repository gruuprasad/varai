import assert from "node:assert/strict";
import test from "node:test";
import {
  areaIsChanged,
  areaMatchesQuery,
  areaPreviewClaims,
  areaRoleLine,
  areaSummarySentences,
  collectChangedClaimIds,
  coreIsChanged,
  formatClaimSummary,
  operationIsChanged,
  operationPreviewSummary,
  renderObservedAreasOutline,
  sharedCoreLabel,
  ungroupedMatchesQuery,
} from "../../src/ui/observed-areas-view.js";

const byId = new Map([
  ["el:surface-a", { id: "el:surface-a", name: "Plan Canvas", kind: "surface" }],
  ["el:surface-b", { id: "el:surface-b", name: "Quantities", kind: "surface" }],
  ["el:model", { id: "el:model", name: "Building Model", kind: "aggregate" }],
  ["el:summary", { id: "el:summary", name: "Quantity Summary", kind: "artifact" }],
  ["el:action-wall", { id: "el:action-wall", name: "Add wall", kind: "action" }],
]);

const claimsById = new Map([
  ["claim:change", {
    id: "claim:change", relation: "changes",
    target: { kind: "reference", id: "el:model" }, claimState: "observed",
  }],
  ["claim:produce", {
    id: "claim:produce", relation: "produces",
    target: { kind: "reference", id: "el:summary" }, claimState: "observed",
  }],
  ["claim:fail", {
    id: "claim:fail", relation: "fails_with",
    target: { kind: "literal", value: "preview is stale" }, claimState: "observed",
  }],
]);

const envelopesById = new Map([
  ["envelope:wall", {
    id: "envelope:wall", name: "Add wall", entryBehaviorId: "el:action-wall",
    behaviorIds: ["el:action-wall"], completeness: "closed",
    primaryEffectClaimIds: ["claim:change"], outputClaimIds: [], outcomeClaimIds: [],
  }],
  ["envelope:qty", {
    id: "envelope:qty", name: "Inspect quantities", entryBehaviorId: "el:action-qty",
    behaviorIds: ["el:action-qty"], completeness: "partial",
    primaryEffectClaimIds: [], outputClaimIds: ["claim:produce"], outcomeClaimIds: ["claim:fail"],
  }],
]);

const projection = {
  kind: "observed-areas",
  areas: [{
    id: "region:interaction-context:el:surface-a",
    anchorElementId: "el:surface-a",
    envelopeIds: ["envelope:wall"],
    behaviorIds: ["el:action-wall"],
    claimIds: ["claim:change"],
    sharedCoreIds: ["region:shared-resource-core:model"],
    operationCount: 1,
    primaryOperationCount: 1,
    completeness: "supported",
    operations: [{
      id: "envelope:wall",
      envelopeId: "envelope:wall",
      entryBehaviorId: "el:action-wall",
      behaviorIds: ["el:action-wall"],
      primaryEffectClaimIds: ["claim:change"],
      supportingEffectClaimIds: [],
      outputClaimIds: [],
      outcomeClaimIds: [],
      conditionClaimIds: [],
      unresolvedClaimIds: [],
      claimIds: ["claim:change"],
      completeness: "closed",
      prominence: "primary",
      pathIds: ["path:wall"],
    }],
  }, {
    id: "region:interaction-context:el:surface-b",
    anchorElementId: "el:surface-b",
    envelopeIds: ["envelope:qty"],
    behaviorIds: ["el:action-qty"],
    claimIds: ["claim:produce", "claim:fail"],
    sharedCoreIds: [],
    operationCount: 1,
    primaryOperationCount: 1,
    completeness: "partial",
    operations: [{
      id: "envelope:qty",
      envelopeId: "envelope:qty",
      entryBehaviorId: "el:action-qty",
      behaviorIds: ["el:action-qty"],
      primaryEffectClaimIds: [],
      supportingEffectClaimIds: [],
      outputClaimIds: ["claim:produce"],
      outcomeClaimIds: ["claim:fail"],
      conditionClaimIds: [],
      unresolvedClaimIds: [],
      claimIds: ["claim:produce", "claim:fail"],
      completeness: "partial",
      prominence: "primary",
      pathIds: [],
    }],
  }],
  sharedCores: [{
    id: "region:shared-resource-core:model",
    anchorElementIds: ["el:model"],
    usedByAreaIds: ["region:interaction-context:el:surface-a"],
    envelopeIds: ["envelope:wall"],
    behaviorIds: ["el:action-wall"],
    claimIds: ["claim:change"],
    completeness: "supported",
  }],
  ungrouped: [{
    envelopeId: "envelope:orphan",
    reason: "no-supported-interaction-context",
  }],
};

envelopesById.set("envelope:orphan", {
  id: "envelope:orphan", name: "Orphan export", entryBehaviorId: "el:orphan",
  behaviorIds: ["el:orphan"], completeness: "open",
  primaryEffectClaimIds: [], outputClaimIds: [], outcomeClaimIds: [],
});

const esc = (value) => String(value)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const relationLabel = (relation) => relation;
const kindLabel = (kind) => kind;
const stateMark = () => "";
const changeBadge = () => `<span class="change-badge">changed</span>`;
const pathStatus = (value) => value ? `<span class="path-status">${value}</span>` : "";
const claimRow = (claim) => `<div class="claim">${formatClaimSummary(claim, byId, relationLabel)}</div>`;
const pathsById = new Map([["path:wall", {
  id: "path:wall",
  steps: [{ behaviorId: "el:action-wall", viaClaimId: null }],
}]]);

test("shared core labels stay recovered names and compact without invention", () => {
  assert.equal(
    sharedCoreLabel(["el:model", "el:summary"], byId, { compact: true }),
    "Building Model + Quantity Summary",
  );
  const many = sharedCoreLabel(
    ["el:model", "el:summary", "el:surface-a", "el:surface-b"],
    byId,
    { compact: true },
  );
  assert.equal(many, "Building Model + Quantity Summary + 2 more");
  assert.equal(many.toLowerCase().includes("authoring"), false);
});

test("role line uses kind label, primary counts, and completeness", () => {
  assert.equal(areaRoleLine(projection.areas[0], byId, kindLabel), "surface · 1 primary operation");
  assert.equal(areaRoleLine(projection.areas[1], byId, kindLabel), "surface · 1 primary operation · partial");
});

test("summary sentences dedupe relation+target and lead with Mainly", () => {
  assert.deepEqual(
    areaSummarySentences(projection.areas[0], claimsById, byId, relationLabel),
    ["Mainly changes Building Model."],
  );
  assert.deepEqual(
    areaSummarySentences(projection.areas[1], claimsById, byId, relationLabel),
    ["Mainly produces Quantity Summary."],
  );
  const dupOp = {
    ...projection.areas[0].operations[0],
    primaryEffectClaimIds: ["claim:change", "claim:change"],
  };
  const dupArea = { ...projection.areas[0], operations: [dupOp, dupOp] };
  assert.deepEqual(
    areaSummarySentences(dupArea, claimsById, byId, relationLabel),
    ["Mainly changes Building Model."],
  );
});

test("operation preview summary uses one deduped primary claim", () => {
  assert.equal(
    operationPreviewSummary(projection.areas[0].operations[0], claimsById, byId, relationLabel),
    "changes Building Model",
  );
});

test("preview claims prefer primary effects, outputs, and outcomes", () => {
  const operation = projection.areas[1].operations[0];
  const claims = areaPreviewClaims(operation, claimsById);
  assert.deepEqual(claims.map((item) => item.id), ["claim:produce", "claim:fail"]);
  assert.equal(formatClaimSummary(claims[0], byId, relationLabel), "produces Quantity Summary");
});

test("query matching uses recovered names only", () => {
  const coresById = new Map(projection.sharedCores.map((item) => [item.id, item]));
  assert.equal(areaMatchesQuery(projection.areas[0], byId, envelopesById, coresById, "plan"), true);
  assert.equal(areaMatchesQuery(projection.areas[0], byId, envelopesById, coresById, "authoring"), false);
  assert.equal(ungroupedMatchesQuery(projection.ungrouped[0], envelopesById, "orphan"), true);
});

test("change overlay marks areas, operations, and shared cores from claim and element ids", () => {
  const changedClaims = collectChangedClaimIds({
    claims: {
      added: [{ id: "claim:change", sourceId: "el:op" }],
      removed: [],
      changed: [],
    },
  });
  assert.equal(changedClaims.has("claim:change"), true);
  assert.equal(areaIsChanged(projection.areas[0], new Set(), changedClaims), true);
  assert.equal(areaIsChanged(projection.areas[1], new Set(), changedClaims), false);
  assert.equal(operationIsChanged(projection.areas[0].operations[0], new Set(), changedClaims), true);
  assert.equal(coreIsChanged(projection.sharedCores[0], new Set(), changedClaims), true);
  assert.equal(areaIsChanged(projection.areas[1], new Set(["el:action-qty"]), new Set()), true);
});

test("outline grid shows cards without auto-selected focus", () => {
  const populated = renderObservedAreasOutline({
    projection,
    byId,
    envelopesById,
    pathsById,
    claimsById,
    query: "",
    changesOnly: false,
    changedElements: new Set(),
    changedClaims: new Set(["claim:change"]),
    expandedId: null,
    relationLabel,
    kindLabel,
    stateMark,
    changeBadge,
    pathStatus,
    claimRow,
    esc,
  });
  assert.equal(populated.activeId, null);
  assert.match(populated.masterHtml, /Observed areas/);
  assert.match(populated.masterHtml, /Plan Canvas/);
  assert.match(populated.masterHtml, /Quantities/);
  assert.match(populated.masterHtml, /area-role/);
  assert.match(populated.masterHtml, /Mainly changes Building Model/);
  assert.match(populated.masterHtml, /path-status/);
  assert.match(populated.masterHtml, /partial/);
  assert.match(populated.masterHtml, /area-summary/);
  assert.match(populated.masterHtml, /area-card/);
  assert.match(populated.masterHtml, /Shared system parts/);
  assert.match(populated.masterHtml, /Building Model/);
  assert.match(populated.masterHtml, /Not placed in an observed area/);
  assert.match(populated.masterHtml, /Orphan export/);
  assert.match(populated.masterHtml, /changed/);
  assert.equal(populated.masterHtml.includes("selected"), false);
  assert.equal(populated.masterHtml.includes("detail-content"), false);
  assert.match(populated.detailHtml, /Select an item/);
  assert.equal(populated.detailHtml.includes("Observed path"), false);
  assert.equal(populated.detailHtml.includes("Uses shared system parts"), false);
  assert.equal(populated.changedAreaCount, 1);
  assert.equal(populated.html.includes("changes Building Model · changes Building Model"), false);
});

test("outline focus opens only when an area is selected", () => {
  const expanded = renderObservedAreasOutline({
    projection,
    byId,
    envelopesById,
    pathsById,
    claimsById,
    query: "",
    changesOnly: false,
    changedElements: new Set(),
    changedClaims: new Set(),
    expandedId: projection.areas[0].id,
    relationLabel,
    kindLabel,
    stateMark,
    changeBadge,
    pathStatus,
    claimRow,
    esc,
  });
  assert.equal(expanded.activeId, projection.areas[0].id);
  assert.match(expanded.masterHtml, /selected/);
  assert.match(expanded.detailHtml, /detail-title/);
  assert.match(expanded.detailHtml, /area-summary/);
  assert.match(expanded.detailHtml, /detail-role/);
  assert.match(expanded.detailHtml, /Add wall/);
  assert.match(expanded.detailHtml, /Observed path/);
  assert.match(expanded.detailHtml, /Uses shared system parts/);
  assert.match(expanded.detailHtml, /ops-preview/);
  assert.match(expanded.detailHtml, /changes Building Model/);
  assert.match(expanded.detailHtml, /<section class="envelope-section"><h3>Changes<\/h3>/);
});

test("outline renders changed-only, empty, and supporting states", () => {
  const changedOnly = renderObservedAreasOutline({
    projection,
    byId,
    envelopesById,
    pathsById,
    claimsById,
    query: "",
    changesOnly: true,
    changedElements: new Set(),
    changedClaims: new Set(["claim:change"]),
    expandedId: null,
    relationLabel,
    kindLabel,
    stateMark,
    changeBadge,
    pathStatus,
    claimRow,
    esc,
  });
  assert.match(changedOnly.html, /Plan Canvas/);
  assert.equal(changedOnly.html.includes("Quantities"), false);
  assert.equal(changedOnly.matchCount >= 1, true);

  const empty = renderObservedAreasOutline({
    projection: { ...projection, areas: [], sharedCores: [], ungrouped: [] },
    byId,
    envelopesById,
    pathsById,
    claimsById,
    query: "",
    changesOnly: false,
    changedElements: new Set(),
    changedClaims: new Set(),
    expandedId: null,
    relationLabel,
    kindLabel,
    stateMark,
    changeBadge,
    pathStatus,
    claimRow,
    esc,
  });
  assert.match(empty.html, /No observed interaction areas were recovered/);

  const withSupporting = {
    ...projection,
    areas: [{
      ...projection.areas[0],
      operations: [
        projection.areas[0].operations[0],
        {
          ...projection.areas[0].operations[0],
          id: "envelope:support",
          envelopeId: "envelope:support",
          prominence: "supporting",
          primaryEffectClaimIds: [],
          supportingEffectClaimIds: ["claim:change"],
          claimIds: ["claim:change"],
        },
      ],
    }],
  };
  envelopesById.set("envelope:support", {
    id: "envelope:support", name: "Support read", entryBehaviorId: "el:action-wall",
    behaviorIds: ["el:action-wall"], completeness: "partial",
    primaryEffectClaimIds: [], outputClaimIds: [], outcomeClaimIds: [],
  });
  const supporting = renderObservedAreasOutline({
    projection: withSupporting,
    byId,
    envelopesById,
    pathsById,
    claimsById,
    query: "",
    changesOnly: false,
    changedElements: new Set(),
    changedClaims: new Set(),
    expandedId: withSupporting.areas[0].id,
    relationLabel,
    kindLabel,
    stateMark,
    changeBadge,
    pathStatus,
    claimRow,
    esc,
  });
  assert.match(supporting.detailHtml, /<details class="supporting-observations"/);
  assert.match(supporting.detailHtml, /Support read/);
  const changesAt = supporting.detailHtml.indexOf("<h3>Changes</h3>");
  const usesAt = supporting.detailHtml.indexOf("<h3>Uses</h3>");
  assert.equal(changesAt >= 0 && usesAt > changesAt, true);
});
