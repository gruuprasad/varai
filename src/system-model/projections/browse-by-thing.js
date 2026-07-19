import { validateSystemModel } from "../validate.js";
import { EFFECT_RELATIONS, indexModel, interfacesForBehavior } from "./shared.js";

const SUBJECT_KINDS = new Set(["aggregate", "entity"]);

function tierRank(element) {
  if (SUBJECT_KINDS.has(element.kind)) return 0;
  if (element.kind === "screen" || element.kind === "surface") return 1;
  return 2;
}

// Within tier 1, screens come before unplaced surfaces.
function kindRank(element) {
  return element.kind === "surface" ? 1 : 0;
}

export function browseByThing(model) {
  validateSystemModel(model);
  const index = indexModel(model);
  const roots = [];
  const diagnostics = [];

  const containedSurfaceIds = new Set();
  for (const claim of model.claims) {
    if (claim.relation !== "contains" || claim.target.kind !== "reference") continue;
    if (index.elements.get(claim.sourceId)?.kind !== "screen") continue;
    if (index.elements.get(claim.target.id)?.kind !== "surface") continue;
    containedSurfaceIds.add(claim.target.id);
  }

  for (const element of model.elements) {
    const isUiSurface = element.roles.includes("interface") && ["screen", "surface"].includes(element.kind);
    if (!element.roles.includes("resource") && !isUiSurface) continue;
    if (element.kind === "surface" && containedSurfaceIds.has(element.id)) continue;

    const incoming = index.incoming.get(element.id) ?? [];
    const outgoing = index.outgoing.get(element.id) ?? [];
    const effectClaims = incoming.filter((claim) => EFFECT_RELATIONS.has(claim.relation));
    const behaviorIds = new Set(effectClaims.map((claim) => claim.sourceId)
      .filter((id) => index.elements.get(id)?.roles.includes("behavior")));

    const surfaceIds = new Set();
    if (element.kind === "screen") {
      for (const claim of outgoing) {
        if (claim.relation !== "contains" || claim.target.kind !== "reference") continue;
        const surface = index.elements.get(claim.target.id);
        if (surface?.kind !== "surface") continue;
        surfaceIds.add(surface.id);
        for (const offered of index.outgoing.get(surface.id) ?? []) {
          if (offered.relation === "offers" && offered.target.kind === "reference") behaviorIds.add(offered.target.id);
        }
      }
    }
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

    roots.push({
      elementId: element.id,
      tier: tierRank(element),
      behaviorIds: [...behaviorIds].sort(),
      surfaceIds: [...surfaceIds].sort(),
      interfaceIds: [...interfaceIds].sort(),
      claimIds: [...new Set([...effectClaims, ...outgoing.filter((claim) => ["offers", "contains"].includes(claim.relation))]
        .map((claim) => claim.id))].sort(),
    });

    if (element.kind === "surface") diagnostics.push({ code: "surface-not-placed", elementId: element.id });
    else if (!behaviorIds.size && element.kind !== "contract") diagnostics.push({
      code: "resource-without-known-behavior",
      elementId: element.id,
    });
  }

  roots.sort((a, b) => a.tier - b.tier ||
    kindRank(index.elements.get(a.elementId)) - kindRank(index.elements.get(b.elementId)) ||
    b.behaviorIds.length - a.behaviorIds.length ||
    a.elementId.localeCompare(b.elementId));
  return {
    kind: "browse-by-thing",
    roots,
    diagnostics: diagnostics.sort((a, b) => a.elementId.localeCompare(b.elementId) || a.code.localeCompare(b.code)),
  };
}
