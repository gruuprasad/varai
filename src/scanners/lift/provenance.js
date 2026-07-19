export function evidenceForNode(node) {
  if (!node?.file) return null;
  return {
    file: node.file,
    ...(node.line == null ? {} : { line: node.line }),
    ...(node.symbol == null ? {} : { symbol: node.symbol }),
  };
}

export function implementationPath(...parts) {
  const result = [];
  const seenAdjacent = new Set();
  for (const item of parts.flat(Infinity).filter(Boolean)) {
    const evidence = item.file ? {
      file: item.file,
      ...(item.line == null ? {} : { line: item.line }),
      ...(item.symbol == null ? {} : { symbol: item.symbol }),
    } : evidenceForNode(item);
    if (!evidence) continue;
    const key = JSON.stringify(evidence);
    if (seenAdjacent.has(key)) continue;
    seenAdjacent.add(key);
    result.push(evidence);
  }
  return result;
}
