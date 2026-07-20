const COLLECTION_RE = /^(?:list|set|tuple|Sequence|MutableSequence|Iterable)\s*\[/i;
const TYPE_EXCLUSIONS = new Set([
  "Annotated", "Any", "Dict", "Iterable", "List", "Literal", "Mapping",
  "MutableMapping", "MutableSequence", "None", "Optional", "Sequence", "Set",
  "Tuple", "dict", "list", "set", "tuple", "str", "int", "float", "bool",
]);
const OPERATION_NOISE = new Set([
  "add", "apply", "archive", "create", "delete", "discard", "edit", "from",
  "in", "insert", "merge", "model", "move", "remove", "replace", "reset",
  "set", "to", "update",
]);

export function bindApplicationOperation(candidate, registry) {
  const subjects = productionCandidates(registry.named(candidate.subject));
  if (subjects.length !== 1) return null;
  const subject = subjects[0];
  const contained = containedDeclarations(subject, registry);
  const resultFields = candidate.returnTypes.flatMap((name) => {
    const declarations = productionCandidates(registry.named(name));
    return declarations.length === 1 ? declarations[0].fields ?? [] : [];
  });
  const operationTerms = terms(candidate.name).filter((term) => !OPERATION_NOISE.has(term));
  const interfaceTerms = (candidate.interfaceTerms ?? []).flatMap(terms);
  const ranked = contained.map((item) => ({
    ...item,
    score: resourceScore(item, operationTerms, interfaceTerms, resultFields),
    resultEvidence: matchingResultFields(item, resultFields).map((field) => field.evidence),
  })).filter((item) => item.score >= 4)
    .sort((a, b) => b.score - a.score || a.declaration.id.localeCompare(b.declaration.id));
  if (!ranked.length || (ranked[1] && ranked[0].score === ranked[1].score)) return null;
  const selected = ranked[0];
  return {
    ...candidate,
    subjectDeclarationId: subject.id,
    resource: selected.declaration.name,
    resourceDeclarationId: selected.declaration.id,
    containmentEvidence: selected.path.map((edge) => edge.evidence),
    bindingEvidence: [candidate.evidence, ...selected.path.map((edge) => edge.evidence), ...selected.resultEvidence]
      .filter(Boolean),
    bindingState: "inferred",
  };
}

function containedDeclarations(root, registry, maxDepth = 3) {
  const result = [];
  const queue = [{ declaration: root, path: [], depth: 0 }];
  const seen = new Set([root.id]);
  while (queue.length) {
    const current = queue.shift();
    if (current.depth >= maxDepth) continue;
    for (const field of current.declaration.fields ?? []) {
      for (const typeName of typeNames(field.type)) {
        const matches = productionCandidates(registry.named(typeName));
        if (matches.length !== 1) continue;
        const declaration = matches[0];
        const path = [...current.path, {
          owner: current.declaration.name,
          field: field.name,
          collection: COLLECTION_RE.test(field.type),
          evidence: field.evidence,
        }];
        if (COLLECTION_RE.test(field.type)) result.push({ declaration, field, path });
        if (!seen.has(declaration.id)) {
          seen.add(declaration.id);
          queue.push({ declaration, path, depth: current.depth + 1 });
        }
      }
    }
  }
  return result;
}

function productionCandidates(declarations) {
  const production = declarations.filter((item) => !isTestPath(item.file));
  return production.length ? production : declarations;
}

function isTestPath(file) {
  return /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|(?:^|\/)test_[^/]+\.py$|\.(?:test|spec)\.[^/]+$/i.test(String(file ?? ""));
}

function resourceScore(item, operationTerms, interfaceTerms, resultFields) {
  const typeTerms = terms(item.declaration.name);
  const fieldTerms = terms(singular(item.field.name));
  let operationScore = intersects(operationTerms, typeTerms) ? 3 : 0;
  if (intersects(operationTerms, fieldTerms)) operationScore += 3;
  if (covers(operationTerms, typeTerms)) operationScore += 2;
  if (covers(operationTerms, fieldTerms)) operationScore += 2;
  // A REST-shaped path contributes vocabulary, but less confidence than the
  // resolved application operation. It can disambiguate a typed containment
  // graph; it cannot create a resource or operation candidate by itself.
  let interfaceScore = intersects(interfaceTerms, typeTerms) ? 2 : 0;
  if (intersects(interfaceTerms, fieldTerms)) interfaceScore += 2;
  if (covers(interfaceTerms, typeTerms)) interfaceScore += 2;
  if (covers(interfaceTerms, fieldTerms)) interfaceScore += 2;
  const resultScore = matchingResultFields(item, resultFields).length ? 4 : 0;
  const independentSignals = [operationScore, interfaceScore, resultScore].filter((score) => score > 0).length;
  if (operationScore < 4 && independentSignals < 2) return -1;
  return operationScore + interfaceScore + resultScore;
}

function matchingResultFields(item, resultFields) {
  const typeTerms = terms(item.declaration.name);
  const fieldTerms = terms(singular(item.field.name));
  return resultFields.filter((field) => {
    const words = terms(field.name);
    return words.includes("id") && (covers(words, typeTerms) || covers(words, fieldTerms));
  });
}

function typeNames(value) {
  return [...new Set(String(value ?? "").match(/[A-Za-z_]\w*/g) ?? [])]
    .filter((name) => !TYPE_EXCLUSIONS.has(name));
}

function terms(value) {
  return String(value ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    .map(singular);
}

function singular(value) {
  if (value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.endsWith("ses")) return value.slice(0, -2);
  if (value.endsWith("s") && !value.endsWith("ss")) return value.slice(0, -1);
  return value;
}

function intersects(left, right) {
  const values = new Set(left);
  return right.some((item) => values.has(item));
}

function covers(evidenceTerms, candidateTerms) {
  const evidence = new Set(evidenceTerms);
  return candidateTerms.length > 0 && candidateTerms.every((term) => evidence.has(term));
}
