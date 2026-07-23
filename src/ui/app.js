import {
  collectChangedClaimIds,
  renderObservedAreasOutline,
} from "./observed-areas-view.js";
import {
  renderQuestions,
  renderReviewActions,
  renderSeedDiff,
  renderSeedStatus,
  renderDraftStructure,
  renderProblems,
  renderUnsupported,
} from "./intent-view.js";
import {
  renderCardDetail,
  renderCompactCard,
  renderCoverageLimitations,
  renderGroupHeading,
  renderReviewOverview,
} from "./review-view.js";

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

(function setupTheme() {
  document.documentElement.dataset.theme = localStorage.getItem("varai-theme") || "light";
  document.addEventListener("DOMContentLoaded", () => $("theme-toggle")?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("varai-theme", next);
  }));
})();

const el = {
  statusDot: $("status-dot"), statusText: $("status-text"), topbarStats: $("topbar-stats"),
  sidebarNav: $("sidebar-nav"), search: $("search"), searchClear: $("search-clear"), searchCount: $("search-count"),
  bentoGrid: $("bento-grid"), focusContent: $("focus-content"), 
  gridLayer: $("grid-layer"), focusLayer: $("focus-layer"), backBtn: $("back-btn"),
};

if (el.backBtn) {
  el.backBtn.addEventListener("click", () => {
    expandedId = null;
    render();
  });
}

let activeView = "system";
let expandedId = null;
let changesOnly = false;
let scanData = null;
let diffData = null;
let seedData = null;
let reconciliationData = null;
const snippetCache = new Map();
const openSnippets = new Set();

const events = new EventSource("/api/events");
events.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.type === "model") { scanData = message.data; setStatus("live", "Live"); refreshSeed(); render(); }
  else if (message.type === "semantic-diff") { diffData = message.data; render(); }
  else if (message.type === "seed") { refreshSeed(); }
  else if (message.type === "error") setStatus("error", "Error");
});
events.addEventListener("open", () => setStatus("scanning", "Connecting..."));
events.addEventListener("error", () => setStatus("error", "Disconnected"));

fetch("/api/model").then((response) => response.json()).then((data) => {
  if (data.model) { scanData = data; setStatus("live", "Live"); render(); }
}).catch(() => setStatus("error", "Connection error"));
fetch("/api/diff").then((response) => response.json()).then((data) => { diffData = data; render(); }).catch(() => {});

function refreshSeed() {
  fetch("/api/seed").then((response) => response.json()).then((data) => { seedData = data; render(); }).catch(() => {});
  fetch("/api/reconciliation").then((response) => response.json()).then((data) => { reconciliationData = data; render(); }).catch(() => {});
}
refreshSeed();

function setStatus(kind, text) {
  if (el.statusDot) el.statusDot.className = `status-dot ${kind}`;
  if (el.statusText) el.statusText.textContent = text;
}

function language() {
  return scanData?.displayLanguage ?? { relations: {}, kinds: {}, claimStates: {} };
}
const relationLabel = (relation) => language().relations[relation] ?? relation;
const kindLabel = (kind) => language().kinds[kind] ?? kind;
const stateLabel = (state) => language().claimStates[state] ?? state;

function indexes() {
  const model = scanData.model;
  const byId = new Map([...model.subsystems, ...model.elements, ...model.claims].map((item) => [item.id, item]));
  const claimsBySource = new Map();
  for (const claim of model.claims) {
    const list = claimsBySource.get(claim.sourceId) ?? [];
    list.push(claim);
    claimsBySource.set(claim.sourceId, list);
  }
  return { byId, claimsBySource };
}

function projectionIndexes() {
  const frames = scanData.projections?.frames?.frames ?? [];
  const paths = scanData.projections?.paths?.paths ?? [];
  const envelopes = scanData.projections?.envelopes?.envelopes ?? [];
  const frameByBehavior = new Map(frames.map((item) => [item.behaviorId, item]));
  const pathsByBehavior = new Map();
  for (const path of paths) {
    for (const step of path.steps) {
      const values = pathsByBehavior.get(step.behaviorId) ?? [];
      values.push(path);
      pathsByBehavior.set(step.behaviorId, values);
    }
  }
  return { frames, paths, envelopes, frameByBehavior, pathsByBehavior };
}

function changedIds() {
  const ids = new Set();
  const diff = diffData?.diff;
  if (!diff) return ids;
  for (const item of diff.elements.added) ids.add(item.id);
  for (const item of diff.elements.changed) ids.add(item.after.id);
  for (const item of diff.claims.added) ids.add(item.sourceId);
  for (const item of diff.claims.removed) ids.add(item.sourceId);
  for (const item of diff.claims.changed) ids.add(item.after.sourceId);
  return ids;
}

function rootChanged(root, changed) {
  return changed.has(root.elementId) ||
    root.behaviorIds.some((id) => changed.has(id)) ||
    root.surfaceIds.some((id) => changed.has(id));
}

function renderPanes(masterHtml, detailHtml) {
  if (el.bentoGrid) el.bentoGrid.innerHTML = masterHtml;
  if (el.focusContent) el.focusContent.innerHTML = detailHtml || emptyDetailPlaceholder();
  
  if (expandedId) {
    el.gridLayer?.classList.remove("active");
    el.focusLayer?.classList.add("active");
  } else {
    el.focusLayer?.classList.remove("active");
    el.gridLayer?.classList.add("active");
  }

  bindExpanders();
  bindSnippets();
}

function emptyDetailPlaceholder(title = "Select an item", message = "Select an item from the list to view full details.") {
  return `<div class="detail-placeholder">` +
    `<div class="empty-icon"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="14" y1="9" x2="18" y2="9"/><line x1="14" y1="13" x2="18" y2="13"/><line x1="14" y1="17" x2="18" y2="17"/></svg></div>` +
    `<h3>${esc(title)}</h3>` +
    `<p class="empty-copy">${esc(message)}</p></div>`;
}

function render() {
  if (activeView === "intent") {
    renderTopbar();
    renderNav();
    renderIntent();
    return;
  }
  if (activeView === "review") {
    renderTopbar();
    renderNav();
    renderReview();
    return;
  }
  if (!scanData?.model) return;
  renderTopbar();
  renderNav();
  if (activeView === "subjects") renderSubjects();
  else if (activeView === "capabilities") renderCapabilities();
  else if (activeView === "changes") renderChanges();
  else if (activeView === "everything") renderEverything();
  else if (activeView === "unknowns") renderUnknowns();
  else renderObservedAreas();
}

function renderTopbar() {
  const areas = scanData?.projections?.observedAreas?.areas ?? [];
  const cores = scanData?.projections?.observedAreas?.sharedCores ?? [];
  const operations = areas.reduce((sum, area) => sum + area.operationCount, 0);
  const primaryOperations = areas.reduce((sum, area) => sum + (area.primaryOperationCount ?? area.operationCount), 0);
  el.topbarStats.innerHTML =
    `<span class="stat-pill"><strong>${areas.length}</strong> observed areas</span>` +
    `<span class="stat-pill"><strong>${primaryOperations}</strong> primary · ${operations} operations</span>` +
    `<span class="stat-pill"><strong>${cores.length}</strong> shared parts</span>`;
}

const NAV_ICONS = {
  system: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>`,
  subjects: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  capabilities: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  changes: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>`,
  everything: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  unknowns: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
};

function renderNav() {
  const changes = diffData?.diff?.summary?.semanticChanges ?? 0;
  el.sidebarNav.innerHTML =
    navItem("intent", "✦", "Intent", null) +
    navItem("review", "✓", "Review", null) +
    navItem("system", "◎", "Observed areas", null) +
    navItem("subjects", "◈", "Subjects", null) +
    navItem("capabilities", "↳", "Capabilities", null) +
    navItem("changes", "∆", "Changes", changes || null) +
    `<div class="nav-group"><span class="nav-group-label">Advanced</span>` +
    navItem("everything", "≡", "Everything", scanData?.model?.elements?.length ?? 0) +
    navItem("unknowns", "◌", "Couldn't determine", scanData?.model?.coverage?.length ?? 0) +
    `</div>`;
  el.sidebarNav.querySelectorAll("[data-view]").forEach((item) => item.addEventListener("click", () => {
    activeView = item.dataset.view;
    expandedId = null;
    changesOnly = false;
    el.search.value = "";
    if (el.searchClear) el.searchClear.hidden = true;
    render();
  }));
}

function navItem(view, fallbackIcon, name, count) {
  const iconSvg = NAV_ICONS[view] || esc(fallbackIcon);
  return `<button class="nav-item${activeView === view ? " active" : ""}" data-view="${view}">` +
    `<span class="nav-icon">${iconSvg}</span><span class="nav-name">${esc(name)}</span>` +
    `${count == null ? "" : `<span class="nav-count">${count}</span>`}</button>`;
}

function showSearch(placeholder) {
  el.search.closest(".search-wrap").hidden = false;
  el.search.placeholder = placeholder;
}

function stateMark(state) {
  const label = stateLabel(state);
  return label ? `<span class="state-mark">${esc(label)}</span>` : "";
}

function changeBadge() {
  return `<span class="change-badge">changed</span>`;
}

function pathStatus(completeness) {
  if (!completeness) return "";
  return `<span class="path-status path-${esc(completeness)}">${esc(completeness)}</span>`;
}

function matchRoot(root, byId, query) {
  if (!query) return true;
  const names = [byId.get(root.elementId)?.name,
    ...root.behaviorIds.map((id) => byId.get(id)?.name),
    ...root.surfaceIds.map((id) => byId.get(id)?.name)];
  return names.some((name) => name?.toLowerCase().includes(query));
}

function renderObservedAreas() {
  const projection = scanData.projections?.observedAreas;
  if (!projection) return renderEmpty("This scan does not include observed areas yet");
  const { byId } = indexes();
  const envelopesById = new Map((scanData.projections?.envelopes?.envelopes ?? []).map((item) => [item.id, item]));
  const pathsById = new Map((scanData.projections?.paths?.paths ?? []).map((item) => [item.id, item]));
  const claimsById = new Map(scanData.model.claims.map((item) => [item.id, item]));
  const changedElements = changedIds();
  const changedClaims = collectChangedClaimIds(diffData?.diff);
  const query = el.search.value.toLowerCase().trim();
  showSearch("Find an observed area, operation, or shared part...");

  const rendered = renderObservedAreasOutline({
    projection,
    byId,
    envelopesById,
    pathsById,
    claimsById,
    query,
    changesOnly,
    changedElements,
    changedClaims,
    expandedId,
    relationLabel,
    kindLabel,
    stateMark,
    changeBadge,
    pathStatus,
    claimRow,
    esc,
  });

  const strip = diffData?.diff?.summary?.hasChanges
    ? `<button class="change-strip${changesOnly ? " active" : ""}" id="change-strip">` +
      `<b>${rendered.changedAreaCount}</b> ${rendered.changedAreaCount === 1 ? "area" : "areas"} changed since the last snapshot` +
      `<span>${changesOnly ? "show everything" : "show only changes"}</span></button>`
    : diffData?.error ? `<p class="baseline-note">${esc(diffData.error)}</p>` : "";

  el.searchCount.textContent = query ? `${rendered.matchCount} matches` : "";

  renderPanes(strip + (rendered.masterHtml || rendered.html), rendered.detailHtml);
  $("change-strip")?.addEventListener("click", () => { changesOnly = !changesOnly; render(); });
}

function renderIntent() {
  showSearch("Your spec — write down what the system must do, then approve it...");
  el.searchCount.textContent = "";
  const draft = seedData?.draft ?? null;
  const assistant = seedData?.assistant ?? null;

  let masterHtml = `<h2 class="group-heading">Your spec</h2>`;
  masterHtml += renderSeedStatus(seedData);
  masterHtml += `<section class="intent-conversation"><h3>Describe the system</h3>` +
    `<textarea id="intent-message" rows="4" placeholder="Describe what the system must do, in your own words..."></textarea>` +
    `<div class="intent-actions">` +
    (assistant
      ? `<button id="intent-ask" class="intent-ask" type="button">Ask assistant (${esc(assistant.provider)} · ${esc(assistant.model)})</button>`
      : `<p class="intent-note">No AI drafting assistant is set up — paste a structured spec below, or fill it in by hand.</p>`) +
    `</div>` +
    `<details class="intent-import"><summary>Import a proposal JSON</summary>` +
    `<textarea id="intent-proposal" rows="8" placeholder='{"draft": {...}, "questions": [], "unsupported": []}'></textarea>` +
    `<button id="intent-import-btn" type="button">Import proposal</button></details></section>`;
  masterHtml += renderQuestions(draft?.questions);
  masterHtml += renderUnsupported(draft?.unsupported);

  const summary = reconciliationData?.report?.summary;
  if (summary) {
    masterHtml += `<section class="intent-recon"><h3>Latest check</h3>` +
      `<p>${summary.holds} confirmed · ${summary.violated} missing · ${summary.cannotVerify} couldn't tell · ${summary.notCheckable} noted</p></section>`;
  }

  const detailHtml = draft?.draft
    ? `<h3 class="group-heading">Draft under review (${esc(draft.source)})</h3>` +
      renderProblems(draft.problems) +
      renderSeedDiff(draft.diff) +
      renderDraftStructure(draft.draft) +
      renderReviewActions(draft)
    : emptyDetailPlaceholder("No draft under review", "Ask the assistant or paste a spec; review the changes here before approving.");
  renderPanes(masterHtml, detailHtml);

  $("intent-ask")?.addEventListener("click", async () => {
    const message = $("intent-message").value.trim();
    if (!message) return;
    const response = await fetch("/api/seed/draft", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }),
    });
    const data = await response.json();
    if (!response.ok) { alert(data.error ?? "Assistant request failed"); return; }
    seedData = { ...seedData, draft: data };
    render();
  });
  $("intent-import-btn")?.addEventListener("click", async () => {
    let proposal;
    try { proposal = JSON.parse($("intent-proposal").value); }
    catch { alert("Proposal is not valid JSON"); return; }
    const response = await fetch("/api/seed/draft", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposal }),
    });
    const data = await response.json();
    if (!response.ok) { alert(data.error ?? "Proposal rejected"); return; }
    seedData = { ...seedData, draft: data };
    render();
  });
  $("intent-reject")?.addEventListener("click", async () => {
    await fetch("/api/seed/draft/reject", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    refreshSeed();
  });
  $("intent-ratify")?.addEventListener("click", async () => {
    const response = await fetch("/api/seed/ratify", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: draft.draft }),
    });
    const data = await response.json();
    if (!response.ok) { alert(data.error ?? "Ratification failed"); return; }
    refreshSeed();
  });
}

function renderReview() {
  showSearch("Domain review — commitments, evidence, reading order...");
  el.searchCount.textContent = "";
  const review = reconciliationData?.review ?? null;

  if (!reconciliationData?.seed) {
    renderPanes(
      `<h2 class="group-heading">Domain review</h2><p class="empty-copy">No seed found. Author and ratify one in the Intent view first.</p>`,
      emptyDetailPlaceholder("Nothing to review", "Reconciliation needs a ratified seed."),
    );
    return;
  }
  if (!review) {
    renderPanes(
      `<h2 class="group-heading">Domain review</h2><p class="empty-copy">Waiting for the scan to finish…</p>`,
      emptyDetailPlaceholder("Scanning", "The review appears once the System Model is ready."),
    );
    return;
  }

  const witnessWarnings = (reconciliationData.realizationProblems ?? [])
    .map((problem) => `<p class="witness-warning">witness: ${esc(problem.message)}</p>`).join("");

  let masterHtml = renderReviewOverview(review) + witnessWarnings;
  const selectedCard = review.groups.flatMap((group) => group.cards).find((card) => card.id === expandedId) ?? null;
  for (const group of review.groups) {
    masterHtml += renderGroupHeading(group);
    masterHtml += group.cards.map((card) => renderCompactCard(card, card.id === expandedId)).join("");
  }
  masterHtml += renderCoverageLimitations(review);

  const detailHtml = selectedCard
    ? renderCardDetail(selectedCard)
    : emptyDetailPlaceholder("Select a commitment", "Pick a commitment to see its bindings, observed evidence, and suggested reading order.");
  renderPanes(masterHtml, detailHtml);
}

function renderSubjects() {
  const projection = scanData.projections?.things;
  if (!projection) return renderEmpty("This scan does not include projections yet");
  const { byId, claimsBySource } = indexes();
  const changed = changedIds();
  const query = el.search.value.toLowerCase().trim();
  showSearch("Find a subject, screen, or behavior...");

  const visible = (root) => matchRoot(root, byId, query) && (!changesOnly || rootChanged(root, changed));
  const subjects = projection.roots.filter((root) => root.tier === 0 && visible(root));
  const screens = projection.roots.filter((root) => root.tier === 1 && byId.get(root.elementId)?.kind === "screen" && visible(root));
  const unplaced = projection.roots.filter((root) => root.tier === 1 && byId.get(root.elementId)?.kind === "surface" && visible(root));
  const allRoots = [...subjects, ...screens, ...unplaced];

  el.searchCount.textContent = query ? `${allRoots.length} matches` : "";

  const changedRootCount = projection.roots.filter((root) => root.tier <= 1 && rootChanged(root, changed)).length;
  const strip = diffData?.diff?.summary?.hasChanges
    ? `<button class="change-strip${changesOnly ? " active" : ""}" id="change-strip">` +
      `<b>${changedRootCount}</b> ${changedRootCount === 1 ? "area" : "areas"} changed since the last snapshot` +
      `<span>${changesOnly ? "show everything" : "show only changes"}</span></button>`
    : diffData?.error ? `<p class="baseline-note">${esc(diffData.error)}</p>` : "";

  let masterHtml = strip + `<h2 class="group-heading">Subjects</h2>`;
  masterHtml += subjects.length
    ? subjects.map((root) => subjectMasterCard(root, byId, changed)).join("")
    : `<p class="empty-copy">No system subjects recovered.</p>`;
  masterHtml += `<h2 class="group-heading">Screens</h2>`;
  masterHtml += screens.length
    ? screens.map((root) => screenMasterCard(root, byId, changed)).join("")
    : `<p class="empty-copy">No screens recovered.</p>`;
  if (unplaced.length) {
    masterHtml += `<h3 class="subgroup-heading">Not placed on a screen</h3>` +
      unplaced.map((root) => subjectMasterCard(root, byId, changed)).join("");
  }

  const selectedRoot = allRoots.find((r) => r.elementId === expandedId);
  let detailHtml = "";
  if (selectedRoot) {
    const isScreen = byId.get(selectedRoot.elementId)?.kind === "screen";
    detailHtml = isScreen
      ? screenDetail(selectedRoot, byId, claimsBySource, changed)
      : subjectDetail(selectedRoot, byId, claimsBySource, changed);
  } else {
    detailHtml = emptyDetailPlaceholder("Select a Subject or Screen", "Select a subject or screen from the list to view detailed behaviors.");
  }

  renderPanes(masterHtml, detailHtml);
  $("change-strip")?.addEventListener("click", () => { changesOnly = !changesOnly; render(); });
}

function subjectMasterCard(root, byId, changed) {
  const item = byId.get(root.elementId);
  const selected = expandedId === root.elementId;
  return `<article class="card${selected ? " selected open" : ""}">` +
    `<button class="card-head" data-expand="${esc(root.elementId)}" aria-expanded="${selected}">` +
    `<span class="card-title"><strong>${esc(item.name)}</strong><small>${esc(kindLabel(item.kind))}</small></span>` +
    `${rootChanged(root, changed) ? changeBadge() : ""}` +
    `${item.claimState !== "observed" ? stateMark(item.claimState) : ""}` +
    `<span class="count">${root.behaviorIds.length} ${root.behaviorIds.length === 1 ? "behavior" : "behaviors"}</span>` +
    `<span class="chevron">›</span></button>` +
    `</article>`;
}

function subjectDetail(root, byId, claimsBySource, changed) {
  const item = byId.get(root.elementId);
  return `<div class="detail-content">` +
    `<header class="detail-header">` +
    `<div class="detail-title-wrap">` +
    `<h1 class="detail-title">${esc(item.name)}</h1>` +
    `<span class="detail-role">${esc(kindLabel(item.kind))} · ${root.behaviorIds.length} behaviors</span>` +
    `</div>` +
    `${item.claimState !== "observed" ? stateMark(item.claimState) : ""}` +
    `</header>` +
    behaviorList(root.behaviorIds, root.interfaceIds, byId, claimsBySource, changed) +
    `</div>`;
}

function screenMasterCard(root, byId, changed) {
  const item = byId.get(root.elementId);
  const selected = expandedId === root.elementId;
  return `<article class="card${selected ? " selected open" : ""}">` +
    `<button class="card-head" data-expand="${esc(root.elementId)}" aria-expanded="${selected}">` +
    `<span class="card-title"><strong>${esc(item.name)}</strong><small>screen</small></span>` +
    `${rootChanged(root, changed) ? changeBadge() : ""}` +
    `<span class="count">${root.surfaceIds.length} ${root.surfaceIds.length === 1 ? "panel" : "panels"} · ${root.behaviorIds.length} ${root.behaviorIds.length === 1 ? "behavior" : "behaviors"}</span>` +
    `<span class="chevron">›</span></button></article>`;
}

function screenDetail(root, byId, claimsBySource, changed) {
  const item = byId.get(root.elementId);
  const panels = root.surfaceIds.map((surfaceId) => {
    const surface = byId.get(surfaceId);
    const offers = (claimsBySource.get(surfaceId) ?? [])
      .filter((claim) => claim.relation === "offers" && claim.target.kind === "reference")
      .map((claim) => claim.target.id);
    return `<section class="panel-block"><h4>${esc(surface.name)} <small>${esc(kindLabel(surface.kind))}</small></h4>` +
      behaviorList(offers, [surfaceId], byId, claimsBySource, changed) + `</section>`;
  }).join("");

  return `<div class="detail-content">` +
    `<header class="detail-header">` +
    `<div class="detail-title-wrap">` +
    `<h1 class="detail-title">${esc(item.name)}</h1>` +
    `<span class="detail-role">screen · ${root.surfaceIds.length} panels · ${root.behaviorIds.length} behaviors</span>` +
    `</div>` +
    `</header>` +
    (panels || `<p class="empty-copy">No panels were resolved into this screen.</p>`) +
    `</div>`;
}

function behaviorList(behaviorIds, interfaceIds, byId, claimsBySource, changed) {
  if (!behaviorIds.length) return `<p class="empty-copy">No connected behavior recovered within current coverage.</p>`;
  const { frameByBehavior, pathsByBehavior } = projectionIndexes();
  const claimsById = new Map(scanData.model.claims.map((item) => [item.id, item]));
  return behaviorIds.map((behaviorId) => {
    const behavior = byId.get(behaviorId);
    if (!behavior) return "";
    const frame = frameByBehavior.get(behaviorId);
    const claims = orderedFrameClaims(frame, claimsById, claimsBySource.get(behaviorId) ?? []);
    const interfaces = interfaceIds.map((id) => byId.get(id)).filter((item) => item && (item.id === behaviorId ||
      (claimsBySource.get(item.id) ?? []).some((claim) => claim.relation === "offers" && claim.target.id === behaviorId)));
    const entries = (pathsByBehavior.get(behaviorId) ?? [])
      .filter((path) => path.entryBehaviorId !== behaviorId)
      .map((path) => path.name);
    const reach = [...new Set([...entries, ...interfaces.map((item) => item.name)])];
    return `<section class="behavior${changed.has(behaviorId) ? " behavior-changed" : ""}">` +
      `<h3>${esc(frame?.name ?? behavior.name)}${changed.has(behaviorId) ? changeBadge() : ""}</h3>` +
      (reach.length ? `<p class="reach">reached through ${reach.map((item) => esc(item)).join(" · ")}</p>` : "") +
      claims.map((claim) => claimRow(claim, byId)).join("") +
      `</section>`;
  }).join("");
}

function orderedFrameClaims(frame, claimsById, fallback) {
  if (!frame) return fallback;
  const fields = [
    "triggerClaimIds", "conditionClaimIds", "inputClaimIds", "effectClaimIds",
    "invocationClaimIds", "outputClaimIds", "outcomeClaimIds", "unresolvedClaimIds",
  ];
  return fields.flatMap((field) => frame[field].map((id) => claimsById.get(id)).filter(Boolean));
}

function claimRow(claim, byId) {
  const target = claim.target.kind === "reference" ? byId.get(claim.target.id)?.name ?? claim.target.id : claim.target.value;
  const trace = claim.implementationPath ?? [];
  const steps = trace.map((step, index) =>
    `<li><button class="trace-step" data-file="${esc(step.file)}" data-line="${step.line ?? 1}">` +
    `<span class="step-num">${index + 1}</span><code class="trace-code">${esc(step.symbol ? `${step.symbol} · ${step.file}` : step.file)}${step.line ? `:${step.line}` : ""}</code></button>` +
    `<div class="snippet" data-snippet="${esc(`${step.file}:${step.line ?? 1}`)}" hidden></div></li>`).join("");
  const fallback = (claim.evidence ?? []).map((entry) => `${esc(entry.file)}${entry.line ? `:${entry.line}` : ""}`).join(", ");
  const rel = esc(claim.relation);
  return `<div class="claim"><p><span class="relation-chip rel-${rel}">${esc(relationLabel(claim.relation))}</span> <strong class="claim-target">${esc(target)}</strong>${stateMark(claim.claimState)}</p>` +
    (steps ? `<ol class="trace">${steps}</ol>` : fallback ? `<small class="evidence">${fallback}</small>` : "") + `</div>`;
}

async function toggleSnippet(button) {
  const key = `${button.dataset.file}:${button.dataset.line}`;
  const holder = button.parentElement.querySelector(`[data-snippet="${CSS.escape(key)}"]`);
  if (!holder) return;
  if (!holder.hidden) { holder.hidden = true; openSnippets.delete(key); return; }
  if (!snippetCache.has(key)) {
    try {
      const response = await fetch(`/api/source?file=${encodeURIComponent(button.dataset.file)}&line=${encodeURIComponent(button.dataset.line)}`);
      if (!response.ok) throw new Error("unavailable");
      snippetCache.set(key, await response.json());
    } catch {
      snippetCache.set(key, null);
    }
  }
  const snippet = snippetCache.get(key);
  holder.innerHTML = snippet
    ? `<pre class="code">${snippet.lines.map((line, index) => {
        const number = snippet.startLine + index;
        return `<span class="line${number === snippet.focusLine ? " focus" : ""}"><i>${number}</i>${esc(line)}</span>`;
      }).join("\n")}</pre>`
    : `<p class="empty-copy">Source unavailable.</p>`;
  holder.hidden = false;
  openSnippets.add(key);
}

function bindSnippets() {
  document.querySelectorAll(".trace-step").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSnippet(button);
  }));
}

function renderCapabilities() {
  const projection = scanData.projections?.frames;
  const envelopeProjection = scanData.projections?.envelopes;
  if (!projection || !envelopeProjection) return renderEmpty("This scan does not include semantic envelopes yet");
  const { byId, claimsBySource } = indexes();
  const changed = changedIds();
  const query = el.search.value.toLowerCase().trim();
  showSearch(`Find a behavior across ${projection.frames.length} capabilities...`);

  const envelopes = envelopeProjection.envelopes.filter((item) => {
    const names = [item.name, ...item.primarySubjectIds.map((id) => byId.get(id)?.name)];
    return !query || names.some((name) => name?.toLowerCase().includes(query));
  });
  const items = projection.frames.filter((item) => {
    const names = [item.name, byId.get(item.behaviorId)?.name, ...item.subjectIds.map((id) => byId.get(id)?.name)];
    return !query || names.some((name) => name?.toLowerCase().includes(query));
  });

  const allCaps = [...envelopes.map(e => ({ type: "envelope", id: e.id, item: e })), ...items.map(i => ({ type: "behavior", id: i.behaviorId, item: i }))];

  el.searchCount.textContent = query ? `${envelopes.length + items.length} matches` : "";

  let masterHtml = `<h2 class="group-heading">Static behavior envelopes</h2>`;
  masterHtml += envelopes.length ? envelopes.map((item) => {
    const selected = expandedId === item.id;
    const steps = item.behaviorIds.map((id) =>
      projection.frames.find((frame) => frame.behaviorId === id)?.name ?? byId.get(id)?.name).filter(Boolean);
    const subjects = item.primarySubjectIds.map((id) => byId.get(id)?.name).filter(Boolean);
    return `<article class="card${selected ? " selected open" : ""}">` +
      `<button class="card-head" data-expand="${esc(item.id)}" aria-expanded="${selected}">` +
      `<span class="card-title"><strong>${esc(item.name)}</strong>${pathStatus(item.completeness)}<small>${esc([...steps, ...subjects].join(" → "))}</small></span>` +
      `<span class="chevron">›</span></button>` +
      `</article>`;
  }).join("") : `<p class="empty-copy">No cross-interface behavior envelope was resolved.</p>`;

  masterHtml += `<h2 class="group-heading">All behaviors</h2>`;
  masterHtml += items.map((item) => {
    const behavior = byId.get(item.behaviorId);
    const selected = expandedId === behavior?.id;
    const resources = item.subjectIds.map((id) => byId.get(id)?.name).filter(Boolean);
    return `<article class="card${selected ? " selected open" : ""}">` +
      `<button class="card-head" data-expand="${esc(behavior?.id)}" aria-expanded="${selected}">` +
      `<span class="card-title"><strong>${esc(item.name)}</strong>` +
      `<small>${resources.length ? `acts on ${esc(resources.join(", "))}` : "no resolved subject"}</small></span>` +
      `${changed.has(behavior?.id) ? changeBadge() : ""}<span class="chevron">›</span></button>` +
      `</article>`;
  }).join("");

  const selectedCap = allCaps.find((c) => c.id === expandedId);
  let detailHtml = "";
  if (selectedCap?.type === "envelope") {
    detailHtml = `<div class="detail-content">` +
      `<header class="detail-header">` +
      `<div class="detail-title-wrap">` +
      `<h1 class="detail-title">${esc(selectedCap.item.name)}</h1>` +
      `<span class="detail-role">Static behavior envelope</span>` +
      `</div>` +
      `${pathStatus(selectedCap.item.completeness)}` +
      `</header>` +
      envelopeDetail(selectedCap.item, byId) +
      `</div>`;
  } else if (selectedCap?.type === "behavior") {
    const behavior = byId.get(selectedCap.item.behaviorId);
    detailHtml = `<div class="detail-content">` +
      `<header class="detail-header">` +
      `<div class="detail-title-wrap">` +
      `<h1 class="detail-title">${esc(selectedCap.item.name)}</h1>` +
      `<span class="detail-role">Behavior · ${esc(behavior?.kind ?? "action")}</span>` +
      `</div>` +
      `</header>` +
      behaviorList([selectedCap.item.behaviorId], selectedCap.item.interfaceIds, byId, claimsBySource, changed) +
      `</div>`;
  } else {
    detailHtml = emptyDetailPlaceholder("Select a Capability", "Select a static envelope or behavior to inspect claims and effects.");
  }

  renderPanes(masterHtml, detailHtml);
}

function envelopeDetail(envelope, byId) {
  const claims = new Map(scanData.model.claims.map((item) => [item.id, item]));
  const sections = [
    ["When", envelope.conditionClaimIds],
    ["Sends", envelope.inputClaimIds],
    ["Through", envelope.invocationClaimIds],
    ["Changes", envelope.primaryEffectClaimIds],
    ["Uses", envelope.supportingEffectClaimIds],
    ["Returns", envelope.outputClaimIds],
    ["May result", envelope.outcomeClaimIds],
    ["Unresolved", envelope.unresolvedClaimIds],
  ];
  return `<p class="reach">Static behavior envelope · derived from source evidence, not a runtime trace</p>` +
    sections.filter(([, ids]) => ids.length).map(([label, ids]) =>
      `<section class="envelope-section"><h3>${label}</h3>${ids.map((id) => claims.get(id)).filter(Boolean).map((claim) => claimRow(claim, byId)).join("")}</section>`
    ).join("");
}

function renderChanges() {
  el.search.closest(".search-wrap").hidden = true;
  if (diffData?.error) return renderEmpty(diffData.error);
  const diff = diffData?.diff;
  if (!diff) return renderEmpty("Semantic diff is not ready");
  if (!diff.summary.hasChanges) return renderEmpty("No semantic changes within declared coverage");
  const label = (id) => diff.labels[id] ?? id;
  const claimText = (item) =>
    `${relationLabel(item.relation)} ${item.target.kind === "reference" ? label(item.target.id) : item.target.value}`;
  let masterHtml = `<h2 class="group-heading">${diff.summary.semanticChanges} semantic ${diff.summary.semanticChanges === 1 ? "change" : "changes"}</h2>`;
  for (const item of diff.elements.added) masterHtml += changeCard("added", "+", item.name, kindLabel(item.kind));
  for (const item of diff.elements.removed) masterHtml += changeCard("removed", "−", item.name, kindLabel(item.kind));
  for (const item of diff.claims.added) masterHtml += changeCard("added", "+", label(item.sourceId), claimText(item));
  for (const item of diff.claims.removed) masterHtml += changeCard("removed", "−", label(item.sourceId), claimText(item));
  for (const item of diff.claims.changed) masterHtml += changeCard("changed", "~", label(item.after.sourceId), claimText(item.after));
  
  const detailHtml = `<div class="detail-content">` +
    `<header class="detail-header"><div class="detail-title-wrap"><h1 class="detail-title">Semantic Diff Summary</h1><span class="detail-role">Comparison against baseline checkpoint</span></div></header>` +
    `<p class="reach">Below are the semantic elements and claims modified since the last snapshot.</p>` +
    `</div>`;

  renderPanes(masterHtml, detailHtml);
}

function changeCard(kind, symbol, name, detail) {
  return `<article class="card change-${kind}"><div class="card-head static">` +
    `<span class="card-title"><strong>${symbol} ${esc(name)}</strong><small>${esc(detail)}</small></span></div></article>`;
}

function renderEverything() {
  const { byId, claimsBySource } = indexes();
  const query = el.search.value.toLowerCase().trim();
  const elements = scanData.model.elements.filter((item) => !query ||
    item.name.toLowerCase().includes(query) ||
    item.evidence.some((entry) => entry.file.toLowerCase().includes(query)));
  showSearch(`Search all ${scanData.model.elements.length} elements and source paths...`);
  el.searchCount.textContent = query ? `${elements.length} matches` : "";
  if (!elements.length) return renderEmpty("Nothing matches this search");

  let masterHtml = elements.slice(0, 200).map((item) => {
    const selected = expandedId === item.id;
    return `<article class="card${selected ? " selected open" : ""}">` +
      `<button class="card-head" data-expand="${esc(item.id)}">` +
      `<span class="card-title"><strong>${esc(item.name)}</strong><small>${esc(kindLabel(item.kind))}</small></span>` +
      `<span class="chevron">›</span></button></article>`;
  }).join("") + (elements.length > 200 ? `<p class="empty-copy">${elements.length - 200} more — narrow search.</p>` : "");

  const selectedItem = elements.find((e) => e.id === expandedId);
  let detailHtml = "";
  if (selectedItem) {
    detailHtml = `<div class="detail-content">` +
      `<header class="detail-header"><div class="detail-title-wrap"><h1 class="detail-title">${esc(selectedItem.name)}</h1><span class="detail-role">${esc(kindLabel(selectedItem.kind))}</span></div></header>` +
      (claimsBySource.get(selectedItem.id) ?? []).map((claim) => claimRow(claim, byId)).join("") +
      `<small class="evidence">${(selectedItem.evidence ?? []).map((entry) => `${esc(entry.file)}${entry.line ? `:${entry.line}` : ""}`).join(", ") || "no direct evidence"}</small>` +
      `</div>`;
  } else {
    detailHtml = emptyDetailPlaceholder("Select an Element", "Select an element to view its claims and source evidence.");
  }

  renderPanes(masterHtml, detailHtml);
}

function renderUnknowns() {
  el.search.closest(".search-wrap").hidden = true;
  let masterHtml = `<h2 class="group-heading">What varai couldn't determine</h2>` +
    (scanData.model.coverage.length ? scanData.model.coverage.map((item) =>
      `<article class="card"><div class="card-head static">` +
      `<span class="card-title"><strong>${esc(item.capability)}</strong><small>${esc(item.state)}</small></span></div>` +
      `${item.details.length ? `<div class="card-detail open-static"><p>${esc(item.details.join("; "))}</p></div>` : ""}</article>`).join("")
      : emptyMarkup("Nothing was declared out of reach"));

  const detailHtml = `<div class="detail-content">` +
    `<header class="detail-header"><div class="detail-title-wrap"><h1 class="detail-title">Coverage & Unknowns</h1><span class="detail-role">Declared analyzer boundaries</span></div></header>` +
    `<p class="reach">Varai reports explicit boundaries where repository information could not be conclusively extracted.</p>` +
    `</div>`;

  renderPanes(masterHtml, detailHtml);
}

function bindExpanders() {
  document.querySelectorAll("[data-expand]").forEach((button) => button.addEventListener("click", (e) => {
    e.stopPropagation();
    expandedId = button.dataset.expand;
    render();
  }));
}

function renderEmpty(message) {
  renderPanes(emptyMarkup(message), emptyDetailPlaceholder());
}

function emptyMarkup(message) {
  return `<div class="empty-state">` +
    `<div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg></div>` +
    `<span class="empty-text">${esc(message)}</span></div>`;
}

let searchTimer = null;
el.search?.addEventListener("input", () => {
  if (el.searchClear) el.searchClear.hidden = !el.search.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, 120);
});

el.searchClear?.addEventListener("click", () => {
  el.search.value = "";
  if (el.searchClear) el.searchClear.hidden = true;
  render();
  el.search.focus();
});

document.addEventListener("keydown", (event) => {
  if ((event.key === "/" || (event.key === "k" && (event.metaKey || event.ctrlKey))) && document.activeElement !== el.search) {
    event.preventDefault();
    el.search?.focus();
    el.search?.select();
  } else if (event.key === "Escape" && document.activeElement === el.search) {
    el.search.value = "";
    if (el.searchClear) el.searchClear.hidden = true;
    render();
    el.search.blur();
  } else if (event.key === "Escape" && expandedId) {
    expandedId = null;
    render();
  }
});
