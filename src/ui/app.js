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

// ── SSE connection ──────────────────────────────────────────────────────────
const es = new EventSource("/api/events");

es.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "scan") {
    setScanData(msg.data);
    setStatus("live", "Live");
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
  renderFacts();
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

  let html = `<div class="nav-all${activeKind === null ? " active" : ""}" data-kind="">` +
    `<span class="nav-icon">≡</span>` +
    `<span class="nav-name">All Facts</span>` +
    `<span class="nav-count">${total}</span>` +
    `</div>`;

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
  const facts = scanData?.facts ?? [];
  const query = el.search.value.toLowerCase().trim();

  let pool = activeKind ? facts.filter((f) => f.kind === activeKind) : facts;

  if (query) {
    pool = pool.filter(
      (f) => f.name.toLowerCase().includes(query) ||
             (f.evidence || []).some((e) => e.file.toLowerCase().includes(query))
    );
  }

  const meta = activeKind ? KIND_META[activeKind] : null;
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

    html +=
      `<div class="fact-row">` +
      (activeKind
        ? `<span class="fact-icon">${esc(KIND_META[activeKind]?.icon ?? "·")}</span>`
        : "") +
      `<div class="fact-body">` +
      `<div class="fact-name" title="${esc(f.name)}">${esc(f.name)}</div>` +
      locHtml +
      `</div></div>`;
  }

  el.factsList.innerHTML = html;
}

el.search.addEventListener("input", renderFacts);
