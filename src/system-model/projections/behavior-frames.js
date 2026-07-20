import { validateSystemModel } from "../validate.js";
import { EFFECT_RELATIONS, indexModel, interfacesForBehavior } from "./shared.js";

const GROUPS = Object.freeze({
  triggerClaimIds: new Set(["triggered_by"]),
  conditionClaimIds: new Set(["requires", "available_when"]),
  inputClaimIds: new Set(["accepts"]),
  effectClaimIds: EFFECT_RELATIONS,
  invocationClaimIds: new Set(["invokes"]),
  outputClaimIds: new Set(["produces"]),
  outcomeClaimIds: new Set(["succeeds_with", "fails_with", "navigates_to", "emits"]),
});

export function behaviorFrames(model) {
  validateSystemModel(model);
  const index = indexModel(model);
  const frames = [];
  const diagnostics = [];

  for (const behavior of model.elements.filter((item) => item.roles.includes("behavior"))) {
    const claims = index.outgoing.get(behavior.id) ?? [];
    const interfaceIds = interfacesForBehavior(behavior, index);
    const frame = {
      behaviorId: behavior.id,
      name: frameName(behavior, interfaceIds, index),
      interfaceIds,
      subjectIds: [],
      supportingResourceIds: [],
      unresolvedEffectClaimIds: [],
      triggerClaimIds: [],
      conditionClaimIds: [],
      inputClaimIds: [],
      effectClaimIds: [],
      invocationClaimIds: [],
      outputClaimIds: [],
      outcomeClaimIds: [],
      unresolvedClaimIds: [],
      claimIds: claims.map((claim) => claim.id).sort(),
    };

    for (const claim of claims) {
      let grouped = false;
      for (const [field, relations] of Object.entries(GROUPS)) {
        if (!relations.has(claim.relation)) continue;
        frame[field].push(claim.id);
        grouped = true;
        break;
      }
      if (!grouped) frame.unresolvedClaimIds.push(claim.id);

      if (!EFFECT_RELATIONS.has(claim.relation)) continue;
      // An effect that never bound to a declaration (still a literal) is unresolved.
      if (claim.target.kind !== "reference") { frame.unresolvedEffectClaimIds.push(claim.id); continue; }
      const target = index.elements.get(claim.target.id);
      if (target?.roles.includes("resource")) frame.subjectIds.push(target.id);
      else frame.supportingResourceIds.push(claim.target.id);
    }

    for (const field of Object.keys(GROUPS)) frame[field].sort();
    frame.subjectIds = [...new Set(frame.subjectIds)].sort();
    frame.supportingResourceIds = [...new Set(frame.supportingResourceIds)].sort();
    frame.unresolvedEffectClaimIds = [...new Set(frame.unresolvedEffectClaimIds)].sort();
    frame.unresolvedClaimIds = [...new Set(frame.unresolvedClaimIds)].sort();
    frames.push(frame);

    if (!frame.interfaceIds.length) diagnostics.push({ code: "behavior-without-known-interface", elementId: behavior.id });
  }

  frames.sort((a, b) => a.name.localeCompare(b.name) || a.behaviorId.localeCompare(b.behaviorId));
  return {
    kind: "behavior-frames",
    frames,
    diagnostics: diagnostics.sort((a, b) => a.elementId.localeCompare(b.elementId)),
  };
}

function frameName(behavior, interfaceIds, index) {
  for (const id of interfaceIds) {
    if (id === behavior.id) continue;
    const name = index.elements.get(id)?.name;
    if (name && behavior.name.startsWith(`${name} `)) return behavior.name.slice(name.length + 1);
  }
  return behavior.name;
}
