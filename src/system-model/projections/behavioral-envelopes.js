import { validateSystemModel } from "../validate.js";
import { behaviorFrames } from "./behavior-frames.js";
import { systemPaths } from "./system-paths.js";
import { indexModel } from "./shared.js";

const MUTATION_RELATIONS = new Set(["changes", "creates", "removes"]);
const NON_SUBJECT_KINDS = new Set(["contract"]);

export function behavioralEnvelopes(model) {
  validateSystemModel(model);
  const index = indexModel(model);
  const claims = new Map(model.claims.map((claim) => [claim.id, claim]));
  const frameView = behaviorFrames(model);
  const pathView = systemPaths(model);
  const frames = new Map(frameView.frames.map((frame) => [frame.behaviorId, frame]));

  const pathsByEntry = new Map();
  for (const path of pathView.paths) {
    const values = pathsByEntry.get(path.entryBehaviorId) ?? [];
    values.push(path);
    pathsByEntry.set(path.entryBehaviorId, values);
  }
  const envelopes = [...pathsByEntry.values()].map((paths) => assemble(paths, frames, index, claims));
  envelopes.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return {
    kind: "behavioral-envelopes",
    envelopes,
    diagnostics: [...frameView.diagnostics, ...pathView.diagnostics]
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
}

function assemble(paths, frames, index, claims) {
  paths.sort((a, b) => pathEvidenceKey(a, claims).localeCompare(pathEvidenceKey(b, claims)) || a.id.localeCompare(b.id));
  const path = paths[0];
  const reachedBehaviorIds = uniqueInOrder(paths.flatMap((item) => item.steps.slice(1).map((step) => step.behaviorId)));
  const behaviorIds = [path.entryBehaviorId, ...reachedBehaviorIds];
  const entry = frames.get(path.entryBehaviorId);
  const terminals = uniqueSorted(paths.map((item) => item.terminalBehaviorId))
    .map((id) => frames.get(id)).filter(Boolean);
  const invocationClaimIds = uniqueInOrder(paths.flatMap((item) => item.steps.map((step) => step.viaClaimId).filter(Boolean)));
  const triggerClaimIds = sorted(entry?.triggerClaimIds);
  const conditionClaimIds = uniqueSorted([...(entry?.conditionClaimIds ?? []), ...terminals.flatMap((frame) => frame.conditionClaimIds)]);
  const inputClaimIds = uniqueSorted(terminals.flatMap((frame) => frame.inputClaimIds));
  const outputClaimIds = uniqueSorted(terminals.flatMap((frame) => frame.outputClaimIds));
  // UI completion (for example navigation after a successful form submit)
  // belongs to the entry behavior, while API failures and responses belong to
  // terminal behaviors. An envelope represents both ends of that observation.
  const outcomeClaimIds = uniqueSorted([...(entry?.outcomeClaimIds ?? []), ...terminals.flatMap((frame) => frame.outcomeClaimIds)]);
  const terminalEffects = uniqueSorted(terminals.flatMap((frame) => frame.effectClaimIds)).map((id) => claims.get(id)).filter(Boolean);
  const primaryEffects = terminalEffects.filter((claim) =>
    MUTATION_RELATIONS.has(claim.relation) && claim.target.kind === "reference");
  const supportingEffects = terminalEffects.filter((claim) => claim.relation === "reads");
  const unresolved = terminalEffects.filter((claim) => claim.target.kind !== "reference");
  const primarySubjectIds = referencedTargets(primaryEffects, index, true);
  const supportingResourceIds = referencedTargets(supportingEffects, index, false)
    .filter((id) => !primarySubjectIds.includes(id));
  const selectedClaimIds = uniqueSorted([
    ...triggerClaimIds, ...conditionClaimIds, ...inputClaimIds, ...invocationClaimIds,
    ...primaryEffects.map((claim) => claim.id), ...supportingEffects.map((claim) => claim.id),
    ...outputClaimIds, ...outcomeClaimIds, ...unresolved.map((claim) => claim.id),
  ]);
  const completenessReasons = reasons({
    entry, terminals, invocationClaimIds, primarySubjectIds, outcomeClaimIds, unresolved,
  });

  return {
    id: `envelope:${path.entryBehaviorId}`,
    name: path.name,
    entryBehaviorId: path.entryBehaviorId,
    terminalBehaviorId: terminals.length === 1 ? paths[0].terminalBehaviorId : null,
    terminalBehaviorIds: uniqueSorted(paths.map((item) => item.terminalBehaviorId)),
    behaviorIds,
    interfaceIds: uniqueSorted(paths.flatMap((item) => item.interfaceIds)),
    triggerClaimIds,
    conditionClaimIds,
    inputClaimIds,
    invocationClaimIds,
    primaryEffectClaimIds: primaryEffects.map((claim) => claim.id).sort(),
    supportingEffectClaimIds: supportingEffects.map((claim) => claim.id).sort(),
    outputClaimIds,
    outcomeClaimIds,
    primarySubjectIds,
    supportingResourceIds,
    unresolvedClaimIds: uniqueSorted(unresolved.map((claim) => claim.id)),
    implementationEvidence: collectEvidence(selectedClaimIds, claims),
    completeness: completenessOf({ terminals, invocationClaimIds, primarySubjectIds, outcomeClaimIds, unresolved }),
    completenessReasons,
  };
}

function referencedTargets(claims, index, primary) {
  return uniqueSorted(claims.flatMap((claim) => {
    if (claim.target.kind !== "reference") return [];
    const target = index.elements.get(claim.target.id);
    if (!target?.roles.includes("resource")) return [];
    if (primary && NON_SUBJECT_KINDS.has(target.kind)) return [];
    return [target.id];
  }));
}

function completenessOf({ terminals, invocationClaimIds, primarySubjectIds, outcomeClaimIds, unresolved }) {
  if (!terminals.length || !invocationClaimIds.length || (!primarySubjectIds.length && !outcomeClaimIds.length)) return "open";
  if (unresolved.length) return "partial";
  return "closed";
}

function reasons({ entry, terminals, invocationClaimIds, primarySubjectIds, outcomeClaimIds, unresolved }) {
  const result = [];
  if (!entry?.triggerClaimIds.length) result.push("missing-trigger");
  if (primarySubjectIds.length) result.push("resolved-primary-effect");
  if (outcomeClaimIds.length) result.push("resolved-outcome");
  if (unresolved.length) result.push("unresolved-effect");
  if (!terminals.length || !invocationClaimIds.length || (!primarySubjectIds.length && !outcomeClaimIds.length)) {
    result.push("missing-terminal-effect-or-outcome");
  }
  return result.sort();
}

function collectEvidence(claimIds, claims) {
  const values = new Map();
  for (const id of claimIds) {
    const claim = claims.get(id);
    for (const item of [...(claim?.evidence ?? []), ...(claim?.implementationPath ?? [])]) {
      const key = JSON.stringify(item);
      values.set(key, item);
    }
  }
  return [...values.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function sorted(values = []) { return [...values].sort(); }
function uniqueSorted(values) { return [...new Set(values)].sort(); }
function uniqueInOrder(values) { return [...new Set(values)]; }

function pathEvidenceKey(path, claims) {
  const firstInvocation = path.steps.find((step) => step.viaClaimId)?.viaClaimId;
  const evidence = claims.get(firstInvocation)?.evidence?.[0] ?? {};
  return `${evidence.file ?? ""}:${String(evidence.line ?? 0).padStart(10, "0")}`;
}
