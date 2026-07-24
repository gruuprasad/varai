import { validateSystemModel } from "../validate.js";

/**
 * Unit-level dependency projection over Element→Element `depends_on` claims.
 * Grain is retunable without re-scan:
 * - "subsystem" (default): group by element.subsystemId
 * - "module": group by the lexicographically smallest distinct file path
 *   among `evidence` and `implementationPath` entries that have a file
 *   (`module:<path>`). This is a deterministic rollup key, not a designated
 *   home/definition site — canonical evidence is sorted by full JSON key,
 *   so evidence[0] alone is not treated as authoritative.
 *
 * Intra-unit edges are dropped at unit grain. No new facts are invented.
 */
export function archUnits(model, { grain = "subsystem" } = {}) {
  validateSystemModel(model);
  if (grain !== "subsystem" && grain !== "module") {
    throw new Error(`unsupported archUnits grain: ${grain}`);
  }

  const unitIdByElementId = new Map();
  const membersByUnitId = new Map();

  for (const element of model.elements) {
    const unitId = unitIdForElement(element, grain);
    if (!unitId) continue;
    unitIdByElementId.set(element.id, unitId);
    const members = membersByUnitId.get(unitId) ?? [];
    members.push(element.id);
    membersByUnitId.set(unitId, members);
  }

  const edgeAccum = new Map();
  for (const claim of model.claims) {
    if (claim.relation !== "depends_on") continue;
    if (claim.target?.kind !== "reference") continue;
    const fromUnitId = unitIdByElementId.get(claim.sourceId);
    const toUnitId = unitIdByElementId.get(claim.target.id);
    if (!fromUnitId || !toUnitId) continue;
    if (fromUnitId === toUnitId) continue;
    const key = `${fromUnitId}\0${toUnitId}`;
    const existing = edgeAccum.get(key) ?? {
      fromUnitId,
      toUnitId,
      claimIds: [],
      edgeCount: 0,
    };
    existing.claimIds.push(claim.id);
    existing.edgeCount += 1;
    edgeAccum.set(key, existing);
  }

  const outbound = new Map();
  const inbound = new Map();
  const outboundEdgeCount = new Map();
  const inboundEdgeCount = new Map();

  for (const edge of edgeAccum.values()) {
    const outIds = outbound.get(edge.fromUnitId) ?? new Set();
    outIds.add(edge.toUnitId);
    outbound.set(edge.fromUnitId, outIds);
    outboundEdgeCount.set(
      edge.fromUnitId,
      (outboundEdgeCount.get(edge.fromUnitId) ?? 0) + edge.edgeCount,
    );

    const inIds = inbound.get(edge.toUnitId) ?? new Set();
    inIds.add(edge.fromUnitId);
    inbound.set(edge.toUnitId, inIds);
    inboundEdgeCount.set(
      edge.toUnitId,
      (inboundEdgeCount.get(edge.toUnitId) ?? 0) + edge.edgeCount,
    );
  }

  const units = [...membersByUnitId.keys()].sort().map((id) => ({
    id,
    memberElementIds: uniqueSorted(membersByUnitId.get(id) ?? []),
    outboundUnitIds: uniqueSorted([...(outbound.get(id) ?? [])]),
    inboundUnitIds: uniqueSorted([...(inbound.get(id) ?? [])]),
    outboundEdgeCount: outboundEdgeCount.get(id) ?? 0,
    inboundEdgeCount: inboundEdgeCount.get(id) ?? 0,
  }));

  const edges = [...edgeAccum.values()]
    .map((edge) => ({
      fromUnitId: edge.fromUnitId,
      toUnitId: edge.toUnitId,
      claimIds: uniqueSorted(edge.claimIds),
      edgeCount: edge.edgeCount,
    }))
    .sort((left, right) =>
      left.fromUnitId.localeCompare(right.fromUnitId) ||
      left.toUnitId.localeCompare(right.toUnitId));

  return {
    kind: "arch-units",
    grain,
    units,
    edges,
  };
}

function unitIdForElement(element, grain) {
  if (grain === "subsystem") return element.subsystemId ?? null;
  const file = lexMinEvidenceFile(element);
  if (!file) return null;
  return `module:${file}`;
}

// Module grain key: lexicographically smallest distinct file among evidence
// and implementationPath entries. Not a home/definition site — just a stable
// rollup that still works if an Element only carries implementationPath.
function lexMinEvidenceFile(element) {
  const files = new Set();
  for (const item of [...(element.evidence ?? []), ...(element.implementationPath ?? [])]) {
    if (item?.file) files.add(item.file);
  }
  if (!files.size) return null;
  return [...files].sort()[0];
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}
