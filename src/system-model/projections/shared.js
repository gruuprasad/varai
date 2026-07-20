export const EFFECT_RELATIONS = new Set(["reads", "changes", "creates", "removes"]);

export function indexModel(model) {
  const elements = new Map(model.elements.map((item) => [item.id, item]));
  const outgoing = new Map();
  const incoming = new Map();
  for (const claim of model.claims) {
    const sourceClaims = outgoing.get(claim.sourceId) ?? [];
    sourceClaims.push(claim);
    outgoing.set(claim.sourceId, sourceClaims);
    if (claim.target.kind === "reference") {
      const targetClaims = incoming.get(claim.target.id) ?? [];
      targetClaims.push(claim);
      incoming.set(claim.target.id, targetClaims);
    }
  }
  for (const values of [...outgoing.values(), ...incoming.values()]) values.sort((a, b) => a.id.localeCompare(b.id));
  return { elements, outgoing, incoming };
}

export function interfacesForBehavior(behavior, index) {
  const ids = new Set();
  if (behavior.roles.includes("interface")) ids.add(behavior.id);
  for (const claim of index.incoming.get(behavior.id) ?? []) {
    if (!["offers", "invokes"].includes(claim.relation)) continue;
    const source = index.elements.get(claim.sourceId);
    if (source?.roles.includes("interface")) ids.add(source.id);
  }
  return [...ids].sort();
}
