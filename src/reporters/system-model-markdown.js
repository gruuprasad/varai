import { browseByThing, browseByCapability } from "../system-model/projections/index.js";
import { RELATION_LABELS, claimStateLabel, kindLabel } from "./display-language.js";

function evidenceLabel(evidence) {
  const values = (evidence ?? []).map((item) => {
    const location = `${item.file}${item.line ? `:${item.line}` : ""}`;
    return item.symbol ? `${location} (${item.symbol})` : item.manifestKey ? `${location} (${item.manifestKey})` : location;
  });
  return values.length ? values.join(", ") : "no direct evidence";
}

function targetLabel(target, byId) {
  return target.kind === "reference" ? byId.get(target.id)?.name ?? target.id : String(target.value);
}

function qualifierLabel(qualifiers) {
  const entries = Object.entries(qualifiers ?? {});
  return entries.length ? ` (${entries.map(([key, value]) => `${key.replaceAll("_", " ")}: ${Array.isArray(value) ? value.join(", ") : value}`).join("; ")})` : "";
}

function claimSentence(claim, sourceName, byId) {
  const stateLabel = claimStateLabel(claim.claimState);
  const confidence = stateLabel ? ` [${stateLabel}]` : "";
  let target = targetLabel(claim.target, byId);
  if (claim.relation === "offers" && target.startsWith(`${sourceName} `)) target = target.slice(sourceName.length + 1);
  return `${sourceName} ${RELATION_LABELS[claim.relation] ?? claim.relation} ${target}${qualifierLabel(claim.qualifiers)}.${confidence}`;
}

function pathLabel(path) {
  return (path ?? []).map((item) => `${item.symbol ? `${item.symbol} — ` : ""}${item.file}${item.line ? `:${item.line}` : ""}`).join(" → ");
}

export function renderSystemModel({ model }) {
  const thingView = browseByThing(model);
  const capabilityView = browseByCapability(model);
  const byId = new Map([
    [model.system.id, model.system],
    ...model.subsystems.map((item) => [item.id, item]),
    ...model.elements.map((item) => [item.id, item]),
    ...model.claims.map((item) => [item.id, item]),
  ]);
  const claimsBySource = new Map();
  for (const claim of model.claims) {
    const list = claimsBySource.get(claim.sourceId) ?? [];
    list.push(claim);
    claimsBySource.set(claim.sourceId, list);
  }

  const subjects = thingView.roots.filter((root) => root.tier === 0);
  const screens = thingView.roots.filter((root) => root.tier === 1 && byId.get(root.elementId)?.kind === "screen");
  const unplaced = thingView.roots.filter((root) => root.tier === 1 && byId.get(root.elementId)?.kind === "surface");
  const detail = thingView.roots.filter((root) => root.tier === 2);

  function behaviorLines(root, lines, indent = "") {
    if (!root.behaviorIds.length) lines.push(`${indent}- No connected behavior recovered within current coverage.`);
    for (const behaviorId of root.behaviorIds) {
      const behavior = byId.get(behaviorId);
      if (!behavior) continue;
      const interfaces = root.interfaceIds.map((id) => byId.get(id)).filter(Boolean)
        .filter((item) => item.id === behavior.id ||
          (claimsBySource.get(item.id) ?? []).some((claim) => claim.relation === "offers" && claim.target.id === behavior.id));
      lines.push(`${indent}- **${behavior.name}**${interfaces.length ? ` — reached through ${interfaces.map((item) => item.name).join(", ")}` : ""}`);
      for (const claim of claimsBySource.get(behavior.id) ?? []) {
        lines.push(`${indent}  - ${claimSentence(claim, behavior.name, byId)} — ${evidenceLabel(claim.evidence)}`);
        const trace = pathLabel(claim.implementationPath);
        if (trace) lines.push(`${indent}    - Implementation: ${trace}`);
      }
    }
  }

  const lines = [
    `# ${model.system.name}`,
    "",
    `${subjects.length} subjects · ${screens.length} screens · ${capabilityView.capabilities.length} observed behaviors`,
    "",
    "## Subjects",
    "",
  ];

  if (!subjects.length) lines.push("No system subjects were recovered.", "");
  for (const root of subjects) {
    const element = byId.get(root.elementId);
    lines.push(`### ${element.name}`, "", `_${kindLabel(element.kind)}_`, "");
    behaviorLines(root, lines);
    lines.push(`- Evidence: ${evidenceLabel(element.evidence)}`, "");
  }

  lines.push("## Screens", "");
  if (!screens.length) lines.push("No screens were recovered.", "");
  for (const root of screens) {
    const element = byId.get(root.elementId);
    lines.push(`### ${element.name}`, "");
    for (const surfaceId of root.surfaceIds) {
      const surface = byId.get(surfaceId);
      if (!surface) continue;
      lines.push(`- **${surface.name}** (${kindLabel(surface.kind)})`);
      for (const claim of claimsBySource.get(surfaceId) ?? []) {
        if (claim.relation !== "offers" || claim.target.kind !== "reference") continue;
        const action = byId.get(claim.target.id);
        if (action) lines.push(`  - offers ${action.name}`);
      }
    }
    if (!root.surfaceIds.length) lines.push("- No panels were resolved into this screen.");
    lines.push("");
  }
  if (unplaced.length) {
    lines.push("### Not placed on a screen", "");
    for (const root of unplaced) {
      const element = byId.get(root.elementId);
      lines.push(`- **${element.name}** (${kindLabel(element.kind)}) — render chain unresolved`);
      behaviorLines(root, lines, "  ");
    }
    lines.push("");
  }

  if (detail.length) {
    lines.push(`_${detail.length} further elements (data contracts, UI state, internal records) are available through structured model output and dashboard search._`, "");
  }

  lines.push("## Capabilities", "");
  for (const item of capabilityView.capabilities) {
    const behavior = byId.get(item.behaviorId);
    if (!behavior) continue;
    const resources = item.resourceIds.map((id) => byId.get(id)?.name).filter(Boolean);
    const interfaces = item.interfaceIds.map((id) => byId.get(id)?.name).filter(Boolean);
    lines.push(`- **${behavior.name}**${resources.length ? ` — acts on ${resources.join(", ")}` : ""}${interfaces.length ? ` — via ${interfaces.join(", ")}` : ""}`);
  }
  if (!capabilityView.capabilities.length) lines.push("No supported behaviors were recovered.");
  lines.push("", "## What varai couldn't determine", "");

  if (!model.coverage.length) lines.push("Nothing was declared out of reach.", "");
  else for (const item of model.coverage) {
    const scope = byId.get(item.scopeId)?.name ?? item.scopeId;
    const detailText = item.details.length ? ` — ${item.details.join("; ")}` : "";
    lines.push(`- ${item.capability} (${scope}): **${item.state}**${detailText}`);
  }

  if (model.diagnostics.length) {
    lines.push("", "## Analysis diagnostics", "");
    for (const item of model.diagnostics) lines.push(`- **${item.severity}** ${item.message} — ${evidenceLabel(item.evidence)}`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
