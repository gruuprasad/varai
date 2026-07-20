import {
  collectChangedClaimIds,
  renderObservedAreasOutline,
} from "./observed-areas-view.js";

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

(function setupTheme() {
  document.documentElement.dataset.theme = localStorage.getItem("varai-theme") || "dark";
  document.addEventListener("DOMContentLoaded", () => $("theme-toggle")?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("varai-theme", next);
  }));
})();

const el = {
  statusDot: $("status-dot"), statusText: $("status-text"), topbarStats: $("topbar-stats"),
  sidebarNav: $("sidebar-nav"), search: $("search"), searchCount: $("search-count"), list: $("elements-list"),
};

let activeView = "system";
let expandedId = null;
let changesOnly = false;
let scanData = null;
let diffData = null;
const snippetCache = new Map();
const openSnippets = new Set();

const events = new EventSource("/api/events");
events.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.type === "model") { scanData = message.data; setStatus("live", "Live"); render(); }
  else if (message.type === "semantic-diff") { diffData = message.data; render(); }
  else if (message.type === "error") setStatus("error", "Error");
});
events.addEventListener("open", () => setStatus("scanning", "Connecting..."));
events.addEventListener("error", () => setStatus("error", "Disconnected"));

fetch("/api/model").then((response) => response.json()).then((data) => {
  if (data.model) { scanData = data; setStatus("live", "Live"); render(); }
}).catch(() => setStatus("error", "Connection error"));
fetch("/api/diff").then((response) => response.json()).then((data) => { diffData = data; render(); }).catch(() => {});

function setStatus(kind, text) {
  el.statusDot.className = `status-dot ${kind}`;
  el.statusText.textContent = text;
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

function render() {
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
  const areas = scanData.projections?.observedAreas?.areas ?? [];
  const cores = scanData.projections?.observedAreas?.sharedCores ?? [];
  const operations = areas.reduce((sum, area) => sum + area.operationCount, 0);
  const primaryOperations = areas.reduce((sum, area) => sum + (area.primaryOperationCount ?? area.operationCount), 0);
  el.topbarStats.innerHTML =
    `<span>${areas.length} observed areas</span>` +
    `<span>${primaryOperations} primary · ${operations} observed operations</span>` +
    `<span>${cores.length} shared parts</span>`;
}

function renderNav() {
  const changes = diffData?.diff?.summary?.semanticChanges ?? 0;
  el.sidebarNav.innerHTML =
    navItem("system", "◎", "Observed areas", null) +
    navItem("subjects", "◈", "Subjects", null) +
    navItem("capabilities", "↳", "Capabilities", null) +
    navItem("changes", "∆", "Changes", changes || null) +
    `<div class="nav-group"><span class="nav-group-label">Advanced</span>` +
    navItem("everything", "≡", "Everything", scanData.model.elements.length) +
    navItem("unknowns", "◌", "Couldn't determine", scanData.model.coverage.length) +
    `</div>`;
  el.sidebarNav.querySelectorAll("[data-view]").forEach((item) => item.addEventListener("click", () => {
    activeView = item.dataset.view;
    expandedId = null;
    changesOnly = false;
    el.search.value = "";
    render();
  }));
}

function navItem(view, icon, name, count) {
  return `<button class="nav-item${activeView === view ? " active" : ""}" data-view="${view}">` +
    `<span class="nav-icon">${esc(icon)}</span><span class="nav-name">${esc(name)}</span>` +
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
  el.list.innerHTML = strip + rendered.html;
  bindExpanders();
  bindSnippets();
  $("change-strip")?.addEventListener("click", () => { changesOnly = !changesOnly; render(); });
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
  el.searchCount.textContent = query ? `${subjects.length + screens.length + unplaced.length} matches` : "";

  const changedRootCount = projection.roots.filter((root) => root.tier <= 1 && rootChanged(root, changed)).length;
  const strip = diffData?.diff?.summary?.hasChanges
    ? `<button class="change-strip${changesOnly ? " active" : ""}" id="change-strip">` +
      `<b>${changedRootCount}</b> ${changedRootCount === 1 ? "area" : "areas"} changed since the last snapshot` +
      `<span>${changesOnly ? "show everything" : "show only changes"}</span></button>`
    : diffData?.error ? `<p class="baseline-note">${esc(diffData.error)}</p>` : "";

  let html = strip + `<h2 class="group-heading">Subjects</h2>`;
  html += subjects.length
    ? subjects.map((root) => subjectCard(root, byId, claimsBySource, changed)).join("")
    : `<p class="empty-copy">No system subjects recovered.</p>`;
  html += `<h2 class="group-heading">Screens</h2>`;
  html += screens.length
    ? screens.map((root) => screenCard(root, byId, claimsBySource, changed)).join("")
    : `<p class="empty-copy">No screens recovered.</p>`;
  if (unplaced.length) {
    html += `<h3 class="subgroup-heading">Not placed on a screen</h3>` +
      unplaced.map((root) => subjectCard(root, byId, claimsBySource, changed)).join("");
  }
  el.list.innerHTML = html;
  bindExpanders();
  bindSnippets();
  $("change-strip")?.addEventListener("click", () => { changesOnly = !changesOnly; render(); });
}

function subjectCard(root, byId, claimsBySource, changed) {
  const item = byId.get(root.elementId);
  const open = expandedId === root.elementId;
  return `<article class="card${open ? " open" : ""}">` +
    `<button class="card-head" data-expand="${esc(root.elementId)}" aria-expanded="${open}">` +
    `<span class="card-title"><strong>${esc(item.name)}</strong><small>${esc(kindLabel(item.kind))}</small></span>` +
    `${rootChanged(root, changed) ? changeBadge() : ""}` +
    `${item.claimState !== "observed" ? stateMark(item.claimState) : ""}` +
    `<span class="count">${root.behaviorIds.length} ${root.behaviorIds.length === 1 ? "behavior" : "behaviors"}</span>` +
    `<span class="chevron">⌄</span></button>` +
    (open ? `<div class="card-detail">${behaviorList(root.behaviorIds, root.interfaceIds, byId, claimsBySource, changed)}</div>` : "") +
    `</article>`;
}

function screenCard(root, byId, claimsBySource, changed) {
  const item = byId.get(root.elementId);
  const open = expandedId === root.elementId;
  let detail = "";
  if (open) {
    const panels = root.surfaceIds.map((surfaceId) => {
      const surface = byId.get(surfaceId);
      const offers = (claimsBySource.get(surfaceId) ?? [])
        .filter((claim) => claim.relation === "offers" && claim.target.kind === "reference")
        .map((claim) => claim.target.id);
      return `<section class="panel-block"><h4>${esc(surface.name)} <small>${esc(kindLabel(surface.kind))}</small></h4>` +
        behaviorList(offers, [surfaceId], byId, claimsBySource, changed) + `</section>`;
    }).join("");
    detail = `<div class="card-detail">${panels || `<p class="empty-copy">No panels were resolved into this screen.</p>`}</div>`;
  }
  return `<article class="card${open ? " open" : ""}">` +
    `<button class="card-head" data-expand="${esc(root.elementId)}" aria-expanded="${open}">` +
    `<span class="card-title"><strong>${esc(item.name)}</strong><small>screen</small></span>` +
    `${rootChanged(root, changed) ? changeBadge() : ""}` +
    `<span class="count">${root.surfaceIds.length} ${root.surfaceIds.length === 1 ? "panel" : "panels"} · ${root.behaviorIds.length} ${root.behaviorIds.length === 1 ? "behavior" : "behaviors"}</span>` +
    `<span class="chevron">⌄</span></button>${detail}</article>`;
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
    `<span>${index + 1}</span><code>${esc(step.symbol ? `${step.symbol} · ${step.file}` : step.file)}${step.line ? `:${step.line}` : ""}</code></button>` +
    `<div class="snippet" data-snippet="${esc(`${step.file}:${step.line ?? 1}`)}" hidden></div></li>`).join("");
  const fallback = (claim.evidence ?? []).map((entry) => `${esc(entry.file)}${entry.line ? `:${entry.line}` : ""}`).join(", ");
  return `<div class="claim"><p>${esc(relationLabel(claim.relation))} <strong>${esc(target)}</strong>${stateMark(claim.claimState)}</p>` +
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
  el.list.querySelectorAll(".trace-step").forEach((button) => button.addEventListener("click", (event) => {
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
  const items = projection.frames.filter((item) => {
    const names = [item.name, byId.get(item.behaviorId)?.name, ...item.subjectIds.map((id) => byId.get(id)?.name)];
    return !query || names.some((name) => name?.toLowerCase().includes(query));
  });
  const envelopes = envelopeProjection.envelopes.filter((item) => {
    const names = [item.name, ...item.primarySubjectIds.map((id) => byId.get(id)?.name)];
    return !query || names.some((name) => name?.toLowerCase().includes(query));
  });
  el.searchCount.textContent = query ? `${items.length + envelopes.length} matches` : "";
  let html = `<h2 class="group-heading">Static behavior envelopes</h2>`;
  html += envelopes.length ? envelopes.map((item) => {
    const open = expandedId === item.id;
    const steps = item.behaviorIds.map((id) =>
      projection.frames.find((frame) => frame.behaviorId === id)?.name ?? byId.get(id)?.name).filter(Boolean);
    const subjects = item.primarySubjectIds.map((id) => byId.get(id)?.name).filter(Boolean);
    return `<article class="card${open ? " open" : ""}">` +
      `<button class="card-head" data-expand="${esc(item.id)}" aria-expanded="${open}">` +
      `<span class="card-title"><strong>${esc(item.name)}</strong>${pathStatus(item.completeness)}<small>${esc([...steps, ...subjects].join(" → "))}</small></span>` +
      `<span class="chevron">⌄</span></button>` +
      (open ? `<div class="card-detail">${envelopeDetail(item, byId)}</div>` : "") +
      `</article>`;
  }).join("") : `<p class="empty-copy">No cross-interface behavior envelope was resolved.</p>`;
  html += `<h2 class="group-heading">All behaviors</h2>`;
  html += items.map((item) => {
    const behavior = byId.get(item.behaviorId);
    const open = expandedId === behavior.id;
    const resources = item.subjectIds.map((id) => byId.get(id)?.name).filter(Boolean);
    return `<article class="card${open ? " open" : ""}">` +
      `<button class="card-head" data-expand="${esc(behavior.id)}" aria-expanded="${open}">` +
      `<span class="card-title"><strong>${esc(item.name)}</strong>` +
      `<small>${resources.length ? `acts on ${esc(resources.join(", "))}` : "no resolved subject"}</small></span>` +
      `${changed.has(behavior.id) ? changeBadge() : ""}<span class="chevron">⌄</span></button>` +
      (open ? `<div class="card-detail">${behaviorList([behavior.id], item.interfaceIds, byId, claimsBySource, changed)}</div>` : "") +
      `</article>`;
  }).join("") || emptyMarkup("No behaviors match this search");
  el.list.innerHTML = html;
  bindExpanders();
  bindSnippets();
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
  let html = `<h2 class="group-heading">${diff.summary.semanticChanges} semantic ${diff.summary.semanticChanges === 1 ? "change" : "changes"}</h2>`;
  for (const item of diff.elements.added) html += changeCard("added", "+", item.name, kindLabel(item.kind));
  for (const item of diff.elements.removed) html += changeCard("removed", "−", item.name, kindLabel(item.kind));
  for (const item of diff.claims.added) html += changeCard("added", "+", label(item.sourceId), claimText(item));
  for (const item of diff.claims.removed) html += changeCard("removed", "−", label(item.sourceId), claimText(item));
  for (const item of diff.claims.changed) html += changeCard("changed", "~", label(item.after.sourceId), claimText(item.after));
  el.list.innerHTML = html;
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
  el.list.innerHTML = elements.slice(0, 200).map((item) =>
    `<article class="card"><div class="card-head static">` +
    `<span class="card-title"><strong>${esc(item.name)}</strong><small>${esc(kindLabel(item.kind))}</small></span></div>` +
    `<div class="card-detail open-static">` +
    (claimsBySource.get(item.id) ?? []).map((claim) => claimRow(claim, byId)).join("") +
    `<small class="evidence">${(item.evidence ?? []).map((entry) => `${esc(entry.file)}${entry.line ? `:${entry.line}` : ""}`).join(", ") || "no direct evidence"}</small>` +
    `</div></article>`).join("") +
    (elements.length > 200 ? `<p class="empty-copy">${elements.length - 200} more — narrow the search.</p>` : "");
  bindSnippets();
}

function renderUnknowns() {
  el.search.closest(".search-wrap").hidden = true;
  el.list.innerHTML = `<h2 class="group-heading">What varai couldn't determine</h2>` +
    (scanData.model.coverage.length ? scanData.model.coverage.map((item) =>
      `<article class="card"><div class="card-head static">` +
      `<span class="card-title"><strong>${esc(item.capability)}</strong><small>${esc(item.state)}</small></span></div>` +
      `${item.details.length ? `<div class="card-detail open-static"><p>${esc(item.details.join("; "))}</p></div>` : ""}</article>`).join("")
      : emptyMarkup("Nothing was declared out of reach"));
}

function bindExpanders() {
  el.list.querySelectorAll("[data-expand]").forEach((button) => button.addEventListener("click", () => {
    expandedId = expandedId === button.dataset.expand ? null : button.dataset.expand;
    render();
    if (expandedId) requestAnimationFrame(() => el.list.querySelector(`[data-expand="${CSS.escape(expandedId)}"]`)?.focus());
  }));
}

function renderEmpty(message) { el.list.innerHTML = emptyMarkup(message); }
function emptyMarkup(message) { return `<div class="empty-state"><span class="empty-icon">◌</span><span>${esc(message)}</span></div>`; }

let searchTimer = null;
el.search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, 120);
});
