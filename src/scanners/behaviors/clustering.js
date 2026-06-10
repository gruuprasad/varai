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

  bundles.sort((a, b) => b.behaviors.length - a.behaviors.length);
  return bundles;
}

function urlPrefix(p) {
  const segs = p.split("/").filter(Boolean);
  let i = 0;
  if (segs[i] === "api") i++;
  if (segs[i] && /^v\d+$/.test(segs[i])) i++;
  return (segs[i] || "root").replace(/_/g, "-");
}
