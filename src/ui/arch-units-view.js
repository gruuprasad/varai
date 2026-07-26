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

// Coverage is stated, never implied. An empty graph on a non-Python repository
// means "not looked for", not "no dependencies" — the UI must not let those
// read the same.
export function archUnitsNotice(projection) {
  if (projection.edges.length) return "";
  return "No dependencies were observed. Dependency extraction currently reads Python imports only, " +
    "so a repository in another language shows units without edges.";
}

export function renderArchUnitsOutline({ projection, subsystemsById, byId, query, expandedId, changedElements }) {
  const name = (unitId) => unitDisplayName(unitId, subsystemsById);
  const units = projection.units.filter((unit) => unitMatchesQuery(unit, query, subsystemsById, byId));

  const masterHtml = units.length
    ? units.map((unit) => {
      const selected = expandedId === unit.id;
      const changed = unit.memberElementIds.some((id) => changedElements.has(id));
      return `<article class="card${selected ? " selected open" : ""}">` +
        `<button class="card-head" data-expand="${esc(unit.id)}" aria-expanded="${selected}">` +
        `<span class="card-title"><strong>${esc(name(unit.id))}</strong>` +
        `<small>${esc(unitSummaryLine(unit))}</small></span>` +
        `${changed ? `<span class="change-badge">changed</span>` : ""}` +
        `<span class="chevron">›</span></button></article>`;
    }).join("")
    : `<div class="empty-state"><span class="empty-text">` +
      `${esc(query ? "No unit matches this search." : "No architectural units were observed in this repository.")}` +
      `</span></div>`;

  const unit = projection.units.find((item) => item.id === expandedId);
  return { masterHtml, detailHtml: unit ? unitDetail(unit, projection, name, byId) : "", matchCount: units.length };
}

function unitDetail(unit, projection, name, byId) {
  const edgeCount = (fromUnitId, toUnitId) => projection.edges
    .find((edge) => edge.fromUnitId === fromUnitId && edge.toUnitId === toUnitId)?.edgeCount ?? 0;

  const edgeList = (unitIds, countFor) => `<ul class="unit-edges">` + unitIds.map((id) => {
    const count = countFor(id);
    return `<li><span class="unit-edge-name">${esc(name(id))}</span>` +
      `<span class="unit-edge-count">${count} ${count === 1 ? "reference" : "references"}</span></li>`;
  }).join("") + `</ul>`;

  const sections = [];
  if (unit.outboundUnitIds.length) {
    sections.push(`<section class="detail-section"><h2>Depends on</h2>` +
      edgeList(unit.outboundUnitIds, (id) => edgeCount(unit.id, id)) + `</section>`);
  }
  if (unit.inboundUnitIds.length) {
    sections.push(`<section class="detail-section"><h2>Used by</h2>` +
      edgeList(unit.inboundUnitIds, (id) => edgeCount(id, unit.id)) + `</section>`);
  }
  if (!sections.length) {
    sections.push(`<section class="detail-section">` +
      `<p class="empty-copy">No dependencies were observed for this unit, in either direction.</p></section>`);
  }

  const members = unit.memberElementIds.map((id) => byId.get(id)).filter(Boolean);
  sections.push(`<section class="detail-section"><h2>Parts</h2>` +
    (members.length
      ? `<ul class="unit-members">` + members.map((member) =>
        `<li><strong>${esc(member.name)}</strong><small>${esc(member.kind ?? "")}</small></li>`).join("") + `</ul>`
      : `<p class="empty-copy">No resolved parts.</p>`) +
    `</section>`);

  return `<div class="detail-content">` +
    `<header class="detail-header"><div class="detail-title-wrap">` +
    `<h1 class="detail-title">${esc(name(unit.id))}</h1>` +
    `<span class="detail-role">Architectural unit</span>` +
    `</div></header>` + sections.join("") + `</div>`;
}
