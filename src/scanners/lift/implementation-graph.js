function compare(a, b) {
  return String(a).localeCompare(String(b));
}

export function privateNodeId(kind, file, symbol) {
  return `${kind}:${file}:${symbol}`;
}

export function createImplementationGraph({ workBudget = 50_000 } = {}) {
  const nodes = new Map();
  const edges = new Map();
  let work = 0;
  let exhausted = false;

  function spend() {
    work += 1;
    if (work > workBudget) exhausted = true;
    return !exhausted;
  }

  function addNode(node) {
    if (!spend()) return null;
    const existing = nodes.get(node.id);
    if (!existing) nodes.set(node.id, { ...node });
    return nodes.get(node.id) ?? null;
  }

  function addEdge(edge) {
    if (!spend() || !nodes.has(edge.from) || !nodes.has(edge.to)) return null;
    const key = `${edge.from}\0${edge.kind}\0${edge.to}`;
    if (!edges.has(key)) edges.set(key, { evidence: [], ...edge });
    const current = edges.get(key);
    current.evidence = mergeEvidence(current.evidence, edge.evidence);
    return current;
  }

  function outgoing(id, kind = null) {
    return [...edges.values()]
      .filter((edge) => edge.from === id && (!kind || edge.kind === kind))
      .sort((a, b) => compare(a.kind, b.kind) || compare(a.to, b.to));
  }

  function findPath(from, to, { maxDepth = 32 } = {}) {
    if (from === to) return [nodes.get(from)].filter(Boolean);
    const queue = [{ id: from, path: [from] }];
    const seen = new Set([from]);
    while (queue.length && spend()) {
      const current = queue.shift();
      if (current.path.length > maxDepth) continue;
      for (const edge of outgoing(current.id)) {
        if (seen.has(edge.to)) continue;
        const path = [...current.path, edge.to];
        if (edge.to === to) return path.map((id) => nodes.get(id)).filter(Boolean);
        seen.add(edge.to);
        queue.push({ id: edge.to, path });
      }
    }
    return [];
  }

  function diagnostics() {
    return exhausted ? [{
      code: "implementation-graph-budget-exhausted",
      severity: "warning",
      message: `Implementation graph work budget (${workBudget}) was exhausted`,
      claimState: "unverified",
      capability: "implementation.trace",
      evidence: [],
    }] : [];
  }

  return {
    addNode,
    addEdge,
    outgoing,
    findPath,
    getNode: (id) => nodes.get(id) ?? null,
    values: () => ({
      nodes: [...nodes.values()].sort((a, b) => compare(a.id, b.id)),
      edges: [...edges.values()].sort((a, b) => compare(a.from, b.from) || compare(a.kind, b.kind) || compare(a.to, b.to)),
    }),
    diagnostics,
    stats: () => ({ work, workBudget, exhausted }),
  };
}

function mergeEvidence(...lists) {
  const map = new Map();
  for (const item of lists.flat(Infinity).filter(Boolean)) {
    const key = JSON.stringify(item);
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
