// Pure HTML renderer for the product Blueprint view. Observation chips overlay
// Seed projection without implying a persisted Seed+Model graph.

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const ATTENTION = new Set(["missing", "unaccounted", "ambiguous", "unverifiable", "unknown"]);

function chip(observation, evidenceIds = []) {
  const obs = observation || "unknown";
  const primary = evidenceIds[0];
  const attrs = primary ? ` data-evidence-id="${esc(primary)}"` : "";
  const attention = ATTENTION.has(obs) ? " observation-attention" : "";
  return `<span class="observation-chip observation-${esc(obs)}${attention}"${attrs}>${esc(obs)}</span>`;
}

function evidenceAttrs(ids = []) {
  return ids.map((id) => `data-evidence-id="${esc(id)}"`).join(" ");
}

function renderGroup(title, items, renderItem) {
  if (!items?.length) return "";
  return `<section class="blueprint-group"><h3>${esc(title)}</h3><ul class="blueprint-list">` +
    items.map(renderItem).join("") + `</ul></section>`;
}

export function renderBlueprint(blueprint) {
  if (!blueprint || blueprint.empty) {
    return `<div class="blueprint blueprint-empty"><h2>Blueprint</h2>` +
      `<p class="empty-copy">No product blueprint yet — approve a Seed in Change to project actors, surfaces, and scenarios.</p></div>`;
  }

  let html = `<div class="blueprint"><header class="blueprint-head"><h2>${esc(blueprint.system?.name ?? "Blueprint")}</h2>` +
    `<p class="empty-copy">Seed projection with live observation overlay. Nothing here is a second architecture graph.</p></header>`;

  html += renderGroup("Actors", blueprint.actors, (item) =>
    `<li class="blueprint-item" id="evidence-${esc(item.id)}" ${evidenceAttrs(item.evidenceIds)} tabindex="-1">${chip(item.observation, item.evidenceIds)} ` +
    `<strong>${esc(item.name)}</strong> <code>${esc(item.id)}</code></li>`);

  html += renderGroup("Behaviors", blueprint.behaviors, (item) =>
    `<li class="blueprint-item" id="evidence-${esc(item.id)}" ${evidenceAttrs(item.evidenceIds)} tabindex="-1">${chip(item.observation, item.evidenceIds)} ` +
    `<strong>${esc(item.name)}</strong> <code>${esc(item.id)}</code></li>`);

  html += renderGroup("Expected surfaces", blueprint.surfaces, (item) =>
    `<li class="blueprint-item" id="evidence-${esc(item.id)}" ${evidenceAttrs(item.evidenceIds)} tabindex="-1">${chip(item.observation, item.evidenceIds)} ` +
    `<strong>${esc(item.name)}</strong> ` +
    (item.channel ? `<span class="surface-meta">${esc(item.channel)} · ${esc(item.access)}</span> ` : "") +
    `<code>${esc(item.id)}</code></li>`);

  html += renderGroup("Scenario journeys", blueprint.scenarios, (item) =>
    `<li class="blueprint-item" id="evidence-${esc(item.id)}" ${evidenceAttrs(item.evidenceIds)} tabindex="-1">${chip(item.observation, item.evidenceIds)} ` +
    `<strong>${esc(item.name)}</strong> <code>${esc(item.id)}</code>` +
    (item.steps?.length
      ? `<ol class="scenario-steps">${item.steps.map((step) =>
          `<li><code>${esc(step.as)}</code> → <code>${esc(step.invoke)}</code></li>`).join("")}</ol>`
      : "") +
    `</li>`);

  html += renderGroup("Resources", blueprint.resources, (item) =>
    `<li class="blueprint-item" id="evidence-${esc(item.id)}" ${evidenceAttrs(item.evidenceIds)} tabindex="-1">${chip(item.observation, item.evidenceIds)} ` +
    `<strong>${esc(item.name)}</strong> <code>${esc(item.id)}</code></li>`);

  html += renderGroup("Unaccounted surfaces", blueprint.unaccounted, (item) =>
    `<li class="blueprint-item" id="evidence-${esc(item.key ?? item.elementId)}" ${evidenceAttrs(item.evidenceIds)} tabindex="-1">${chip(item.observation, item.evidenceIds)} ` +
    `<strong>${esc(item.name)}</strong></li>`);

  html += renderGroup("Ambiguous bindings", blueprint.ambiguous, (item) =>
    `<li class="blueprint-item" id="evidence-${esc(item.surfaceId)}" ${evidenceAttrs(item.evidenceIds)} tabindex="-1">${chip(item.observation, item.evidenceIds)} ` +
    `<code>${esc(item.surfaceId)}</code></li>`);

  return `${html}</div>`;
}
