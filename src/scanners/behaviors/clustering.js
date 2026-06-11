export function clusterBundles(behaviors) {
  const bundles = [];
  const claimed = new Set();

  const groups = new Map();
  for (const b of behaviors) {
    const gates = b.requires.filter((r) => r.kind === "dependency").map((r) => r.name).sort();
    if (gates.length === 0 || !b.trunkCall) continue;
    const key = gates.join(",") + "|" + b.trunkCall;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const name = urlPrefix(members[0].door.path);
    for (const b of members) { b.bundle = name; claimed.add(b); }
    bundles.push({ name, behaviors: members });
  }

  const byPrefix = new Map();
  for (const b of behaviors) {
    if (claimed.has(b)) continue;
    const prefix = urlPrefix(b.door.path);
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(b);
  }
  for (const [prefix, members] of byPrefix) {
    if (members.length < 2) continue;
    for (const b of members) { b.bundle = prefix; claimed.add(b); }
    bundles.push({ name: prefix, behaviors: members });
  }

  const others = behaviors.filter((b) => !claimed.has(b));
  if (others.length) {
    for (const b of others) b.bundle = "Other";
    bundles.push({ name: "Other", behaviors: others });
  }

  // Disambiguate duplicate names using a deeper URL path segment.
  const nameCounts = new Map();
  for (const b of bundles) nameCounts.set(b.name, (nameCounts.get(b.name) || 0) + 1);
  for (const b of bundles) {
    if ((nameCounts.get(b.name) || 0) > 1) {
      const longer = urlPrefix(b.behaviors[0].door.path, 2);
      if (longer !== b.name) {
        b.name = longer;
        for (const beh of b.behaviors) beh.bundle = b.name;
      }
    }
  }
  // Final pass: number any remaining duplicates.
  const seen = new Map();
  for (const b of bundles) {
    const n = seen.get(b.name) || 0;
    if (n > 0) {
      b.name = `${b.name}-${n + 1}`;
      for (const beh of b.behaviors) beh.bundle = b.name;
    }
    seen.set(b.name, (n || 0) + 1);
  }

  bundles.sort((a, b) => b.behaviors.length - a.behaviors.length);
  return bundles;
}

function urlPrefix(p, depth = 1) {
  const segs = p.split("/").filter(Boolean);
  let i = 0;
  if (segs[i] === "api") i++;
  if (segs[i] && /^v\d+$/.test(segs[i])) i++;
  const parts = [];
  while (parts.length < depth) {
    while (segs[i] && /^\{.*\}$/.test(segs[i])) i++;
    if (!segs[i]) break;
    parts.push(segs[i++].replace(/_/g, "-"));
  }
  return parts.join("/") || "root";
}
