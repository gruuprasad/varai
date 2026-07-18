import { lensLabel, DEFAULT_LENS_REGISTRY } from "../system-model/lenses.js";

const RELATION_LABELS = Object.freeze({
  contains: "contains",
  exposes: "exposes",
  offers: "offers",
  triggered_by: "is triggered by",
  invokes: "invokes",
  accepts: "accepts",
  produces: "produces",
  requires: "requires",
  available_when: "is available when",
  reads: "reads",
  changes: "changes",
  creates: "creates",
  removes: "removes",
  succeeds_with: "succeeds with",
  fails_with: "fails with",
  navigates_to: "navigates to",
  emits: "emits",
  has_field: "has field",
  relates_to: "relates to",
  stored_in: "is stored in",
});

function evidenceLabel(evidence) {
  const values = (evidence ?? []).map((item) => {
    const location = `${item.file}${item.line ? `:${item.line}` : ""}`;
    if (item.symbol) return `${location} (${item.symbol})`;
    if (item.manifestKey) return `${location} (${item.manifestKey})`;
    return location;
  });
  return values.length ? values.join(", ") : "no direct evidence";
}

function qualifierLabel(qualifiers) {
  const entries = Object.entries(qualifiers ?? {});
  if (!entries.length) return "";
  return ` (${entries.map(([key, value]) => `${key.replaceAll("_", " ")}: ${Array.isArray(value) ? value.join(", ") : value}`).join("; ")})`;
}

function targetLabel(target, byId) {
  if (target.kind === "reference") return byId.get(target.id)?.name ?? target.id;
  return String(target.value);
}

function claimSentence(claim, sourceName, byId) {
  const confidence = claim.claimState === "observed" ? "" : ` [${claim.claimState}]`;
  let target = targetLabel(claim.target, byId);
  if (claim.relation === "offers" && target.startsWith(`${sourceName} `)) target = target.slice(sourceName.length + 1);
  return `${sourceName} ${RELATION_LABELS[claim.relation] ?? claim.relation} ${target}${qualifierLabel(claim.qualifiers)}.${confidence}`;
}

export function renderSystemModel({ model, lensRegistry = DEFAULT_LENS_REGISTRY }) {
  const lines = [`# ${model.system.name}`, "", "## System overview", ""];
  const lensOrder = new Map([...lensRegistry.keys()].map((id, index) => [id, index]));
  const subsystems = [...model.subsystems].sort((a, b) =>
    (lensOrder.get(a.lens) ?? 999) - (lensOrder.get(b.lens) ?? 999) || a.name.localeCompare(b.name));
  const elementsBySubsystem = new Map(subsystems.map((item) => [item.id, []]));
  for (const element of model.elements) elementsBySubsystem.get(element.subsystemId)?.push(element);
  for (const elements of elementsBySubsystem.values()) {
    elements.sort((a, b) => Number(b.roles.includes("interface")) - Number(a.roles.includes("interface")) || a.name.localeCompare(b.name));
  }

  if (!subsystems.length) {
    lines.push("No supported system-level elements were recovered.", "");
  } else {
    for (const subsystem of subsystems) {
      const count = elementsBySubsystem.get(subsystem.id)?.length ?? 0;
      lines.push(`- ${lensLabel(lensRegistry, subsystem.lens)}: ${count} ${count === 1 ? "element" : "elements"}`);
    }
    lines.push("");
  }

  const byId = new Map([
    [model.system.id, model.system],
    ...model.subsystems.map((item) => [item.id, item]),
    ...model.elements.map((item) => [item.id, item]),
  ]);
  const claimsBySource = new Map();
  for (const claim of model.claims) {
    const list = claimsBySource.get(claim.sourceId) ?? [];
    list.push(claim);
    claimsBySource.set(claim.sourceId, list);
  }

  for (const subsystem of subsystems) {
    const elements = elementsBySubsystem.get(subsystem.id) ?? [];
    if (!elements.length) continue;
    lines.push(`## ${lensLabel(lensRegistry, subsystem.lens)}`, "");
    for (const element of elements) {
      const roleText = element.roles.length ? ` · ${element.roles.join(", ")}` : "";
      lines.push(`### ${element.name}`, "", `_${element.kind}${roleText}_`, "");
      const claims = claimsBySource.get(element.id) ?? [];
      if (!claims.length) lines.push("- No additional behavior claims recovered.");
      for (const claim of claims) {
        lines.push(`- ${claimSentence(claim, element.name, byId)} — ${evidenceLabel(claim.evidence)}`);
      }
      lines.push(`- Evidence: ${evidenceLabel(element.evidence)}`, "");
    }
  }

  lines.push("## Analyzer coverage", "");
  if (!model.coverage.length) {
    lines.push("No semantic analyzer coverage was declared.", "");
  } else {
    const coverage = [...model.coverage].sort((a, b) => {
      const aScope = byId.get(a.scopeId)?.name ?? a.scopeId;
      const bScope = byId.get(b.scopeId)?.name ?? b.scopeId;
      return aScope.localeCompare(bScope) || a.capability.localeCompare(b.capability);
    });
    for (const item of coverage) {
      const scope = byId.get(item.scopeId)?.name ?? item.scopeId;
      const detail = item.details.length ? ` — ${item.details.join("; ")}` : "";
      lines.push(`- ${item.capability} (${scope}): **${item.state}**${detail}`);
    }
    lines.push("");
  }

  if (model.diagnostics.length) {
    lines.push("## Analysis diagnostics", "");
    for (const item of model.diagnostics) lines.push(`- **${item.severity}** ${item.message} — ${evidenceLabel(item.evidence)}`);
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
