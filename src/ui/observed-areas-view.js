// Pure Observed Areas presentation helpers. Keep identifiers from the
// projection; resolve recovered names only at render time.

export function areaPreviewClaims(operation, claimsById) {
  const ids = [
    ...operation.primaryEffectClaimIds,
    ...operation.outputClaimIds,
    ...operation.outcomeClaimIds,
  ];
  return ids.map((id) => claimsById.get(id)).filter(Boolean);
}

export function formatClaimSummary(claim, byId, relationLabel) {
  const target = claim.target.kind === "reference"
    ? byId.get(claim.target.id)?.name ?? claim.target.id
    : String(claim.target.value);
  return `${relationLabel(claim.relation)} ${target}`;
}

export function sharedCoreLabel(anchorElementIds, byId, { compact = false } = {}) {
  const ranked = [...anchorElementIds].sort((left, right) => {
    const leftKind = byId.get(left)?.kind ?? "";
    const rightKind = byId.get(right)?.kind ?? "";
    return kindRank(leftKind) - kindRank(rightKind) ||
      (byId.get(left)?.name ?? left).localeCompare(byId.get(right)?.name ?? right);
  });
  const names = ranked.map((id) => byId.get(id)?.name ?? id);
  if (!compact || names.length <= 3) return names.join(" + ");
  return `${names.slice(0, 2).join(" + ")} + ${names.length - 2} more`;
}

function kindRank(kind) {
  if (kind === "aggregate" || kind === "entity") return 0;
  if (kind === "artifact") return 1;
  if (kind === "state") return 2;
  return 3;
}

export function areaMatchesQuery(area, byId, envelopesById, coresById, query) {
  if (!query) return true;
  const names = [
    byId.get(area.anchorElementId)?.name,
    ...area.operations.map((item) => envelopesById.get(item.envelopeId)?.name),
    ...area.sharedCoreIds.flatMap((id) => (coresById.get(id)?.anchorElementIds ?? [])
      .map((elementId) => byId.get(elementId)?.name)),
  ];
  return names.some((name) => name?.toLowerCase().includes(query));
}

export function areaIsChanged(area, changedElements, changedClaims) {
  if (changedElements.has(area.anchorElementId)) return true;
  if (area.behaviorIds.some((id) => changedElements.has(id))) return true;
  if (area.claimIds.some((id) => changedClaims.has(id))) return true;
  return area.operations.some((operation) => operationIsChanged(operation, changedElements, changedClaims));
}

export function operationIsChanged(operation, changedElements, changedClaims) {
  if (changedElements.has(operation.entryBehaviorId)) return true;
  if (operation.behaviorIds.some((id) => changedElements.has(id))) return true;
  return operation.claimIds.some((id) => changedClaims.has(id));
}

export function coreIsChanged(core, changedElements, changedClaims) {
  if (core.anchorElementIds.some((id) => changedElements.has(id))) return true;
  if (core.behaviorIds.some((id) => changedElements.has(id))) return true;
  return core.claimIds.some((id) => changedClaims.has(id));
}

export function ungroupedMatchesQuery(item, envelopesById, query) {
  if (!query) return true;
  const name = envelopesById.get(item.envelopeId)?.name ?? "";
  return name.toLowerCase().includes(query);
}

export function collectChangedClaimIds(diff) {
  const ids = new Set();
  if (!diff) return ids;
  for (const item of diff.claims.added) ids.add(item.id);
  for (const item of diff.claims.removed) ids.add(item.id);
  for (const item of diff.claims.changed) ids.add(item.after.id);
  return ids;
}

export function renderObservedAreasOutline({
  projection,
  byId,
  envelopesById,
  claimsById,
  query,
  changesOnly,
  changedElements,
  changedClaims,
  expandedId,
  relationLabel,
  kindLabel,
  stateMark,
  changeBadge,
  pathStatus,
  claimRow,
  esc,
}) {
  const coresById = new Map(projection.sharedCores.map((item) => [item.id, item]));
  const areas = projection.areas.filter((area) =>
    areaMatchesQuery(area, byId, envelopesById, coresById, query) &&
    (!changesOnly || areaIsChanged(area, changedElements, changedClaims)));
  const cores = projection.sharedCores.filter((core) => {
    if (changesOnly && !coreIsChanged(core, changedElements, changedClaims)) return false;
    if (!query) return true;
    const names = [
      ...core.anchorElementIds.map((id) => byId.get(id)?.name),
      ...core.usedByAreaIds.map((id) => byId.get(projection.areas.find((area) => area.id === id)?.anchorElementId)?.name),
    ];
    return names.some((name) => name?.toLowerCase().includes(query));
  });
  const ungrouped = projection.ungrouped.filter((item) => {
    if (!ungroupedMatchesQuery(item, envelopesById, query)) return false;
    if (!changesOnly) return true;
    const envelope = envelopesById.get(item.envelopeId);
    if (!envelope) return false;
    return operationIsChanged({
      entryBehaviorId: envelope.entryBehaviorId,
      behaviorIds: envelope.behaviorIds ?? [],
      claimIds: [
        ...(envelope.primaryEffectClaimIds ?? []),
        ...(envelope.supportingEffectClaimIds ?? []),
        ...(envelope.outputClaimIds ?? []),
        ...(envelope.outcomeClaimIds ?? []),
        ...(envelope.conditionClaimIds ?? []),
        ...(envelope.unresolvedClaimIds ?? []),
      ],
    }, changedElements, changedClaims);
  });

  let html = `<h2 class="group-heading">Observed areas</h2>`;
  if (!areas.length && !ungrouped.length) {
    html += `<p class="empty-copy">${changesOnly ? "No observed areas changed since the last snapshot." : "No observed interaction areas were recovered."}</p>`;
  } else {
    html += areas.map((area) => renderArea(area, {
      byId, envelopesById, claimsById, coresById, expandedId, changedElements, changedClaims,
      relationLabel, kindLabel, stateMark, changeBadge, pathStatus, claimRow, esc,
    })).join("");
  }

  if (cores.length) {
    html += `<h2 class="group-heading">Shared system parts</h2>`;
    html += cores.map((core) => renderSharedCore(core, {
      projection, byId, envelopesById, claimsById, expandedId, changedElements, changedClaims,
      relationLabel, kindLabel, stateMark, changeBadge, pathStatus, claimRow, esc,
    })).join("");
  }

  if (ungrouped.length) {
    html += `<h2 class="group-heading">Not placed in an observed area</h2>`;
    html += ungrouped.map((item) => renderUngrouped(item, {
      byId, envelopesById, claimsById, expandedId, changedElements, changedClaims,
      relationLabel, stateMark, changeBadge, pathStatus, claimRow, esc,
    })).join("");
  }

  return {
    html,
    matchCount: areas.length + cores.length + ungrouped.length,
    changedAreaCount: projection.areas.filter((area) => areaIsChanged(area, changedElements, changedClaims)).length,
  };
}

function renderArea(area, ctx) {
  const {
    byId, envelopesById, claimsById, coresById, expandedId, changedElements, changedClaims,
    relationLabel, kindLabel, stateMark, changeBadge, pathStatus, claimRow, esc,
  } = ctx;
  const anchor = byId.get(area.anchorElementId);
  const open = expandedId === area.id;
  const changed = areaIsChanged(area, changedElements, changedClaims);
  const preview = area.operations.slice(0, 4).map((operation) => {
    const envelope = envelopesById.get(operation.envelopeId);
    const summaries = areaPreviewClaims(operation, claimsById)
      .slice(0, 2)
      .map((claim) => formatClaimSummary(claim, byId, relationLabel));
    return `<li class="area-op-preview${operationIsChanged(operation, changedElements, changedClaims) ? " changed" : ""}">` +
      `<span class="op-name">${esc(envelope?.name ?? operation.envelopeId)}</span>` +
      `<span class="op-effect">${esc(summaries.join(" · ") || "no primary effect or output recovered")}</span>` +
      `${pathStatus(operation.completeness)}</li>`;
  }).join("");

  const shared = area.sharedCoreIds.map((id) => {
    const core = coresById.get(id);
    if (!core) return "";
    const label = sharedCoreLabel(core.anchorElementIds, byId, { compact: true });
    return `<button class="core-link" data-expand="${esc(id)}" title="${esc(sharedCoreLabel(core.anchorElementIds, byId))}">${esc(label)}</button>`;
  }).join("");

  let detail = "";
  if (open) {
    detail = `<div class="card-detail area-detail">` +
      `<p class="reach">${esc(kindLabel(anchor?.kind ?? "surface"))} · ${area.operationCount} ${area.operationCount === 1 ? "operation" : "operations"}` +
      `${area.completeness === "partial" ? " · partial" : ""}</p>` +
      area.operations.map((operation) => renderOperation(operation, ctx)).join("") +
      (shared ? `<section class="area-shared"><h3>Uses shared system parts</h3><div class="core-links">${shared}</div></section>` : "") +
      `</div>`;
  }

  return `<article class="area-block${open ? " open" : ""}${changed ? " area-changed" : ""}">` +
    `<button class="area-head" data-expand="${esc(area.id)}" aria-expanded="${open}">` +
    `<span class="area-title"><strong>${esc(anchor?.name ?? area.anchorElementId)}</strong>` +
    `<small>${area.operationCount} ${area.operationCount === 1 ? "operation" : "operations"}` +
    `${area.completeness === "partial" ? " · partial" : ""}</small></span>` +
    `${changed ? changeBadge() : ""}` +
    `<span class="chevron">⌄</span></button>` +
    (open ? detail : `<ul class="area-preview">${preview}</ul>${shared ? `<div class="core-links landing">${shared}</div>` : ""}`) +
    `</article>`;
}

function renderOperation(operation, ctx) {
  const {
    byId, envelopesById, claimsById, changedElements, changedClaims,
    relationLabel, stateMark, changeBadge, pathStatus, claimRow, esc,
  } = ctx;
  const envelope = envelopesById.get(operation.envelopeId);
  const changed = operationIsChanged(operation, changedElements, changedClaims);
  const sections = [
    ["When", operation.conditionClaimIds],
    ["Changes", operation.primaryEffectClaimIds],
    ["Uses", operation.supportingEffectClaimIds],
    ["Produces", operation.outputClaimIds],
    ["May result", operation.outcomeClaimIds],
    ["Unresolved", operation.unresolvedClaimIds],
  ];
  const path = (envelope?.behaviorIds ?? operation.behaviorIds).map((id) => byId.get(id)?.name).filter(Boolean);
  return `<section class="behavior area-operation${changed ? " behavior-changed" : ""}">` +
    `<h3>${esc(envelope?.name ?? operation.envelopeId)}${changed ? changeBadge() : ""}${pathStatus(operation.completeness)}</h3>` +
    (path.length ? `<p class="reach">${esc(path.join(" → "))}</p>` : "") +
    sections.filter(([, ids]) => ids.length).map(([label, ids]) =>
      `<section class="envelope-section"><h3>${label}</h3>` +
      ids.map((id) => claimsById.get(id)).filter(Boolean).map((claim) => claimRow(claim, byId)).join("") +
      `</section>`).join("") +
    `</section>`;
}

function renderSharedCore(core, ctx) {
  const {
    projection, byId, envelopesById, claimsById, expandedId, changedElements, changedClaims,
    changeBadge, pathStatus, claimRow, esc,
  } = ctx;
  const open = expandedId === core.id;
  const changed = coreIsChanged(core, changedElements, changedClaims);
  const label = sharedCoreLabel(core.anchorElementIds, byId, { compact: !open });
  const fullLabel = sharedCoreLabel(core.anchorElementIds, byId);
  const usedBy = core.usedByAreaIds.map((areaId) => {
    const area = projection.areas.find((item) => item.id === areaId);
    const name = byId.get(area?.anchorElementId)?.name ?? areaId;
    return `<button class="core-link" data-expand="${esc(areaId)}">${esc(name)}</button>`;
  }).join("");
  let detail = "";
  if (open) {
    const operations = core.envelopeIds
      .map((id) => envelopesById.get(id))
      .filter(Boolean)
      .map((envelope) => {
        const claimIds = [
          ...(envelope.primaryEffectClaimIds ?? []),
          ...(envelope.outputClaimIds ?? []),
          ...(envelope.outcomeClaimIds ?? []),
        ];
        return `<section class="behavior">` +
          `<h3>${esc(envelope.name)}${pathStatus(envelope.completeness)}</h3>` +
          claimIds.map((id) => claimsById.get(id)).filter(Boolean).map((claim) => claimRow(claim, byId)).join("") +
          `</section>`;
      }).join("");
    detail = `<div class="card-detail">` +
      `<p class="reach">Shared across independent observed areas · not a merged parent</p>` +
      `<p class="reach">${esc(fullLabel)}</p>` +
      `<section class="area-shared"><h3>Used by</h3><div class="core-links">${usedBy || `<p class="empty-copy">No leaf areas currently reference this core.</p>`}</div></section>` +
      operations +
      `</div>`;
  }
  return `<article class="area-block core-block${open ? " open" : ""}${changed ? " area-changed" : ""}">` +
    `<button class="area-head" data-expand="${esc(core.id)}" aria-expanded="${open}" title="${esc(fullLabel)}">` +
    `<span class="area-title"><strong>${esc(label)}</strong><small>shared system part · used by ${core.usedByAreaIds.length}</small></span>` +
    `${changed ? changeBadge() : ""}` +
    `<span class="chevron">⌄</span></button>` +
    (open ? detail : `<div class="core-links landing">${usedBy}</div>`) +
    `</article>`;
}

function renderUngrouped(item, ctx) {
  const {
    byId, envelopesById, claimsById, expandedId, changedElements, changedClaims,
    changeBadge, pathStatus, claimRow, esc,
  } = ctx;
  const envelope = envelopesById.get(item.envelopeId);
  const open = expandedId === item.envelopeId;
  const operation = {
    entryBehaviorId: envelope?.entryBehaviorId,
    behaviorIds: envelope?.behaviorIds ?? [],
    claimIds: [
      ...(envelope?.primaryEffectClaimIds ?? []),
      ...(envelope?.outputClaimIds ?? []),
      ...(envelope?.outcomeClaimIds ?? []),
      ...(envelope?.conditionClaimIds ?? []),
      ...(envelope?.unresolvedClaimIds ?? []),
    ],
  };
  const changed = operationIsChanged(operation, changedElements, changedClaims);
  let detail = "";
  if (open && envelope) {
    const claimIds = operation.claimIds;
    detail = `<div class="card-detail">` +
      `<p class="reach">${esc(reasonLabel(item.reason))}</p>` +
      claimIds.map((id) => claimsById.get(id)).filter(Boolean).map((claim) => claimRow(claim, byId)).join("") +
      `</div>`;
  }
  return `<article class="area-block${open ? " open" : ""}${changed ? " area-changed" : ""}">` +
    `<button class="area-head" data-expand="${esc(item.envelopeId)}" aria-expanded="${open}">` +
    `<span class="area-title"><strong>${esc(envelope?.name ?? item.envelopeId)}</strong>` +
    `<small>${esc(reasonLabel(item.reason))}</small></span>` +
    `${changed ? changeBadge() : ""}${pathStatus(envelope?.completeness)}` +
    `<span class="chevron">⌄</span></button>${detail}</article>`;
}

function reasonLabel(reason) {
  if (reason === "interaction-context-has-one-envelope") return "only one operation under its interaction context";
  if (reason === "no-supported-interaction-context") return "no supported screen or panel context";
  return reason;
}
