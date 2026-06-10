export function appendBehaviorsSection(lines, result) {
  const bundles = result?.bundles ?? [];
  if (bundles.length === 0) return;
  const total = bundles.reduce((n, b) => n + b.behaviors.length, 0);

  lines.push(`## Behaviors (${total} across ${bundles.length} bundles)`, "");

  for (const bundle of bundles) {
    const gates = sharedGates(bundle);
    const head = [`### ${bundle.name} (${bundle.behaviors.length})`];
    if (bundle.jobScoped) head.push("job-scoped");
    if (gates) head.push(`needs: ${gates}`);
    lines.push(head.join(" — "), "");

    if (bundle.subject) {
      const med = bundle.subject.medium ? ` (${bundle.subject.medium}${bundle.subject.perJob ? ", per-job" : ""})` : "";
      lines.push(`  Subject: ${bundle.subject.label}${med}`);
    }
    if (bundle.derived?.length) {
      lines.push(`  derived (recomputed, never edited directly): ${bundle.derived.join(", ")}`);
    }
    if (bundle.ceremony) {
      const c = bundle.ceremony;
      const tail = c.deviants?.length ? ` — followed by ${c.followed}/${c.total} (deviants: ${c.deviants.join(", ")})`
                                      : ` — followed by ${c.followed}/${c.total}`;
      lines.push(`  mutation ceremony: ${c.steps.join(" · ")}${tail}`);
    }
    if (bundle.subject || bundle.ceremony) lines.push("");

    for (const b of bundle.behaviors) lines.push(`  ${renderBehavior(b)}`);
    lines.push("");
  }
}

function sharedGates(bundle) {
  const sets = bundle.behaviors.map((b) => new Set(b.requires.filter((r) => r.kind === "dependency").map((r) => r.name)));
  if (sets.length === 0) return "";
  const shared = [...sets[0]].filter((g) => sets.every((s) => s.has(g)));
  return shared.join(", ");
}

function renderBehavior(b) {
  const door = `${b.door.method.padEnd(5)} ${b.door.path}`;
  const parts = [];

  const readonly = b.writes.length === 0;
  if (readonly) parts.push(b.untraced.length ? `no writes found · ${b.untraced.length} calls unverified` : "reads only");

  if (b.takes.length) parts.push(`takes ${b.takes.map((t) => t.schema).join(", ")}`);
  if (b.gives.length) parts.push(`returns ${b.gives.map((g) => g.schema).join(", ")}`);

  const reads = byMedium(b.reads);
  for (const [m, ts] of reads) parts.push(`reads ${m} (${ts.join(", ")})`);
  const writes = byMedium(b.writes);
  for (const [m, ts] of writes) parts.push(`stores ${m}${ts.length ? ` (${ts.join(", ")})` : ""}`);

  const config = b.requires.filter((r) => r.kind === "config").map((r) => r.name);
  if (config.length) parts.push(`needs ${config.join(", ")} config`);

  if (b.fails.length) parts.push(`fails with ${b.fails.map((f) => f.status).join(", ")}`);

  return `${door}    ${parts.join(" · ")}`;
}

function byMedium(clauses) {
  const m = new Map();
  for (const c of clauses) {
    if (!m.has(c.medium)) m.set(c.medium, []);
    if (c.target && c.target !== "file") m.get(c.medium).push(c.target);
  }
  return [...m.entries()];
}
