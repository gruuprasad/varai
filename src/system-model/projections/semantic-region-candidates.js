import { createHash } from "node:crypto";
import { validateSystemModel } from "../validate.js";
import { behavioralEnvelopes } from "./behavioral-envelopes.js";
import { indexModel } from "./shared.js";

const EFFECT_RELATIONS = new Set(["reads", "changes", "creates", "removes"]);
const RESOURCE_KINDS = new Set(["aggregate", "artifact", "entity", "state"]);
const CONTEXT_KINDS = new Set(["screen", "surface"]);
const MIN_CONTEXT_ENVELOPES = 2;

// Experimental projection: recover overlapping interaction parents and shared
// semantic cores without adding Region to the canonical System Model.
export function semanticRegionCandidates(model) {
  validateSystemModel(model);
  const index = indexModel(model);
  const claims = new Map(model.claims.map((item) => [item.id, item]));
  const envelopes = behavioralEnvelopes(model).envelopes;
  const envelopeById = new Map(envelopes.map((item) => [item.id, item]));
  const participation = new Map(envelopes.map((envelope) => [
    envelope.id,
    envelopeParticipation(envelope, index, claims),
  ]));

  const contextMembership = collectContextMembership(envelopes, index);
  const parents = [...contextMembership]
    .filter(([, value]) => value.envelopeIds.size >= MIN_CONTEXT_ENVELOPES)
    .map(([contextId, value]) => interactionRegion(contextId, value, envelopeById, participation, index));
  const parentByAnchor = new Map(parents.map((item) => [item.anchorElementIds[0], item]));

  const relationships = contextRelationships(model, parentByAnchor);
  const cores = sharedResourceCores(parents, envelopeById, participation, claims, index, relationships);
  const regions = [...parents, ...cores].sort(compareRegion);
  relationships.sort(compareRelationship);

  const groupedEnvelopeIds = new Set(parents.flatMap((item) => item.envelopeIds));
  const diagnostics = envelopes
    .filter((item) => !groupedEnvelopeIds.has(item.id))
    .map((item) => ({
      code: "envelope-not-grouped",
      envelopeId: item.id,
      reason: contextMembershipFor(item.id, contextMembership).length
        ? "interaction-context-has-one-envelope"
        : "no-supported-interaction-context",
    }))
    .sort(compareJson);

  return {
    kind: "semantic-region-candidates",
    regions,
    relationships,
    diagnostics,
  };
}

function envelopeParticipation(envelope, index, claims) {
  const semanticClaimIds = uniqueSorted([
    ...(envelope.triggerClaimIds ?? []),
    ...(envelope.conditionClaimIds ?? []),
    ...(envelope.inputClaimIds ?? []),
    ...(envelope.invocationClaimIds ?? []),
    ...(envelope.primaryEffectClaimIds ?? []),
    ...(envelope.supportingEffectClaimIds ?? []),
    ...(envelope.outputClaimIds ?? []),
    ...(envelope.outcomeClaimIds ?? []),
  ]);
  const artifactIds = uniqueSorted((envelope.outputClaimIds ?? []).flatMap((id) => {
    const claim = claims.get(id);
    if (claim?.target.kind !== "reference") return [];
    return index.elements.get(claim.target.id)?.kind === "artifact" ? [claim.target.id] : [];
  }));
  return {
    envelopeId: envelope.id,
    behaviorIds: uniqueSorted(envelope.behaviorIds ?? []),
    interfaceIds: uniqueSorted(envelope.interfaceIds ?? []),
    subjectIds: uniqueSorted([...(envelope.primarySubjectIds ?? []), ...(envelope.supportingResourceIds ?? [])]
      .filter((id) => RESOURCE_KINDS.has(index.elements.get(id)?.kind))),
    artifactIds,
    claimIds: semanticClaimIds,
    completeness: envelope.completeness,
  };
}

function collectContextMembership(envelopes, index) {
  const membership = new Map();
  for (const envelope of envelopes) {
    const queue = [];
    for (const claim of index.incoming.get(envelope.entryBehaviorId) ?? []) {
      if (claim.relation !== "offers") continue;
      const context = index.elements.get(claim.sourceId);
      if (!CONTEXT_KINDS.has(context?.kind)) continue;
      queue.push({ contextId: context.id, claimIds: [claim.id] });
    }
    const seen = new Set();
    while (queue.length) {
      const current = queue.shift();
      const seenKey = `${current.contextId}:${envelope.id}`;
      if (seen.has(seenKey)) continue;
      seen.add(seenKey);
      const value = membership.get(current.contextId) ?? { envelopeIds: new Set(), claimIdsByEnvelope: new Map() };
      value.envelopeIds.add(envelope.id);
      value.claimIdsByEnvelope.set(envelope.id, uniqueSorted([
        ...(value.claimIdsByEnvelope.get(envelope.id) ?? []),
        ...current.claimIds,
      ]));
      membership.set(current.contextId, value);

      for (const claim of index.incoming.get(current.contextId) ?? []) {
        if (claim.relation !== "contains") continue;
        const parent = index.elements.get(claim.sourceId);
        if (!CONTEXT_KINDS.has(parent?.kind)) continue;
        queue.push({ contextId: parent.id, claimIds: [...current.claimIds, claim.id] });
      }
    }
  }
  return membership;
}

function interactionRegion(contextId, membership, envelopeById, participation, index) {
  const envelopeIds = uniqueSorted([...membership.envelopeIds]);
  const records = envelopeIds.map((id) => participation.get(id)).filter(Boolean);
  const anchor = index.elements.get(contextId);
  const claimIds = uniqueSorted([
    ...records.flatMap((item) => item.claimIds),
    ...envelopeIds.flatMap((id) => membership.claimIdsByEnvelope.get(id) ?? []),
  ]);
  return {
    id: `region:interaction-context:${contextId}`,
    basis: "interaction-context",
    anchorElementIds: [contextId],
    envelopeIds,
    behaviorIds: uniqueSorted(records.flatMap((item) => item.behaviorIds)),
    interfaceIds: uniqueSorted(records.flatMap((item) => item.interfaceIds)),
    subjectIds: uniqueSorted(records.flatMap((item) => item.subjectIds)),
    artifactIds: uniqueSorted(records.flatMap((item) => item.artifactIds)),
    claimIds,
    completeness: records.every((item) => item.completeness === "closed") ? "supported" : "partial",
    reasonCodes: [`shared-${anchor?.kind ?? "interaction"}-context`, "multiple-behavioral-envelopes"],
  };
}

function contextRelationships(model, parentByAnchor) {
  const result = [];
  for (const claim of model.claims) {
    if (claim.relation !== "contains" || claim.target.kind !== "reference") continue;
    const parent = parentByAnchor.get(claim.sourceId);
    const child = parentByAnchor.get(claim.target.id);
    if (!parent || !child) continue;
    const envelopeIds = intersection(parent.envelopeIds, child.envelopeIds);
    if (!envelopeIds.length) continue;
    result.push({
      id: `region-relationship:contains:${parent.id}:${child.id}`,
      relation: "contains",
      sourceRegionId: parent.id,
      targetRegionId: child.id,
      envelopeIds,
      claimIds: [claim.id],
    });
  }
  return dedupeRelationships(result);
}

function sharedResourceCores(parents, envelopeById, participation, claims, index, relationships) {
  const containedParents = new Set(relationships
    .filter((item) => item.relation === "contains")
    .map((item) => item.sourceRegionId));
  const leafParents = parents.filter((item) => !containedParents.has(item.id));
  const parentUsage = new Map();
  for (const parent of leafParents) {
    const resources = new Map();
    for (const envelopeId of parent.envelopeIds) {
      const envelope = envelopeById.get(envelopeId);
      if (!envelope) continue;
      const candidateClaimIds = uniqueSorted([
        ...(envelope.primaryEffectClaimIds ?? []),
        ...(envelope.supportingEffectClaimIds ?? []),
        ...(envelope.outputClaimIds ?? []),
      ]);
      for (const claimId of candidateClaimIds) {
        const claim = claims.get(claimId);
        if (!isResolvedResourceRelationship(claim, index)) continue;
        const resourceId = claim.target.id;
        const usage = resources.get(resourceId) ?? { envelopes: new Map(), behaviorIds: new Set(), claimIds: new Set() };
        const envelopeClaimIds = usage.envelopes.get(envelopeId) ?? new Set();
        envelopeClaimIds.add(claimId);
        usage.envelopes.set(envelopeId, envelopeClaimIds);
        usage.behaviorIds.add(claim.sourceId);
        usage.claimIds.add(claimId);
        resources.set(resourceId, usage);
      }
    }
    parentUsage.set(parent.id, { parent, resources });
  }

  // Close every pairwise repeated intersection. The closure's intent is the
  // maximal Resource set shared by its full parent extent. This creates one
  // reusable subregion for a repeated semantic intersection instead of one
  // pseudo-region per common noun.
  const concepts = new Map();
  const usages = [...parentUsage.values()];
  for (let left = 0; left < usages.length; left += 1) {
    for (let right = left + 1; right < usages.length; right += 1) {
      const seed = intersection([...usages[left].resources.keys()], [...usages[right].resources.keys()]);
      if (!seed.length) continue;
      const extent = usages.filter((item) => seed.every((id) => item.resources.has(id)));
      if (extent.length < 2) continue;
      const intent = extent.slice(1).reduce(
        (values, item) => intersection(values, [...item.resources.keys()]),
        [...extent[0].resources.keys()],
      );
      if (!intent.length) continue;
      const key = intent.join("|");
      concepts.set(key, { intent: uniqueSorted(intent), extent: uniqueSorted(extent.map((item) => item.parent.id)) });
    }
  }

  const cores = [...concepts.values()].map((concept) => {
    const coreId = `region:shared-resource-core:${stableKey(concept.intent)}`;
    const usage = conceptUsage(concept, parentUsage);
    const envelopeIds = uniqueSorted([...usage.envelopes.keys()]);
    const records = envelopeIds.map((id) => participation.get(id)).filter(Boolean);
    return {
      id: coreId,
      basis: "shared-resource-core",
      anchorElementIds: concept.intent,
      envelopeIds,
      behaviorIds: uniqueSorted([...usage.behaviorIds]),
      interfaceIds: uniqueSorted(records.flatMap((item) => item.interfaceIds)),
      subjectIds: concept.intent.filter((id) => index.elements.get(id)?.kind !== "artifact"),
      artifactIds: concept.intent.filter((id) => index.elements.get(id)?.kind === "artifact"),
      claimIds: uniqueSorted([...usage.claimIds]),
      completeness: records.every((item) => item.completeness === "closed") ? "supported" : "partial",
      reasonCodes: ["closed-resource-intersection", "reused-across-independent-contexts"],
      _extent: concept.extent,
      _usage: usage,
    };
  }).filter((core) => core.behaviorIds.length >= 2);

  // Parents reference only their most-specific applicable shared intersections.
  // Broader common cores remain reachable through core-to-core reuse edges.
  for (const parent of leafParents) {
    const applicable = cores.filter((core) => core._extent.includes(parent.id));
    const maximal = applicable.filter((candidate) => !applicable.some((other) =>
      other.id !== candidate.id && strictSuperset(other.anchorElementIds, candidate.anchorElementIds)));
    for (const core of maximal) {
      const parentUsageForCore = usageForParent(core.anchorElementIds, parentUsage.get(parent.id));
      relationships.push({
        id: `region-relationship:uses:${parent.id}:${core.id}`,
        relation: "uses",
        sourceRegionId: parent.id,
        targetRegionId: core.id,
        envelopeIds: uniqueSorted([...parentUsageForCore.envelopes.keys()]),
        claimIds: uniqueSorted([...parentUsageForCore.claimIds]),
      });
    }
  }

  // A specialized shared core reuses its nearest broader closed intersection.
  for (const source of cores) {
    const broader = cores.filter((target) => target.id !== source.id &&
      strictSuperset(source.anchorElementIds, target.anchorElementIds) &&
      strictSuperset(target._extent, source._extent));
    const nearest = broader.filter((candidate) => !broader.some((other) =>
      other.id !== candidate.id &&
      strictSuperset(other.anchorElementIds, candidate.anchorElementIds) &&
      strictSuperset(source.anchorElementIds, other.anchorElementIds)));
    for (const target of nearest) {
      const relevantClaims = source.claimIds.filter((id) => {
        const claim = claims.get(id);
        return claim?.target.kind === "reference" && target.anchorElementIds.includes(claim.target.id);
      });
      relationships.push({
        id: `region-relationship:uses:${source.id}:${target.id}`,
        relation: "uses",
        sourceRegionId: source.id,
        targetRegionId: target.id,
        envelopeIds: intersection(source.envelopeIds, target.envelopeIds),
        claimIds: uniqueSorted(relevantClaims),
      });
    }
  }

  return cores.map(({ _extent, _usage, ...core }) => core);
}

function conceptUsage(concept, parentUsage) {
  const combined = { envelopes: new Map(), behaviorIds: new Set(), claimIds: new Set() };
  for (const parentId of concept.extent) mergeUsage(combined, usageForParent(concept.intent, parentUsage.get(parentId)));
  return combined;
}

function usageForParent(resourceIds, parentValue) {
  const combined = { envelopes: new Map(), behaviorIds: new Set(), claimIds: new Set() };
  if (!parentValue) return combined;
  for (const resourceId of resourceIds) mergeUsage(combined, parentValue.resources.get(resourceId));
  return combined;
}

function mergeUsage(target, source) {
  if (!source) return;
  for (const [envelopeId, claimIds] of source.envelopes) {
    const values = target.envelopes.get(envelopeId) ?? new Set();
    for (const id of claimIds) values.add(id);
    target.envelopes.set(envelopeId, values);
  }
  for (const id of source.behaviorIds) target.behaviorIds.add(id);
  for (const id of source.claimIds) target.claimIds.add(id);
}

function strictSuperset(left, right) {
  if (left.length <= right.length) return false;
  const values = new Set(left);
  return right.every((item) => values.has(item));
}

function stableKey(ids) {
  return createHash("sha256").update(uniqueSorted(ids).join("\n")).digest("hex").slice(0, 20);
}

function isResolvedResourceRelationship(claim, index) {
  if (!claim || claim.target.kind !== "reference") return false;
  const target = index.elements.get(claim.target.id);
  if (!target?.roles.includes("resource") || !RESOURCE_KINDS.has(target.kind)) return false;
  return EFFECT_RELATIONS.has(claim.relation) || (claim.relation === "produces" && target.kind === "artifact");
}

function contextMembershipFor(envelopeId, membership) {
  return [...membership].filter(([, value]) => value.envelopeIds.has(envelopeId));
}

function dedupeRelationships(items) {
  const result = new Map();
  for (const item of items) result.set(item.id, item);
  return [...result.values()];
}

function intersection(left, right) {
  const values = new Set(right);
  return uniqueSorted(left.filter((item) => values.has(item)));
}

function uniqueSorted(values) { return [...new Set(values)].sort(); }
function compareJson(left, right) { return JSON.stringify(left).localeCompare(JSON.stringify(right)); }
function compareRegion(left, right) { return left.basis.localeCompare(right.basis) || left.id.localeCompare(right.id); }
function compareRelationship(left, right) { return left.relation.localeCompare(right.relation) || left.id.localeCompare(right.id); }
