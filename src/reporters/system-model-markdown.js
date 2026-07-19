import { browseByThing, browseByCapability } from "../system-model/projections/index.js";

const RELATION_LABELS = Object.freeze({
  contains: "contains", exposes: "exposes", offers: "offers", triggered_by: "is triggered by", invokes: "invokes",
  accepts: "accepts", produces: "produces", requires: "requires", available_when: "is available when", reads: "reads",
  changes: "changes", creates: "creates", removes: "removes", succeeds_with: "succeeds with", fails_with: "fails with",
  navigates_to: "navigates to", emits: "emits", has_field: "has field", relates_to: "relates to", stored_in: "is stored in",
});

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
  const confidence = claim.claimState === "observed" ? "" : ` [${claim.claimState}]`;
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

  const lines = [
    `# ${model.system.name}`,
    "",
    "## System overview",
    "",
    `- ${thingView.roots.length} system subjects and surfaces`,
    `- ${capabilityView.capabilities.length} behaviors`,
    `- ${model.elements.length} total semantic elements · ${model.claims.length} claims`,
    "",
    "## Browse by thing",
    "",
  ];

  if (!thingView.roots.length) lines.push("No supported system-level subjects or surfaces were recovered.", "");
  const renderedRoots = thingView.roots.slice(0, 24);
  for (const root of renderedRoots) {
    const element = byId.get(root.elementId);
    lines.push(`### ${element.name}`, "", `_${element.kind} · ${element.roles.join(", ")}_`, "");
    if (!root.behaviorIds.length) lines.push("- No connected behavior recovered within current coverage.");
    for (const behaviorId of root.behaviorIds) {
      const behavior = byId.get(behaviorId);
      const interfaces = root.interfaceIds.map((id) => byId.get(id)).filter(Boolean)
        .filter((item) => item.id === behavior.id || (claimsBySource.get(item.id) ?? []).some((claim) => claim.relation === "offers" && claim.target.id === behavior.id));
      lines.push(`- **${behavior.name}**${interfaces.length ? ` — reached through ${interfaces.map((item) => item.name).join(", ")}` : ""}`);
      for (const claim of claimsBySource.get(behavior.id) ?? []) {
        lines.push(`  - ${claimSentence(claim, behavior.name, byId)} — ${evidenceLabel(claim.evidence)}`);
        const trace = pathLabel(claim.implementationPath);
        if (trace) lines.push(`    - Implementation: ${trace}`);
      }
    }
    for (const claim of claimsBySource.get(element.id) ?? []) {
      if (claim.relation === "offers") lines.push(`- ${claimSentence(claim, element.name, byId)} — ${evidenceLabel(claim.evidence)}`);
    }
    lines.push(`- Evidence: ${evidenceLabel(element.evidence)}`, "");
  }
  if (thingView.roots.length > renderedRoots.length) {
    lines.push(`_${thingView.roots.length - renderedRoots.length} additional Resources and surfaces remain available through structured model output and dashboard search._`, "");
  }

  lines.push("## Browse by capability", "");
  for (const item of capabilityView.capabilities) {
    const behavior = byId.get(item.behaviorId);
    const resources = item.resourceIds.map((id) => byId.get(id)?.name).filter(Boolean);
    const interfaces = item.interfaceIds.map((id) => byId.get(id)?.name).filter(Boolean);
    lines.push(`- **${behavior.name}**${resources.length ? ` — acts on ${resources.join(", ")}` : ""}${interfaces.length ? ` — via ${interfaces.join(", ")}` : ""}`);
  }
  if (!capabilityView.capabilities.length) lines.push("No supported behaviors were recovered.");
  lines.push("", "## Analyzer coverage", "");

  if (!model.coverage.length) lines.push("No semantic analyzer coverage was declared.", "");
  else for (const item of model.coverage) {
    const scope = byId.get(item.scopeId)?.name ?? item.scopeId;
    const detail = item.details.length ? ` — ${item.details.join("; ")}` : "";
    lines.push(`- ${item.capability} (${scope}): **${item.state}**${detail}`);
  }

  if (model.diagnostics.length) {
    lines.push("", "## Analysis diagnostics", "");
    for (const item of model.diagnostics) lines.push(`- **${item.severity}** ${item.message} — ${evidenceLabel(item.evidence)}`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
