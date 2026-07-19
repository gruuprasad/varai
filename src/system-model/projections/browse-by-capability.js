import { validateSystemModel } from "../validate.js";
import { EFFECT_RELATIONS, indexModel, interfacesForBehavior } from "./shared.js";

export function browseByCapability(model) {
  validateSystemModel(model);
  const index = indexModel(model);
  const capabilities = [];
  const diagnostics = [];

  for (const behavior of model.elements.filter((item) => item.roles.includes("behavior"))) {
    const claims = index.outgoing.get(behavior.id) ?? [];
    const resourceIds = [...new Set(claims
      .filter((claim) => EFFECT_RELATIONS.has(claim.relation))
      .filter((claim) => claim.target.kind === "reference" && index.elements.get(claim.target.id)?.roles.includes("resource"))
      .map((claim) => claim.target.id))].sort();
    const interfaceIds = interfacesForBehavior(behavior, index);
    capabilities.push({
      behaviorId: behavior.id,
      interfaceIds,
      resourceIds,
      claimIds: claims.map((claim) => claim.id).sort(),
    });
    if (!interfaceIds.length) diagnostics.push({ code: "behavior-without-known-interface", elementId: behavior.id });
  }

  capabilities.sort((a, b) => b.resourceIds.length - a.resourceIds.length || a.behaviorId.localeCompare(b.behaviorId));
  return { kind: "browse-by-capability", capabilities, diagnostics: diagnostics.sort((a, b) => a.elementId.localeCompare(b.elementId)) };
}
