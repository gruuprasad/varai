import { validateSystemModel } from "../validate.js";
import { EFFECT_RELATIONS, indexModel, interfacesForBehavior } from "./shared.js";

export function browseByThing(model) {
  validateSystemModel(model);
  const index = indexModel(model);
  const roots = [];
  const diagnostics = [];

  for (const element of model.elements) {
    const isUiSurface = element.roles.includes("interface") && ["screen", "surface"].includes(element.kind);
    if (!element.roles.includes("resource") && !isUiSurface) continue;

    const incoming = index.incoming.get(element.id) ?? [];
    const outgoing = index.outgoing.get(element.id) ?? [];
    const effectClaims = incoming.filter((claim) => EFFECT_RELATIONS.has(claim.relation));
    const behaviorIds = new Set(effectClaims.map((claim) => claim.sourceId)
      .filter((id) => index.elements.get(id)?.roles.includes("behavior")));

    if (isUiSurface) {
      for (const claim of outgoing) {
        if (claim.relation === "offers" && claim.target.kind === "reference") behaviorIds.add(claim.target.id);
      }
    }

    const interfaceIds = new Set();
    for (const id of behaviorIds) {
      const behavior = index.elements.get(id);
      if (behavior) for (const interfaceId of interfacesForBehavior(behavior, index)) interfaceIds.add(interfaceId);
    }
    if (isUiSurface) interfaceIds.add(element.id);

    const tier = isUiSurface || effectClaims.length > 0 ? 0 : element.kind === "contract" ? 2 : 1;
    roots.push({
      elementId: element.id,
      tier,
      behaviorIds: [...behaviorIds].sort(),
      interfaceIds: [...interfaceIds].sort(),
      claimIds: [...new Set([...effectClaims, ...outgoing.filter((claim) => claim.relation === "offers")].map((claim) => claim.id))].sort(),
    });

    if (!behaviorIds.size && element.kind !== "contract") diagnostics.push({
      code: "resource-without-known-behavior",
      elementId: element.id,
    });
  }

  roots.sort((a, b) => a.tier - b.tier || b.behaviorIds.length - a.behaviorIds.length || a.elementId.localeCompare(b.elementId));
  return { kind: "browse-by-thing", roots, diagnostics: diagnostics.sort((a, b) => a.elementId.localeCompare(b.elementId)) };
}
