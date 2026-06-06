export function dedupeFacts(facts) {
  const seen = new Set();
  return facts.filter((fact) => {
    const key = `${fact.kind}:${fact.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
