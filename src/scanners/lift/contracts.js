export function boundaryContractNames(behaviors) {
  const names = new Set();
  for (const behavior of behaviors) {
    for (const item of behavior.takes ?? []) if (item.schema) names.add(item.schema);
    for (const item of behavior.gives ?? []) if (item.schema) names.add(item.schema);
  }
  return names;
}
