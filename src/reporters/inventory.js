import path from "node:path";

const COL = 42;

export function renderInventory({ repoPath, scan }) {
  const lines = [];
  const name = path.basename(repoPath);
  lines.push(`# App Map — ${name}`, "");

  appendSummary(lines, scan);

  appendStandardPatternsSection(lines, scan.facts);

  const by = groupByKind(scan.facts);

  appendIntegrationSection(lines, by.integration ?? []);
  appendRunnableSection(lines, "Services",         by.service ?? []);
  appendRunnableSection(lines, "Scripts",          by.script  ?? []);
  appendItemSection(lines, "API Routes",          by.api_route          ?? []);
  appendItemSection(lines, "Webhook Routes",       by.webhook_route      ?? []);
  appendItemSection(lines, "Pages",               by.page               ?? []);
  appendItemSection(lines, "Data Models",         by.db_model           ?? []);
  appendItemSection(lines, "Schemas",             by.schema             ?? []);
  appendItemSection(lines, "Database Migrations", by.database_migration ?? []);
  appendItemSection(lines, "Frontend Stores",     by.state_store        ?? []);
  appendItemSection(lines, "API Calls",           by.api_call           ?? []);
  appendItemSection(lines, "Components",          by.component          ?? [], { cap: 60 });
  appendItemSection(lines, "Hooks",               by.hook               ?? []);
  appendListSection(lines, "Settings Fields",     by.settings_field     ?? []);
  appendPackageSection(lines, by.package ?? []);
  appendListSection(lines, "Env Vars",            by.env_var            ?? []);

  return `${lines.join("\n")}\n`;
}

function appendSummary(lines, scan) {
  const summary = scan?.summary;
  const stacks = scan?.stacks;
  if (!summary) return;

  lines.push("| Field | Value |");
  lines.push("|-------|-------|");
  lines.push(`| Files | ${summary.fileCount ?? 0} |`);
  lines.push(`| Facts | ${summary.factCount ?? 0} |`);
  if (stacks && stacks.length > 0) {
    lines.push(`| Stacks | ${stacks.join(", ")} |`);
  }
  if (summary.sectionCounts) {
    for (const [kind, count] of Object.entries(summary.sectionCounts)) {
      lines.push(`| ${kind} | ${count} |`);
    }
  }
  lines.push("");
}

function groupByKind(facts) {
  const g = {};
  for (const f of facts) (g[f.kind] ??= []).push(f);
  return g;
}

function appendItemSection(lines, title, facts, opts = {}) {
  if (facts.length === 0) return;

  const cap = opts.cap ?? Infinity;
  const displayFacts = facts.slice(0, cap);
  const suffix = cap < facts.length ? ` (showing ${cap} of ${facts.length})` : "";

  lines.push(`## ${title} (${facts.length})${suffix}`, "");
  for (const f of displayFacts) {
    const loc = evRef(f.evidence?.[0]);
    writeTwoCol(lines, f.name, loc);
  }
  lines.push("");
}

function appendListSection(lines, title, facts) {
  if (facts.length === 0) return;
  lines.push(`## ${title}`, "");
  lines.push(`  ${facts.map((f) => f.name).join(", ")}`);
  lines.push("");
}

function appendRunnableSection(lines, title, facts) {
  if (facts.length === 0) return;
  lines.push(`## ${title} (${facts.length})`, "");
  for (const f of facts) {
    const tag = f.source ?? f.runner ?? "";
    writeTwoCol(lines, f.name, tag ? `${evRef(f.evidence?.[0])}  [${tag}]` : evRef(f.evidence?.[0]));
  }
  lines.push("");
}

function appendIntegrationSection(lines, facts) {
  if (facts.length === 0) return;
  lines.push(`## External Integrations (${facts.length})`, "");
  for (const f of facts) {
    const signals = [];
    if (f.signals?.packages?.length) signals.push(f.signals.packages.join(", "));
    if (f.signals?.envVars?.length) signals.push(f.signals.envVars.join(", "));
    const detail = `${f.category ?? "service"} — ${signals.join("; ")}`;
    writeTwoCol(lines, f.name, detail);
  }
  lines.push("");
}

function appendPackageSection(lines, facts) {
  if (facts.length === 0) return;
  lines.push(`## Packages`, "");

  const byEco = {};
  for (const f of facts) {
    const eco = f.ecosystem ?? "unknown";
    (byEco[eco] ??= []).push(f.name);
  }

  for (const [eco, names] of Object.entries(byEco)) {
    lines.push(`  ${eco}: ${names.join(", ")}`);
  }
  lines.push("");
}

function writeTwoCol(lines, name, loc) {
  if (name.length < COL) {
    lines.push(`  ${name.padEnd(COL)}  ${loc}`);
  } else {
    lines.push(`  ${name}`);
    lines.push(`  ${"".padEnd(COL)}  ${loc}`);
  }
}

function evRef(ev) {
  if (!ev) return "";
  return ev.line ? `${ev.file}:${ev.line}` : ev.file;
}

const STOCK_LABELS = {
  auth: "Auth",
  payment: "Payment",
  file_storage: "File Storage",
  email: "Email",
  notifications: "Notifications",
  settings: "Settings",
  health: "Health",
};

const STOCK_ORDER = ["auth", "payment", "file_storage", "email", "notifications", "settings", "health"];

function appendStandardPatternsSection(lines, facts) {
  const grouped = new Map();
  for (const f of facts) {
    for (const tag of f.stock ?? []) {
      if (!grouped.has(tag)) grouped.set(tag, []);
      grouped.get(tag).push(f);
    }
  }
  if (grouped.size === 0) return;

  const sortedTags = [...grouped.keys()].sort(
    (a, b) => {
      const ia = STOCK_ORDER.indexOf(a);
      const ib = STOCK_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    }
  );

  lines.push(`## Standard Patterns (${sortedTags.length})`, "");
  for (const tag of sortedTags) {
    const label = STOCK_LABELS[tag] ?? tag;
    const list = grouped.get(tag);
    lines.push(`### ${label} (${list.length})`, "");
    for (const f of list) {
      const loc = evRef(f.evidence?.[0]);
      writeTwoCol(lines, f.name, loc);
    }
    lines.push("");
  }
}
