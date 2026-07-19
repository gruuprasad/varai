const LENS_META = {
  api: { icon: "→", label: "API" }, ui: { icon: "□", label: "UI" }, worker: { icon: "◇", label: "Workers" },
  cli: { icon: "▷", label: "CLI" }, data: { icon: "▤", label: "Data" }, service: { icon: "▣", label: "Services" },
  library: { icon: "⬡", label: "Libraries" }, application: { icon: "◎", label: "Application" },
};

const RELATIONS = {
  contains: "contains", exposes: "exposes", offers: "offers", triggered_by: "is triggered by", invokes: "invokes",
  accepts: "accepts", produces: "produces", requires: "requires", available_when: "is available when", reads: "reads",
  changes: "changes", creates: "creates", removes: "removes", succeeds_with: "succeeds with", fails_with: "fails with",
  navigates_to: "navigates to", emits: "emits", has_field: "has field", relates_to: "relates to", stored_in: "is stored in",
};

(function setupTheme() {
  document.documentElement.dataset.theme = localStorage.getItem("varai-theme") || "dark";
  document.addEventListener("DOMContentLoaded", () => $("theme-toggle")?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("varai-theme", next);
  }));
})();

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const el = {
  statusDot: $("status-dot"), statusText: $("status-text"), topbarStats: $("topbar-stats"), sidebarNav: $("sidebar-nav"),
  search: $("search"), searchCount: $("search-count"), list: $("elements-list"),
};

let activeView = "things";
let expandedId = null;
let showAllThings = false;
let scanData = null;
let diffData = null;

const events = new EventSource("/api/events");
events.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.type === "model") {
    scanData = message.data;
    setStatus("live", "Live");
    render();
  } else if (message.type === "semantic-diff") {
    diffData = message.data;
    render();
  } else if (message.type === "error") setStatus("error", "Error");
});
events.addEventListener("open", () => setStatus("scanning", "Connecting..."));
events.addEventListener("error", () => setStatus("error", "Disconnected"));

fetch("/api/model").then((response) => response.json()).then((data) => {
  if (data.model) {
    scanData = data;
    setStatus("live", "Live");
    render();
  }
}).catch(() => setStatus("error", "Connection error"));
fetch("/api/diff").then((response) => response.json()).then((data) => { diffData = data; render(); });

function setStatus(kind, text) {
  el.statusDot.className = `status-dot ${kind}`;
  el.statusText.textContent = text;
}

function indexes() {
  const model = scanData.model;
  return {
    byId: new Map([...model.subsystems, ...model.elements, ...model.claims].map((item) => [item.id, item])),
    subsystemById: new Map(model.subsystems.map((item) => [item.id, item])),
    claimsBySource: model.claims.reduce((map, claim) => {
      const values = map.get(claim.sourceId) ?? [];
      values.push(claim);
      map.set(claim.sourceId, values);
      return map;
    }, new Map()),
  };
}

function render() {
  if (!scanData?.model) return;
  renderStats();
  renderNav();
  if (activeView === "progression") renderProgression();
  else if (activeView === "coverage") renderCoverage();
  else if (activeView === "capabilities") renderCapabilities();
  else if (activeView === "all") renderAllElements();
  else renderThings();
}

function renderStats() {
  const summary = scanData.summary;
  const stacks = (summary.stacks ?? []).join(" · ");
  el.topbarStats.innerHTML = `<span><em>${summary.fileCount}</em> files</span><span><em>${summary.elementCount}</em> elements</span>` +
    `<span><em>${summary.claimCount}</em> claims</span>${stacks ? `<span>${esc(stacks)}</span>` : ""}`;
}

function renderNav() {
  const things = scanData.projections?.things?.roots?.length ?? 0;
  const capabilities = scanData.projections?.capabilities?.capabilities?.length ?? 0;
  const progression = diffData?.diff?.summary?.semanticChanges ?? 0;
  el.sidebarNav.innerHTML = navItem("progression", "∆", "Progression", progression) +
    `<div class="nav-group"><span class="nav-group-label">System lens</span>` +
    navItem("things", "◎", "Things", things, "nav-item") +
    navItem("capabilities", "↳", "Capabilities", capabilities, "nav-item") +
    navItem("all", "≡", "All elements", scanData.model.elements.length, "nav-item") +
    `</div>${navItem("coverage", "◌", "Coverage", scanData.model.coverage.length)}`;
  el.sidebarNav.querySelectorAll("[data-view]").forEach((item) => item.addEventListener("click", () => {
    activeView = item.dataset.view;
    expandedId = null;
    showAllThings = false;
    el.search.value = "";
    render();
  }));
}

function navItem(view, icon, name, count, className = "nav-all") {
  return `<button class="${className}${activeView === view ? " active" : ""}" data-view="${view}">` +
    `<span class="nav-icon">${esc(icon)}</span><span class="nav-name">${esc(name)}</span><span class="nav-count">${count}</span></button>`;
}

function showSearch(placeholder) {
  el.search.closest(".search-wrap").hidden = false;
  el.search.placeholder = placeholder;
}

function renderThings() {
  const projection = scanData.projections?.things;
  if (!projection) return renderMissingProjection();
  const { byId, claimsBySource } = indexes();
  const query = el.search.value.toLowerCase().trim();
  const matchingRoots = projection.roots.filter((root) => {
    if (!query) return true;
    const names = [byId.get(root.elementId)?.name, ...root.behaviorIds.map((id) => byId.get(id)?.name)];
    return names.some((name) => name?.toLowerCase().includes(query));
  });
  const roots = query || showAllThings ? matchingRoots : matchingRoots.slice(0, 24);
  showSearch(`Find a system thing or behavior across ${projection.roots.length} roots...`);
  el.searchCount.textContent = query ? `${roots.length} matches` : `${roots.length} of ${projection.roots.length}`;
  if (!roots.length) return renderEmpty("No system subjects or surfaces match this search");

  el.list.innerHTML = `<div class="view-intro"><span class="eyebrow">SUBJECT MAP</span><h1>What the system is about</h1>` +
    `<p>Open a thing to see what acts on it, how those behaviors are reached, and where the implementation runs.</p></div>` +
    roots.map((root, index) => thingCard(root, index, byId, claimsBySource)).join("") +
    (!query && projection.roots.length > roots.length ? `<button class="show-all" id="show-all-things">Show all ${projection.roots.length} system things</button>` : "");
  bindExpanders();
  $("show-all-things")?.addEventListener("click", () => { showAllThings = true; renderThings(); });
}

function thingCard(root, index, byId, claimsBySource) {
  const item = byId.get(root.elementId);
  const open = expandedId === root.elementId;
  const state = item.claimState === "observed" ? "" : `<span class="state-pill">${esc(item.claimState)}</span>`;
  let detail = "";
  if (open) {
    detail = `<div class="anchor-detail">${root.behaviorIds.length ? root.behaviorIds.map((id) => behaviorBlock(byId.get(id), root.interfaceIds, byId, claimsBySource)).join("") : `<p class="empty-copy">No connected behavior recovered within current coverage.</p>`}</div>`;
  }
  return `<article class="anchor-card${open ? " open" : ""}" style="--order:${index}">` +
    `<button class="anchor-head" data-expand="${esc(root.elementId)}" aria-expanded="${open}">` +
    `<span class="anchor-glyph">${item.kind === "screen" || item.kind === "surface" ? "□" : "◉"}</span>` +
    `<span class="anchor-title"><small>${esc(item.kind)}</small><strong>${esc(item.name)}</strong></span>${state}` +
    `<span class="behavior-count"><b>${root.behaviorIds.length}</b> behaviors</span><span class="chevron">⌄</span></button>${detail}</article>`;
}

function behaviorBlock(behavior, interfaceIds, byId, claimsBySource) {
  const claims = claimsBySource.get(behavior.id) ?? [];
  const interfaces = interfaceIds.map((id) => byId.get(id)).filter((item) => item && (item.id === behavior.id ||
    (claimsBySource.get(item.id) ?? []).some((claim) => claim.relation === "offers" && claim.target.id === behavior.id)));
  return `<section class="behavior-block"><div class="behavior-heading"><span>BEHAVIOR</span><h3>${esc(behavior.name)}</h3>` +
    `${interfaces.length ? `<p>reached through ${interfaces.map((item) => esc(item.name)).join(" · ")}</p>` : ""}</div>` +
    `<div class="claim-grid">${claims.length ? claims.map((claim) => claimRow(claim, byId)).join("") : `<p class="empty-copy">No contract or effect claims recovered.</p>`}</div></section>`;
}

function claimRow(claim, byId) {
  const target = claim.target.kind === "reference" ? byId.get(claim.target.id)?.name ?? claim.target.id : claim.target.value;
  const trace = claim.implementationPath ?? [];
  return `<div class="claim-row"><div class="claim-line"><span class="relation">${esc(RELATIONS[claim.relation] ?? claim.relation)}</span>` +
    `<strong>${esc(target)}</strong>${claim.claimState === "observed" ? "" : `<span class="state-pill">${esc(claim.claimState)}</span>`}</div>` +
    `${trace.length ? `<ol class="trace-path">${trace.map((step, index) => `<li><span>${index + 1}</span><code>${esc(step.symbol ? `${step.symbol} · ${step.file}` : step.file)}${step.line ? `:${step.line}` : ""}</code></li>`).join("")}</ol>` : `<small>${evidence(claim)}</small>`}</div>`;
}

function renderCapabilities() {
  const projection = scanData.projections?.capabilities;
  if (!projection) return renderMissingProjection();
  const { byId, claimsBySource } = indexes();
  const query = el.search.value.toLowerCase().trim();
  const items = projection.capabilities.filter((item) => {
    const names = [byId.get(item.behaviorId)?.name, ...item.resourceIds.map((id) => byId.get(id)?.name)];
    return !query || names.some((name) => name?.toLowerCase().includes(query));
  });
  showSearch(`Find a behavior across ${projection.capabilities.length} capabilities...`);
  el.searchCount.textContent = query ? `${items.length} matches` : "";
  el.list.innerHTML = `<div class="view-intro"><span class="eyebrow">CAPABILITY INDEX</span><h1>What the system can do</h1>` +
    `<p>Behaviors stay distinct even when they act on the same system thing.</p></div>` + items.map((item, index) => {
      const behavior = byId.get(item.behaviorId);
      const open = expandedId === behavior.id;
      const resources = item.resourceIds.map((id) => byId.get(id)?.name).filter(Boolean);
      return `<article class="anchor-card${open ? " open" : ""}" style="--order:${index}"><button class="anchor-head" data-expand="${esc(behavior.id)}" aria-expanded="${open}">` +
        `<span class="anchor-glyph">↳</span><span class="anchor-title"><small>behavior</small><strong>${esc(behavior.name)}</strong></span>` +
        `<span class="behavior-count">${resources.length ? `acts on <b>${esc(resources.join(", "))}</b>` : "no resolved subject"}</span><span class="chevron">⌄</span></button>` +
        `${open ? `<div class="anchor-detail">${behaviorBlock(behavior, item.interfaceIds, byId, claimsBySource)}</div>` : ""}</article>`;
    }).join("");
  bindExpanders();
}

function renderAllElements() {
  const { byId, subsystemById, claimsBySource } = indexes();
  const query = el.search.value.toLowerCase().trim();
  const elements = scanData.model.elements.filter((item) => !query || item.name.toLowerCase().includes(query) || item.evidence.some((entry) => entry.file.toLowerCase().includes(query)));
  showSearch(`Search all ${scanData.model.elements.length} semantic elements and source paths...`);
  el.searchCount.textContent = query ? `${elements.length} matches` : "";
  if (!elements.length) return renderEmpty("No semantic elements match this search");
  el.list.innerHTML = elements.map((item) => {
    const subsystem = subsystemById.get(item.subsystemId);
    const meta = LENS_META[subsystem?.lens] ?? { icon: "·", label: subsystem?.name ?? "System" };
    return `<article class="diff-card"><h3>${esc(meta.icon)} ${esc(item.name)}</h3><p>${esc(item.kind)} · ${esc(item.roles.join(", "))}</p>` +
      `<ul>${(claimsBySource.get(item.id) ?? []).map((claim) => `<li>${claimText(claim, byId)}</li>`).join("")}</ul><small>${evidence(item)}</small></article>`;
  }).join("");
}

function bindExpanders() {
  el.list.querySelectorAll("[data-expand]").forEach((button) => button.addEventListener("click", () => {
    expandedId = expandedId === button.dataset.expand ? null : button.dataset.expand;
    render();
    if (expandedId) requestAnimationFrame(() => el.list.querySelector(`[data-expand="${CSS.escape(expandedId)}"]`)?.focus());
  }));
}

function renderCoverage() {
  el.search.closest(".search-wrap").hidden = true;
  el.list.innerHTML = `<div class="view-intro"><span class="eyebrow">ANALYZER REACH</span><h1>What Varai could determine</h1></div>` +
    (scanData.model.coverage.length ? scanData.model.coverage.map((item) => `<article class="diff-card"><h3>${esc(item.capability)}</h3><p>${esc(item.state)}</p><small>${esc(item.details.join("; "))}</small></article>`).join("") : emptyMarkup("No analyzer coverage declared"));
}

function renderProgression() {
  el.search.closest(".search-wrap").hidden = true;
  if (diffData?.error) return renderEmpty(diffData.error);
  const diff = diffData?.diff;
  if (!diff) return;
  if (!diff.summary.hasChanges) return renderEmpty("No semantic changes within declared coverage");
  let html = `<div class="view-intro"><span class="eyebrow">SEMANTIC PROGRESSION</span><h1>${diff.summary.semanticChanges} system changes</h1></div>`;
  for (const item of diff.elements.added) html += changeCard("added", "+", item.name, `${item.kind} · ${evidence(item)}`);
  for (const item of diff.elements.removed) html += changeCard("removed", "−", item.name, `${item.kind} · ${evidence(item)}`);
  for (const item of diff.claims.added) html += changeCard("added", "+", diff.labels[item.sourceId] ?? item.sourceId, claimDiffText(item, diff));
  for (const item of diff.claims.removed) html += changeCard("removed", "−", diff.labels[item.sourceId] ?? item.sourceId, claimDiffText(item, diff));
  for (const item of diff.claims.changed) html += changeCard("changed", "~", diff.labels[item.after.sourceId] ?? item.after.sourceId, "Claim changed");
  el.list.innerHTML = html;
}

function claimDiffText(item, diff) {
  const target = item.target.kind === "reference" ? diff.labels[item.target.id] ?? item.target.id : item.target.value;
  return `${RELATIONS[item.relation] ?? item.relation} ${target}`;
}

function claimText(claim, byId) {
  const target = claim.target.kind === "reference" ? byId.get(claim.target.id)?.name ?? claim.target.id : claim.target.value;
  return `${esc(RELATIONS[claim.relation] ?? claim.relation)} ${esc(target)}`;
}

function evidence(item) {
  return (item.evidence ?? []).map((entry) => `${esc(entry.file)}${entry.line ? `:${entry.line}` : ""}`).join(", ") || "no direct evidence";
}

function changeCard(kind, symbol, name, detail) {
  return `<article class="diff-card ${kind}"><h3>${symbol} ${esc(name)}</h3><p>${esc(detail)}</p></article>`;
}

function renderMissingProjection() { renderEmpty("This scan does not include anchor projections yet"); }
function renderEmpty(message) { el.list.innerHTML = emptyMarkup(message); }
function emptyMarkup(message) { return `<div class="empty-state"><span class="empty-icon">◌</span><span>${esc(message)}</span></div>`; }

el.search.addEventListener("input", render);
