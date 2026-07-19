export async function createDeclarationRegistry({ observations, symbolIndex }) {
  const declarations = new Map();
  const byName = new Map();
  const observationKinds = indexObservationKinds(observations);

  for (const item of await symbolIndex.allDeclarations()) {
    const sourceKinds = observationKinds.get(`${item.file}\0${item.name}`) ?? [];
    const declaration = {
      ...item,
      sourceKinds,
      persisted: sourceKinds.includes("db_model"),
      schema: sourceKinds.includes("schema"),
      fields: extractFields(item.node, item.file),
    };
    declarations.set(declaration.id, declaration);
    const named = byName.get(declaration.name) ?? [];
    named.push(declaration);
    byName.set(declaration.name, named);
  }

  for (const values of byName.values()) values.sort((a, b) => a.id.localeCompare(b.id));

  return {
    get: (id) => declarations.get(id) ?? null,
    named: (name) => byName.get(String(name)) ?? [],
    resolve: async (file, name) => {
      const direct = await symbolIndex.resolveDeclaration(file, name);
      if (direct) return declarations.get(direct.id) ?? direct;
      const candidates = byName.get(String(name)) ?? [];
      return candidates.length === 1 ? candidates[0] : null;
    },
    values: () => [...declarations.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function indexObservationKinds(observations) {
  const result = new Map();
  for (const item of observations) {
    if (!["db_model", "schema"].includes(item.kind)) continue;
    for (const evidence of item.evidence ?? []) {
      const key = `${evidence.file}\0${item.name}`;
      const kinds = result.get(key) ?? [];
      if (!kinds.includes(item.kind)) kinds.push(item.kind);
      result.set(key, kinds.sort());
    }
  }
  return result;
}

function extractFields(classNode, file) {
  const body = classNode.childForFieldName("body");
  if (!body) return [];
  const fields = new Map();
  for (const assignment of body.descendantsOfType("assignment")) {
    const left = assignment.childForFieldName("left");
    const type = assignment.childForFieldName("type");
    if (left?.type !== "identifier" || !type) continue;
    fields.set(left.text, {
      name: left.text,
      type: type.text,
      evidence: { file, line: left.startPosition.row + 1 },
    });
  }
  return [...fields.values()].sort((a, b) => a.name.localeCompare(b.name));
}
