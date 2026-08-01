// Human-facing lens over the existing Seed projection. Technical identity and
// evidence remain available on demand; this renderer does not create a model.

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const ATTENTION = new Set(["missing", "unaccounted", "ambiguous", "unverifiable", "unknown"]);
const STATUS = Object.freeze({
  realized: "Seen in the application",
  missing: "Not found",
  unaccounted: "Not in the approved system",
  ambiguous: "Needs clarification",
  unverifiable: "Not verified",
  unknown: "Not yet checked",
});
const CHANNEL = Object.freeze({ api: "API", ui: "interface", cli: "command line", event: "event", worker: "background work" });
const ACCESS = Object.freeze({ public: "open to anyone", authenticated: "signed-in people", internal: "internal use" });
const REASON = Object.freeze({
  "no-binding": "No implementation has been linked to this approved item.",
  "unbound-source": "The work that should perform this requirement has no implementation link.",
  "unbound-target": "The expected result has no implementation link.",
  "no-checker-semantics": "Varai does not yet have a deterministic check for this requirement.",
  "status-mismatch": "The observed result did not match the approved outcome.",
  "artifact-not-found": "The previously linked implementation is no longer present.",
});
const STATUS_HELP = Object.freeze({
  realized: "Varai found implementation evidence. This does not prove every possible outcome.",
  missing: "Varai did not find the approved item in an area it can analyze.",
  unaccounted: "Varai observed a public entry that the approved system does not declare.",
  ambiguous: "More than one implementation match is possible, so Varai cannot choose one.",
  unverifiable: "Current evidence or analyzer coverage is not enough for a deterministic verdict.",
  unknown: "No reconciliation result has been recorded yet.",
});
const DECISION = Object.freeze({
  missing_behavior: "Approved behavior not found",
  failed_scenario: "Approved journey failed",
  unaccounted_surface: "Unexpected public entry",
  coverage_degradation: "Verification coverage got worse",
  stale_binding: "Implementation link needs repair",
  unattested: "Changes were made outside the recorded build",
});

function chip(observation, evidenceIds = []) {
  const value = observation || "unknown";
  const primary = evidenceIds[0];
  const attrs = primary ? ` data-evidence-id="${esc(primary)}"` : "";
  const attention = ATTENTION.has(value) ? " observation-attention" : "";
  return `<span class="observation-chip observation-${esc(value)}${attention}"${attrs}>${esc(STATUS[value] ?? value)}</span>`;
}

function evidenceAttrs(ids = []) {
  return ids[0] ? `data-evidence-id="${esc(ids[0])}"` : "";
}

function technical(id, evidenceIds = [], observation = "unknown") {
  const ids = [...new Set([id, ...evidenceIds].filter(Boolean))];
  const reasons = ids.map((value) => REASON[value]).filter(Boolean);
  return `<details class="blueprint-technical"><summary>Why Varai says this</summary>` +
    `<p>${esc(reasons[0] ?? STATUS_HELP[observation || "unknown"] ?? STATUS_HELP.unknown)}</p>` +
    `<p class="blueprint-references">Evidence references: ${ids.map((value) => `<code>${esc(value)}</code>`).join(" ")}</p></details>`;
}

function expectedOutcome(expect = null) {
  if (!expect) return "";
  const status = { 200: "succeeds", 201: "creates the result", 400: "is rejected", 401: "requires sign-in", 403: "is refused", 404: "is not found" }[expect.status];
  const state = expect.body?.state ? `ends with state “${esc(expect.body.state)}”` : "";
  const parts = [status, state].filter(Boolean);
  return parts.length ? `<small class="journey-outcome">Expected: ${parts.join(" and ")}.</small>` : "";
}

function aggregateObservation(items = []) {
  const values = items.map((item) => item.observation);
  if (values.includes("missing")) return "missing";
  if (values.includes("unverifiable") || values.includes("ambiguous")) return "unverifiable";
  return values.length && values.every((value) => value === "realized") ? "realized" : "unknown";
}

function renderGroup(title, description, items, renderItem) {
  if (!items?.length) return "";
  return `<section class="blueprint-group"><header><h3>${esc(title)}</h3><p>${esc(description)}</p></header><ul class="blueprint-list">` +
    items.map(renderItem).join("") + `</ul></section>`;
}

export function renderBlueprint(blueprint, verification = null) {
  if (!blueprint || blueprint.empty) {
    return `<div class="blueprint blueprint-empty"><h2>Your system</h2>` +
      `<p class="empty-copy">Describe and approve the application in Develop to see its people, work, information, and verification here.</p></div>`;
  }

  const concepts = new Map(
    [...(blueprint.actors ?? []), ...(blueprint.behaviors ?? []), ...(blueprint.resources ?? [])]
      .map((item) => [item.id, item.name]),
  );
  const surfaces = new Map((blueprint.surfaces ?? []).map((item) => [item.id, item.name]));
  const name = (id) => concepts.get(id) ?? surfaces.get(id) ?? id;
  const items = [
    ...(blueprint.actors ?? []), ...(blueprint.behaviors ?? []), ...(blueprint.resources ?? []),
    ...(blueprint.surfaces ?? []), ...(blueprint.scenarios ?? []), ...(blueprint.flows ?? []),
  ];
  const attention = [
    ...(blueprint.unaccounted ?? []).map((item) => ({ ...item, detail: "Varai observed this public entry, but it is not in the approved system." })),
    ...(blueprint.ambiguous ?? []).map((item) => ({ ...item, name: name(item.surfaceId), detail: "Varai cannot connect this entry to one clear implementation." })),
  ];
  const seen = items.filter((item) => item.observation === "realized").length;
  const notFound = items.filter((item) => item.observation === "missing");
  const notVerified = items.filter((item) => !item.observation || ["unverifiable", "unknown", "ambiguous"].includes(item.observation));
  const priority = [...notFound, ...attention, ...notVerified].filter((item, index, all) => {
    const id = item.id ?? item.key ?? item.surfaceId ?? item.elementId;
    return all.findIndex((candidate) => (candidate.id ?? candidate.key ?? candidate.surfaceId ?? candidate.elementId) === id) === index;
  });

  let html = `<main class="blueprint"><header class="blueprint-head"><p class="eyebrow">Human-level system view</p>` +
    `<h2>${esc(blueprint.system?.name ?? "Your system")}</h2>` +
    `<p>This is the application you approved, checked against what Varai can independently observe.</p>` +
    `<p class="blueprint-summary"><strong>${blueprint.behaviors?.length ?? 0}</strong> approved behaviors · ` +
    `<strong>${blueprint.scenarios?.length ?? 0}</strong> approved journeys</p>` +
    `<p class="blueprint-summary"><strong>${seen}</strong> items seen · <strong>${notFound.length}</strong> not found · ` +
    `<strong>${notVerified.length}</strong> not verified · <strong>${attention.length}</strong> unexplained</p>` +
    `<aside class="status-guide" aria-label="Status meanings"><strong>Seen</strong> means evidence was found, not that every outcome is proven. ` +
    `<strong>Not found</strong> is reported only where coverage supports it. <strong>Not verified</strong> means Varai cannot decide yet.</aside></header>`;

  const decisions = verification?.decisions ?? [];
  if (decisions.length) {
    html += `<section class="blueprint-priority"><h3>Check first</h3><p>These verifier decisions currently block readiness.</p><ol>` +
      decisions.slice(0, 6).map((item) => `<li><strong>${esc(DECISION[item.kind] ?? item.kind.replaceAll("_", " "))}</strong>` +
        (item.label ? `<span>${esc(item.label)}</span>` : "") + `</li>`).join("") +
      `</ol>${decisions.length > 6 ? `<p>${decisions.length - 6} more blocking decisions are listed in Verify.</p>` : ""}</section>`;
  } else if (priority.length) {
    html += `<section class="blueprint-priority"><h3>Review first</h3><p>No blocking verifier decision is recorded, but these items have the least certainty.</p><ul>` +
      priority.slice(0, 6).map((item) => `<li><strong>${esc(item.name)}</strong> ${chip(item.observation, item.evidenceIds)}</li>`).join("") +
      `</ul>${priority.length > 6 ? `<p>${priority.length - 6} more items are explained below.</p>` : ""}</section>`;
  }

  html += renderGroup("People", "Who takes part in this system.", blueprint.actors, (item) =>
    `<li class="blueprint-item" id="evidence-${esc(item.id)}" ${evidenceAttrs(item.evidenceIds)} tabindex="-1">` +
    `<div class="blueprint-item-head"><strong>${esc(item.name)}</strong>${chip(item.observation, item.evidenceIds)}</div>` +
    (item.summary ? `<p>${esc(item.summary)}</p>` : "") + technical(item.id, item.evidenceIds, item.observation) + `</li>`);

  html += renderGroup("What the application does", "The work people can ask the application to perform.", blueprint.behaviors, (item) =>
    `<li class="blueprint-item" id="evidence-${esc(item.id)}" ${evidenceAttrs(item.evidenceIds)} tabindex="-1">` +
    `<div class="blueprint-item-head"><strong>${esc(item.name)}</strong>${chip(item.observation, item.evidenceIds)}</div>` +
    (item.summary ? `<p>${esc(item.summary)}</p>` : "") + technical(item.id, item.evidenceIds, item.observation) + `</li>`);

  html += renderGroup("Approved journeys", "Examples of how people expect to use the application from start to finish.", blueprint.scenarios, (item) =>
    `<li class="blueprint-item" id="evidence-${esc(item.id)}" ${evidenceAttrs(item.evidenceIds)} tabindex="-1">` +
    `<div class="blueprint-item-head"><strong>${esc(item.name)}</strong>${chip(item.observation, item.evidenceIds)}</div>` +
    (item.principals?.length ? `<p class="surface-meta">People: ${item.principals.map((principal) => esc(name(principal.actor))).join(", ")}</p>` : "") +
    (item.steps?.length ? `<ol class="scenario-steps">${item.steps.map((step) =>
      `<li><span>${esc(step.as)}</span> asks to <strong>${esc(name(step.invoke))}</strong>${expectedOutcome(step.expect)}</li>`).join("")}</ol>` : "") +
    technical(item.id, item.evidenceIds, item.observation) + `</li>`);

  html += renderGroup("Connected work", "Larger pieces of work and whether their parts are ready together.", blueprint.flows, (item) =>
    `<li class="blueprint-item" id="evidence-${esc(item.id)}" ${evidenceAttrs(item.evidenceIds)} tabindex="-1">` +
    `<div class="blueprint-item-head"><strong>${esc(item.name)}</strong>${chip(item.observation, item.evidenceIds)}</div>` +
    `<p>Starts at <strong>${esc(name(item.entry))}</strong>.</p>` +
    (item.memberReadiness?.length ? `<ul class="flow-members">${item.memberReadiness.map((member) =>
      `<li><strong>${esc(name(member.member))}</strong>: ${member.holds} of ${member.commitments} checks hold` +
      `${member.violated ? `; ${member.violated} failed` : ""}${member.cannotVerify ? `; ${member.cannotVerify} not verified` : ""}</li>`).join("")}</ul>` : "") +
    technical(item.id, item.evidenceIds, item.observation) + `</li>`);

  html += renderGroup("How information changes", "The meaningful states information moves through.", blueprint.stateModels, (item) =>
    `<li class="blueprint-item" id="evidence-state-${esc(item.resourceId)}" tabindex="-1"><div class="blueprint-item-head">` +
    `<strong>${esc(item.resourceName)}</strong><span class="surface-meta">Starts as ${esc(item.initial)}</span></div>` +
    `<ol class="state-transitions">${item.transitions.map((transition) =>
      `<li>${chip(transition.observation, transition.evidenceIds)} <strong>${esc(transition.from)}</strong> becomes ` +
      `<strong>${esc(transition.to)}</strong> through ${transition.via.map((via) => esc(name(via))).join(", ")}</li>`).join("")}</ol>` +
    technical(item.resourceId, item.transitions.flatMap((transition) => transition.evidenceIds ?? []), aggregateObservation(item.transitions)) + `</li>`);

  html += renderGroup("Information", "The records and artifacts the application works with.", blueprint.resources, (item) =>
    `<li class="blueprint-item" id="evidence-${esc(item.id)}" ${evidenceAttrs(item.evidenceIds)} tabindex="-1">` +
    `<div class="blueprint-item-head"><strong>${esc(item.name)}</strong>${chip(item.observation, item.evidenceIds)}</div>` +
    (item.summary ? `<p>${esc(item.summary)}</p>` : "") + technical(item.id, item.evidenceIds, item.observation) + `</li>`);

  html += renderGroup("Ways into the application", "Where people or other systems can ask it to do something.", blueprint.surfaces, (item) =>
    `<li class="blueprint-item" id="evidence-${esc(item.id)}" ${evidenceAttrs(item.evidenceIds)} tabindex="-1">` +
    `<div class="blueprint-item-head"><strong>${esc(item.name)}</strong>${chip(item.observation, item.evidenceIds)}</div>` +
    (item.channel ? `<p class="surface-meta">${esc(CHANNEL[item.channel] ?? item.channel)} · ${esc(ACCESS[item.access] ?? item.access)}</p>` : "") +
    technical(item.id, item.evidenceIds, item.observation) + `</li>`);
  html += renderGroup("Needs your attention", "Observed work that the approved system does not clearly explain.", attention, (item) => {
    const id = item.key ?? item.surfaceId ?? item.elementId;
    return `<li class="blueprint-item" id="evidence-${esc(id)}" ${evidenceAttrs(item.evidenceIds)} tabindex="-1">` +
      `<div class="blueprint-item-head"><strong>${esc(item.name)}</strong>${chip(item.observation, item.evidenceIds)}</div>` +
      `<p>${esc(item.detail)}</p>${technical(id, item.evidenceIds, item.observation)}</li>`;
  });

  return `${html}</main>`;
}
