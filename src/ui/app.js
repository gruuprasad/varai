const KIND_META = {
  integration:        { icon: "◎", label: "Integrations",  group: "Infrastructure" },
  service:            { icon: "▣", label: "Services",       group: "Infrastructure" },
  script:             { icon: "▷", label: "Scripts",        group: "Infrastructure" },
  api_route:          { icon: "→", label: "API Routes",     group: "Backend" },
  webhook_route:      { icon: "↵", label: "Webhooks",       group: "Backend" },
  db_model:           { icon: "▤", label: "DB Models",      group: "Backend" },
  schema:             { icon: "{ }", label: "Schemas",      group: "Backend" },
  database_migration: { icon: "↑", label: "Migrations",     group: "Backend" },
  page:               { icon: "□", label: "Pages",          group: "Frontend" },
  state_store:        { icon: "◧", label: "State Stores",   group: "Frontend" },
  api_call:           { icon: "↗", label: "API Calls",      group: "Frontend" },
  component:          { icon: "◈", label: "Components",     group: "Frontend" },
  hook:               { icon: "♯", label: "Hooks",          group: "Frontend" },
  settings_field:     { icon: "◉", label: "Settings",       group: "Config" },
  package:            { icon: "⬡", label: "Packages",       group: "Config" },
  env_var:            { icon: "◌", label: "Env Vars",       group: "Config" },
};

const NAV_GROUPS = [
  { label: "Infrastructure", kinds: ["integration", "service", "script"] },
  { label: "Backend",        kinds: ["api_route", "webhook_route", "db_model", "schema", "database_migration"] },
  { label: "Frontend",       kinds: ["page", "state_store", "api_call", "component", "hook"] },
  { label: "Config",         kinds: ["settings_field", "package", "env_var"] },
];

const STOCK_META = {
  auth:          { label: "Auth" },
  payment:       { label: "Payment" },
  file_storage:  { label: "File Storage" },
  email:         { label: "Email" },
  notifications: { label: "Notifications" },
  settings:      { label: "Settings" },
  health:        { label: "Health" },
};

const STOCK_ORDER = ["auth", "payment", "file_storage", "email", "notifications", "settings", "health"];

// ── Theme toggle ────────────────────────────────────────────────────────────
(function () {
  const saved = localStorage.getItem("varai-theme") || "dark";
  document.documentElement.dataset.theme = saved;
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("varai-theme", next);
    });
  });
})();

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

const el = {
  statusDot:   $("status-dot"),
  statusText:  $("status-text"),
  topbarStats: $("topbar-stats"),
  sidebarNav:  $("sidebar-nav"),
  search:      $("search"),
  searchCount: $("search-count"),
  factsList:   $("facts-list"),
};

let activeKind = null;
let scanData = null;
let diffData = null;

// ── SSE connection ──────────────────────────────────────────────────────────
const es = new EventSource("/api/events");

es.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "scan") {
    setScanData(msg.data);
    setStatus("live", "Live");
  } else if (msg.type === "semantic-diff") {
    diffData = msg.data;
    if (activeKind === "semantic-diff") render();
  } else if (msg.type === "scanning") {
    setStatus("scanning", "Scanning...");
  } else if (msg.type === "error") {
    setStatus("error", "Error");
  }
});

es.addEventListener("open",  () => setStatus("scanning", "Connecting..."));
es.addEventListener("error", () => setStatus("error", "Disconnected"));

fetch("/api/scan")
  .then((r) => r.json())
  .then((data) => { if (data.summary) { setScanData(data); setStatus("live", "Live"); } })
  .catch(() => setStatus("error", "Connection error"));

fetch("/api/diff").then((r) => r.json()).then((data) => { diffData = data; render(); });

// ── State ───────────────────────────────────────────────────────────────────
function setScanData(data) {
  scanData = data;
  render();
}

function setStatus(cls, text) {
  el.statusDot.className = "status-dot " + cls;
  el.statusText.textContent = text;
}

// ── Render ──────────────────────────────────────────────────────────────────
function render() {
  if (!scanData?.summary) return;
  renderStats();
  renderNav();
  if (activeKind === "semantic-diff") renderSemanticDiff();
  else renderFacts();
}

function renderStats() {
  const s = scanData.summary;
  const stacks = (s.stacks || []).join(" · ");
  el.topbarStats.innerHTML =
    `<span><em>${s.fileCount}</em> files</span>` +
    `<span><em>${s.factCount}</em> facts</span>` +
    (stacks ? `<span>${esc(stacks)}</span>` : "");
}

function renderNav() {
  const counts = scanData.summary?.sectionCounts ?? {};
  const total  = scanData.summary?.factCount ?? 0;

  let html = `<div class="nav-all${activeKind === "semantic-diff" ? " active" : ""}" data-kind="semantic-diff">` +
    `<span class="nav-icon">∆</span>` +
    `<span class="nav-name">Progression</span>` +
    `<span class="nav-count">${diffData?.diff?.summary?.clauseChanges ?? 0}</span>` +
    `</div>` +
    `<div class="nav-all${activeKind === null ? " active" : ""}" data-kind="">` +
    `<span class="nav-icon">≡</span>` +
    `<span class="nav-name">All Facts</span>` +
    `<span class="nav-count">${total}</span>` +
    `</div>`;

  const stockCounts = {};
  for (const f of scanData.facts ?? []) {
    for (const tag of f.stock ?? []) stockCounts[tag] = (stockCounts[tag] || 0) + 1;
  }
  const stockTags = Object.keys(stockCounts).sort(
    (a, b) => {
      const ia = STOCK_ORDER.indexOf(a);
      const ib = STOCK_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    }
  );
  if (stockTags.length) {
    html += `<div class="nav-group"><span class="nav-group-label">Standard</span>`;
    for (const tag of stockTags) {
      const meta = STOCK_META[tag] ?? { label: tag };
      html +=
        `<div class="nav-item${activeKind === `stock:${tag}` ? " active" : ""}" data-kind="stock:${tag}">` +
        `<span class="nav-icon">★</span>` +
        `<span class="nav-name">${esc(meta.label)}</span>` +
        `<span class="nav-count">${stockCounts[tag]}</span>` +
        `</div>`;
    }
    html += `</div>`;
  }

  for (const { label, kinds } of NAV_GROUPS) {
    const visible = kinds.filter((k) => counts[k]);
    if (!visible.length) continue;

    html += `<div class="nav-group"><span class="nav-group-label">${esc(label)}</span>`;
    for (const kind of visible) {
      const meta = KIND_META[kind];
      html +=
        `<div class="nav-item${activeKind === kind ? " active" : ""}" data-kind="${kind}">` +
        `<span class="nav-icon">${esc(meta.icon)}</span>` +
        `<span class="nav-name">${esc(meta.label)}</span>` +
        `<span class="nav-count">${counts[kind]}</span>` +
        `</div>`;
    }
    html += `</div>`;
  }

  el.sidebarNav.innerHTML = html;
  el.sidebarNav.querySelectorAll("[data-kind]").forEach((item) => {
    item.addEventListener("click", () => {
      activeKind = item.dataset.kind || null;
      el.search.value = "";
      render();
    });
  });
}

function renderFacts() {
  el.search.closest(".search-wrap").hidden = false;
  const facts = scanData?.facts ?? [];
  const query = el.search.value.toLowerCase().trim();

  let pool;
  if (activeKind?.startsWith("stock:")) {
    const tag = activeKind.slice("stock:".length);
    pool = facts.filter((f) => (f.stock ?? []).includes(tag));
  } else if (activeKind) {
    pool = facts.filter((f) => f.kind === activeKind);
  } else {
    pool = facts;
  }

  if (query) {
    pool = pool.filter(
      (f) => f.name.toLowerCase().includes(query) ||
             (f.evidence || []).some((e) => e.file.toLowerCase().includes(query))
    );
  }

  const meta = activeKind ? (activeKind.startsWith("stock:") ? STOCK_META[activeKind.slice("stock:".length)] : KIND_META[activeKind]) : null;
  const placeholder = meta
    ? `Filter ${pool.length} ${meta.label.toLowerCase()}...`
    : `Filter ${pool.length} facts...`;
  el.search.setAttribute("placeholder", placeholder);
  el.searchCount.textContent = query ? `${pool.length} match${pool.length !== 1 ? "es" : ""}` : "";

  if (pool.length === 0) {
    el.factsList.innerHTML =
      `<div class="empty-state">` +
      `<span class="empty-icon">◌</span>` +
      `<span>${query ? "No matches" : "No facts"}</span>` +
      `</div>`;
    return;
  }

  let html = "";
  let lastKind = null;

  for (const f of pool) {
    if (!activeKind && f.kind !== lastKind) {
      lastKind = f.kind;
      const km = KIND_META[f.kind] ?? { icon: "·", label: f.kind };
      const kindCount = (scanData.summary?.sectionCounts ?? {})[f.kind] ?? 0;
      html +=
        `<div class="section-hdr">` +
        `<span class="section-hdr-icon">${esc(km.icon)}</span>` +
        `<span>${esc(km.label)}</span>` +
        `<span class="section-hdr-count">${kindCount}</span>` +
        `</div>`;
    }

    const ev = f.evidence?.[0];
    const icon = (activeKind ? "" : "");
    let locHtml = "";
    if (ev?.file) {
      const line = ev.line ? `<span class="fact-loc-line">:${ev.line}</span>` : "";
      locHtml = `<div class="fact-loc"><span class="fact-loc-file">${esc(ev.file)}</span>${line}</div>`;
    }

    const stockChips = (f.stock ?? [])
      .map((t) => `<span class="stock-chip">${esc(t)}</span>`)
      .join("");

    html +=
      `<div class="fact-row">` +
      (activeKind
        ? `<span class="fact-icon">${esc(KIND_META[activeKind]?.icon ?? "·")}</span>`
        : "") +
      `<div class="fact-body">` +
      `<div class="fact-name" title="${esc(f.name)}">${esc(f.name)}</div>` +
      (stockChips ? `<div class="fact-chips">${stockChips}</div>` : "") +
      locHtml +
      `</div></div>`;
  }

  el.factsList.innerHTML = html;
}

function diffEvidence(value) {
  return (value?.evidence ?? []).map((item) => `${esc(item.file)}${item.line ? `:${item.line}` : ""}`).join(", ") || "no evidence";
}

function diffClause(kind, clause) {
  if (kind === "requires") return `needs ${esc(clause.name)}`;
  if (kind === "takes" || kind === "gives") return `${kind} ${esc(clause.schema ?? clause.name ?? "unknown")}`;
  if (kind === "reads" || kind === "writes") return `${kind} ${esc(clause.medium)}:${esc(clause.target ?? clause.detail ?? "unknown")}`;
  if (kind === "fails") return `fails ${esc(clause.status ?? clause.reason ?? "unknown")}`;
  if (kind === "guards" && clause.kind === "disabled_when") return `disabled when ${esc(clause.condition)}`;
  return `${kind} ${esc(clause.call ?? "")}`;
}

function diffDoor(door) {
  if (door.kind === "ui_action") return `${esc(door.component)} ${esc(door.action === "onClose" ? "dismissal" : door.action)}`;
  return `${esc(door.method)} ${esc(door.path)}`;
}

function renderSemanticDiff() {
  el.search.closest(".search-wrap").hidden = true;
  if (diffData?.error) {
    el.factsList.innerHTML = `<div class="empty-state"><span class="empty-icon">△</span><span>${esc(diffData.error)}</span></div>`;
    return;
  }
  const diff = diffData?.diff;
  if (!diff) return;
  if (!diff.summary.hasChanges) {
    const evidenceHint = diff.summary.hasEvidenceChanges
      ? `<small>${diff.summary.evidenceChanges} evidence locations moved</small>`
      : "";
    el.factsList.innerHTML = `<div class="empty-state"><span class="empty-icon">✓</span><span>No semantic changes from the HEAD baseline</span>${evidenceHint}</div>`;
    return;
  }
  let html = `<div class="diff-summary"><strong>Semantic progression</strong><span>+${diff.summary.behaviorsAdded} −${diff.summary.behaviorsRemoved} ~${diff.summary.behaviorsChanged} behaviors</span></div>`;
  for (const behavior of diff.behaviors.added) {
    html += `<article class="diff-card added"><h3>+ ${diffDoor(behavior.door)}</h3><p>${diffEvidence(behavior.door)}</p></article>`;
  }
  for (const behavior of diff.behaviors.removed) {
    html += `<article class="diff-card removed"><h3>− ${diffDoor(behavior.door)}</h3><p>${diffEvidence(behavior.door)}</p></article>`;
  }
  for (const behavior of diff.behaviors.changed) {
    html += `<article class="diff-card changed"><h3>~ ${diffDoor(behavior.door)}</h3><ul>`;
    for (const change of behavior.clauses) {
      if (change.change === "claim-state") html += `<li class="risk">! ${diffClause(change.kind, change.after)}: ${esc(change.before.claimState)} → ${esc(change.after.claimState)}</li>`;
      else html += `<li>${change.change === "added" ? "+" : "−"} ${diffClause(change.kind, change.clause)} <small>${diffEvidence(change.clause)}</small></li>`;
    }
    html += `</ul></article>`;
  }
  if (diff.summary.hasEvidenceChanges) html += `<div class="diff-summary"><span>${diff.summary.evidenceChanges} evidence locations moved</span><span>Available in JSON or CLI detail</span></div>`;
  el.factsList.innerHTML = html;
}

el.search.addEventListener("input", renderFacts);
