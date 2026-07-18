function values(ir, collection) {
  if (collection === "clauses") {
    return ir.behaviors.flatMap((behavior) =>
      ["requires", "takes", "gives", "reads", "writes", "fails", "untraced"]
        .flatMap((kind) => behavior[kind].map((clause) => ({ ...clause, clauseKind: kind, behavior }))));
  }
  return ir[collection] ?? [];
}

function matches(item, where) {
  return Object.entries(where).every(([path, expected]) => {
    const actual = path.split(".").reduce((value, key) => value?.[key], item);
    return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
  });
}

export function evaluateAnalysis(ir, manifest) {
  const failures = [];
  for (const expectation of manifest.expected ?? []) {
    const found = values(ir, expectation.collection).some((item) => matches(item, expectation.where));
    if (!found) failures.push({ type: "missing-expected", expectation });
  }
  for (const forbidden of manifest.forbidden ?? []) {
    const found = values(ir, forbidden.collection).some((item) => matches(item, forbidden.where));
    if (found) failures.push({ type: "present-forbidden", expectation: forbidden });
  }
  return { ok: failures.length === 0, failures };
}
