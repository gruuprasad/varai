import path from "node:path";

export function renderInventory({ repoPath, scan }) {
  const lines = [`# App Map — ${path.basename(repoPath)}`, ""];
  const by = groupByKind(scan.facts);

  appendItemSection(lines, "API Routes",          by.api_route          ?? []);
  appendItemSection(lines, "Webhook Routes",       by.webhook_route      ?? []);
  appendItemSection(lines, "Pages",               by.page               ?? []);
  appendItemSection(lines, "Data Models",         by.db_model           ?? []);
  appendItemSection(lines, "Database Migrations", by.database_migration ?? []);
  appendItemSection(lines, "Frontend Stores",     by.state_store        ?? []);
  appendListSection(lines, "Packages",            by.package            ?? []);
  appendListSection(lines, "Env Vars",            by.env_var            ?? []);

  return `${lines.join("\n")}\n`;
}

function groupByKind(facts) {
  const g = {};
  for (const f of facts) (g[f.kind] ??= []).push(f);
  return g;
}

function appendItemSection(lines, title, facts) {
  if (facts.length === 0) return;
  lines.push(`## ${title} (${facts.length})`, "");
  for (const f of facts) {
    const loc = evRef(f.evidence?.[0]);
    lines.push(`  ${f.name.padEnd(42)}${loc}`);
  }
  lines.push("");
}

function appendListSection(lines, title, facts) {
  if (facts.length === 0) return;
  lines.push(`## ${title}`, "");
  lines.push(`  ${facts.map((f) => f.name).join(", ")}`);
  lines.push("");
}

function evRef(ev) {
  if (!ev) return "";
  return ev.line ? `${ev.file}:${ev.line}` : ev.file;
}
