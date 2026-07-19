export function dedupeObservations(observations) {
  const byIdentity = new Map();
  for (const fact of observations) {
    const key = observationKey(fact);
    const current = byIdentity.get(key);
    if (!current) {
      byIdentity.set(key, { ...fact, evidence: [...(fact.evidence ?? [])] });
      continue;
    }
    const evidence = new Map([...current.evidence, ...(fact.evidence ?? [])]
      .map((ev) => [`${ev.file}:${ev.line ?? 0}`, ev]));
    current.evidence = [...evidence.values()].sort((a, b) =>
      `${a.file}:${a.line ?? 0}`.localeCompare(`${b.file}:${b.line ?? 0}`));
  }
  return [...byIdentity.values()];
}

function observationKey(fact) {
  if (["env_var", "integration", "package", "script", "service"].includes(fact.kind)) {
    return `${fact.kind}:${fact.ecosystem ?? ""}:${fact.name}`;
  }
  if (["api_route", "webhook_route"].includes(fact.kind)) return `${fact.kind}:${fact.name}`;
  return `${fact.kind}:${fact.evidence?.[0]?.file ?? ""}:${fact.name}`;
}
