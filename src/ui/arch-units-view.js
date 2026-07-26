// Arch units are a projection over Element→Element `depends_on` claims, not a
// derived architecture. Nothing here infers a dependency, ranks a unit, or
// names a layer: it shows the observed edges and says plainly when there are
// none. Unit ids are deterministic rollup keys, not designated homes — the
// module prefix is stripped for reading, never treated as a definition site.

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function unitDisplayName(unitId, subsystemsById = new Map()) {
  if (unitId.startsWith("module:")) return unitId.slice("module:".length);
  return subsystemsById.get(unitId)?.name ?? unitId;
}

export function unitSummaryLine(unit) {
  const members = unit.memberElementIds.length;
  const outbound = unit.outboundUnitIds.length;
  const inbound = unit.inboundUnitIds.length;
  return [
    `${members} ${members === 1 ? "part" : "parts"}`,
    outbound ? `depends on ${outbound}` : "depends on nothing",
    inbound ? `used by ${inbound}` : "used by nothing",
  ].join(" · ");
}

export function unitMatchesQuery(unit, query, subsystemsById, byId) {
  if (!query) return true;
  const needle = query.toLowerCase();
  const names = [
    unitDisplayName(unit.id, subsystemsById),
    ...unit.memberElementIds.map((id) => byId.get(id)?.name),
  ];
  return names.some((name) => name?.toLowerCase().includes(needle));
}
