import { validateSystemModel } from "../validate.js";
import { behavioralEnvelopes } from "./behavioral-envelopes.js";
import { semanticRegionCandidates } from "./semantic-region-candidates.js";
import { systemPaths } from "./system-paths.js";

// Presentation projection over semantic-region candidates and behavioral
// envelopes. Identifiers and derived grouping only — no copied semantic facts
// and no invented area names.
export function observedAreas(model) {
  validateSystemModel(model);
  const regionView = semanticRegionCandidates(model);
  const envelopeView = behavioralEnvelopes(model);
  const pathView = systemPaths(model);
  const claims = new Map(model.claims.map((item) => [item.id, item]));
  const elements = new Map(model.elements.map((item) => [item.id, item]));
  const envelopes = new Map(envelopeView.envelopes.map((item) => [item.id, item]));
  const pathsByEntry = new Map();
  for (const path of pathView.paths) {
    const values = pathsByEntry.get(path.entryBehaviorId) ?? [];
    values.push(path.id);
    pathsByEntry.set(path.entryBehaviorId, values);
  }

  const interaction = regionView.regions.filter((item) => item.basis === "interaction-context");
  const cores = regionView.regions.filter((item) => item.basis === "shared-resource-core");
  const interactionById = new Map(interaction.map((item) => [item.id, item]));
  const childEnvelopeIdsByParent = new Map();
  for (const relationship of regionView.relationships) {
    if (relationship.relation !== "contains") continue;
    if (!interactionById.has(relationship.sourceRegionId) || !interactionById.has(relationship.targetRegionId)) continue;
    const values = childEnvelopeIdsByParent.get(relationship.sourceRegionId) ?? new Set();
    for (const envelopeId of interactionById.get(relationship.targetRegionId).envelopeIds) values.add(envelopeId);
    childEnvelopeIdsByParent.set(relationship.sourceRegionId, values);
  }

  const usesByParent = new Map();
  for (const relationship of regionView.relationships) {
    if (relationship.relation !== "uses") continue;
    if (!cores.some((core) => core.id === relationship.targetRegionId)) continue;
    const values = usesByParent.get(relationship.sourceRegionId) ?? [];
    values.push(relationship.targetRegionId);
    usesByParent.set(relationship.sourceRegionId, values);
  }

  const areas = interaction.flatMap((region) => {
    const inheritedEnvelopeIds = childEnvelopeIdsByParent.get(region.id) ?? new Set();
    const presentedEnvelopeIds = region.envelopeIds.filter((id) => !inheritedEnvelopeIds.has(id));
    if (!presentedEnvelopeIds.length) return [];
    const operations = presentedEnvelopeIds
      .map((envelopeId) => envelopes.get(envelopeId))
      .filter(Boolean)
      .map((envelope) => operationRecord(envelope, pathsByEntry, claims, elements))
      .sort(compareOperation);
    if (!operations.length) return [];
    const sharedCoreIds = uniqueSorted(usesByParent.get(region.id) ?? []);
    const operationBehaviorIds = uniqueSorted(operations.flatMap((item) => item.behaviorIds));
    const operationClaimIds = uniqueSorted(operations.flatMap((item) => item.claimIds));
    const primaryOperationCount = operations.filter((item) => item.prominence === "primary").length;
    return [{
      id: region.id,
      regionId: region.id,
      basis: region.basis,
      anchorElementId: region.anchorElementIds[0],
      envelopeIds: presentedEnvelopeIds,
      behaviorIds: operationBehaviorIds,
      operations,
      operationCount: operations.length,
      primaryOperationCount,
      sharedCoreIds,
      completeness: operations.every((item) => item.completeness === "closed") ? "supported" : "partial",
      reasonCodes: region.reasonCodes,
      claimIds: operationClaimIds,
    }];
  }).sort(compareArea);

  const areaIds = new Set(areas.map((item) => item.id));
  const sharedCores = cores.map((region) => {
    const usedByAreaIds = uniqueSorted(regionView.relationships
      .filter((item) => item.relation === "uses" && item.targetRegionId === region.id)
      .map((item) => item.sourceRegionId)
      .filter((id) => areaIds.has(id)));
    return {
      id: region.id,
      regionId: region.id,
      basis: region.basis,
      anchorElementIds: region.anchorElementIds,
      usedByAreaIds,
      envelopeIds: region.envelopeIds,
      behaviorIds: region.behaviorIds,
      claimIds: region.claimIds,
      completeness: region.completeness,
      reasonCodes: region.reasonCodes,
    };
  }).filter((item) => item.usedByAreaIds.length)
    .sort((left, right) => left.id.localeCompare(right.id));

  const ungrouped = regionView.diagnostics
    .filter((item) => item.code === "envelope-not-grouped")
    .map((item) => ({
      envelopeId: item.envelopeId,
      reason: item.reason,
    }))
    .sort((left, right) => left.envelopeId.localeCompare(right.envelopeId) ||
      left.reason.localeCompare(right.reason));

  return {
    kind: "observed-areas",
    areas,
    sharedCores,
    ungrouped,
  };
}

function operationRecord(envelope, pathsByEntry, claims, elements) {
  const claimIds = uniqueSorted([
    ...(envelope.triggerClaimIds ?? []),
    ...(envelope.conditionClaimIds ?? []),
    ...(envelope.inputClaimIds ?? []),
    ...(envelope.invocationClaimIds ?? []),
    ...(envelope.primaryEffectClaimIds ?? []),
    ...(envelope.supportingEffectClaimIds ?? []),
    ...(envelope.outputClaimIds ?? []),
    ...(envelope.outcomeClaimIds ?? []),
    ...(envelope.unresolvedClaimIds ?? []),
  ]);
  return {
    id: envelope.id,
    envelopeId: envelope.id,
    entryBehaviorId: envelope.entryBehaviorId,
    behaviorIds: envelope.behaviorIds,
    interfaceIds: envelope.interfaceIds,
    primaryEffectClaimIds: envelope.primaryEffectClaimIds ?? [],
    supportingEffectClaimIds: envelope.supportingEffectClaimIds ?? [],
    outputClaimIds: envelope.outputClaimIds ?? [],
    outcomeClaimIds: envelope.outcomeClaimIds ?? [],
    conditionClaimIds: envelope.conditionClaimIds ?? [],
    unresolvedClaimIds: envelope.unresolvedClaimIds ?? [],
    pathIds: uniqueSorted(pathsByEntry.get(envelope.entryBehaviorId) ?? []),
    claimIds,
    prominence: hasPrimarySemanticReach(envelope, claims, elements) ? "primary" : "supporting",
    completeness: envelope.completeness,
    completenessReasons: envelope.completenessReasons ?? [],
  };
}

function compareArea(left, right) {
  return right.primaryOperationCount - left.primaryOperationCount ||
    right.operationCount - left.operationCount || left.id.localeCompare(right.id);
}

function compareOperation(left, right) {
  return prominenceRank(left.prominence) - prominenceRank(right.prominence) || left.id.localeCompare(right.id);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function hasPrimarySemanticReach(envelope, claims, elements) {
  const hasDomainMutation = (envelope.primaryEffectClaimIds ?? []).some((id) => {
    const claim = claims.get(id);
    if (claim?.target.kind !== "reference") return false;
    return ["aggregate", "entity", "artifact"].includes(elements.get(claim.target.id)?.kind);
  });
  if (hasDomainMutation) return true;
  return (envelope.outputClaimIds ?? []).some((id) => {
    const claim = claims.get(id);
    return claim?.target.kind === "reference" && elements.get(claim.target.id)?.kind === "artifact";
  });
}

function prominenceRank(value) {
  return value === "primary" ? 0 : 1;
}
