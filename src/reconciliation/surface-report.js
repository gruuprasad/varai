// Text helpers for the surfaces section of a check report.

function formatElement(item, elementNames) {
  if (item.name) return item.name;
  if (item.key) return item.key;
  if (item.elementId) return elementNames.get(item.elementId) ?? item.elementId;
  return item.surfaceId ?? "?";
}

export function renderSurfacesSection(surfaces, { model } = {}) {
  if (!surfaces) return "";
  const lines = [];
  const elementNames = new Map((model?.elements ?? []).map((element) => [element.id, element.name]));

  if (surfaces.state === "cannot_account") {
    lines.push("Public surfaces — cannot account (no closed surface set in this spec)");
    if (surfaces.reason === "seed-surfaces-absent") {
      lines.push("    this spec format has no surfaces array; completeness is not claimed");
    }
    return `${lines.join("\n")}\n`;
  }

  lines.push("Public surfaces");
  if (!surfaces.expected.length && !surfaces.unaccounted.length
    && !surfaces.missing.length && !surfaces.ambiguous.length && !surfaces.stale.length) {
    lines.push("    none expected, none observed");
  }

  for (const item of surfaces.accounted ?? []) {
    lines.push(`    accounted  ${item.surfaceId} -> ${formatElement(item, elementNames)}`);
  }
  for (const item of surfaces.missing ?? []) {
    lines.push(`    missing  ${item.surfaceId}${item.reason ? ` (${item.reason})` : ""}`);
  }
  for (const item of surfaces.unaccounted ?? []) {
    lines.push(`    unaccounted  ${formatElement(item, elementNames)}`);
  }
  for (const item of surfaces.ambiguous ?? []) {
    lines.push(`    ambiguous  ${item.surfaceId ?? item.bindingId}${item.reason ? ` (${item.reason})` : ""}`);
  }
  for (const item of surfaces.stale ?? []) {
    lines.push(`    stale  ${item.surfaceId}${item.reason ? ` (${item.reason})` : ""}`);
  }

  const summary = [
    `${surfaces.expected?.length ?? 0} expected,`,
    `${surfaces.accounted?.length ?? 0} accounted,`,
    `${surfaces.missing?.length ?? 0} missing,`,
    `${surfaces.unaccounted?.length ?? 0} unaccounted,`,
    `${surfaces.ambiguous?.length ?? 0} ambiguous,`,
    `${surfaces.stale?.length ?? 0} stale`,
  ].join(" ");
  lines.push(`    ${summary}`);
  return `${lines.join("\n")}\n`;
}
