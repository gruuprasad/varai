import { renderVerificationPlan } from "./verification-plan-view.js";
import { DEVELOPMENT_ROLE_IDS, DEVELOPMENT_ROLES, getDevelopmentRole } from "../development-roles/definitions.js";

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function assistantText(content) {
  try {
    const value = JSON.parse(content);
    const items = [...(value.questions ?? []), ...(value.unsupported ?? [])];
    return items.length ? items.join(" ") : "I prepared a product draft for your review.";
  } catch {
    return content;
  }
}

function message(role, text, label) {
  return `<li class="develop-message develop-${esc(role)}"><small>${esc(label)}</small><p>${esc(text)}</p></li>`;
}

function roleOptions(activeRole, disabled = false) {
  return DEVELOPMENT_ROLE_IDS.map((id) => {
    const role = DEVELOPMENT_ROLES[id];
    return `<option value="${esc(id)}"${id === activeRole ? " selected" : ""}${disabled ? " disabled" : ""}>${esc(role.label)} — ${esc(role.responsibility)}</option>`;
  }).join("");
}

function renderRoleLens(development, activeRole) {
  const selected = development?.roles?.[activeRole];
  if (!selected) return "";
  const intent = selected.intent ?? {};
  const observed = selected.observed ?? {};
  const evidence = selected.evidence ?? {};
  const count = (value) => Array.isArray(value) ? value.length : 0;
  const surfaceEvidence = evidence.surfaces ?? {};
  const evidenceCount = count(evidence.commitments) + count(evidence.scenarios)
    + count(surfaceEvidence.accounted) + count(surfaceEvidence.missing)
    + count(surfaceEvidence.ambiguous) + count(surfaceEvidence.stale);
  return `<section class="develop-role-lens" aria-labelledby="develop-role-title">` +
    `<header><h3 id="develop-role-title">${esc(selected.role.label)} lens</h3>` +
    `<p>${esc(selected.role.responsibility)} This is an advisory projection over the shared Seed and System Model; it cannot change the verifier gate.</p></header>` +
    `<div class="develop-role-stats">` +
      `<span><b>${count(intent.concepts)}</b> intent concepts</span>` +
      `<span><b>${count(intent.commitments)}</b> commitments</span>` +
      `<span><b>${count(intent.surfaces)}</b> surfaces</span>` +
      `<span><b>${count(observed.elements)}</b> observed elements</span>` +
      `<span><b>${evidenceCount}</b> evidence items</span>` +
    `</div>` +
    `<small class="develop-role-boundary">AI suggestions remain advisory. Deterministic reconciliation and human approval remain authoritative.</small>` +
  `</section>`;
}

export function renderDevelop({ seed = {}, controlRoom = {}, activeRole = "product" } = {}) {
  const selectedRole = getDevelopmentRole(activeRole)?.id ?? "product";
  const phase = controlRoom.phase ?? "empty";
  const build = controlRoom.build ?? { session: null, live: { running: false }, events: [], adapters: [] };
  const running = Boolean(build.live?.running || build.session?.builder?.running);
  const conversation = seed.conversation ?? seed.authoring?.conversation ?? [];
  const messages = conversation.map((item) => message(
    item.role === "user" ? "user" : "assistant",
    item.role === "assistant" ? assistantText(item.content) : item.content,
    item.role === "user" ? "You" : `${getDevelopmentRole(item.developmentRole)?.label ?? "Product"} assistant`,
  ));

  for (const event of (build.events ?? []).slice(-30)) {
    const text = event.text ?? event.message;
    if (!text) continue;
    messages.push(message(event.role === "user" ? "user" : "builder", text.trim(), event.role === "user" ? "You" : "Builder"));
  }

  if (controlRoom.verification?.gate) {
    const state = controlRoom.verification.gate.state;
    messages.push(message("verifier",
      state === "ready" ? "The approved product and observed application agree within declared coverage."
        : `Verification needs attention: ${controlRoom.verification.decisions?.length ?? 0} decision(s) require review.`,
      "Independent verifier"));
  }

  if (!messages.length) {
    messages.push(message("assistant", "Tell me what application you want to build. I’ll turn it into an explicit product model for you to review before any code changes.", "Product assistant"));
  }

  let action;
  if (seed.draft?.draft) {
    action = `<p class="develop-next">A product draft is waiting for your decision.</p>` +
      `<button class="btn-primary" id="develop-review" type="button">Review and approve draft</button>`;
  } else if (running) {
    action = `<label class="compose-label" for="develop-message">Message the builder</label>` +
      `<textarea id="develop-message" rows="3" placeholder="Clarify the requested behavior…"></textarea>` +
      `<button class="btn-primary" id="develop-send" data-target="builder" type="button">Send to builder</button>`;
  } else {
    const canAsk = Boolean(seed.assistant);
    const adapters = build.adapters ?? [];
    const buildAction = seed.ratified && phase !== "ready" && adapters.length
      ? `<div class="develop-build"><select id="develop-adapter" aria-label="Builder adapter">${adapters.map((id) => `<option value="${esc(id)}">${esc(id)}</option>`).join("")}</select>` +
        `<button class="btn-primary" id="develop-build" type="button">${build.session ? "Rebuild approved product" : "Build application"}</button></div>`
      : "";
    action = buildAction +
      `<label class="compose-label" for="develop-role">Work through a role lens</label>` +
      `<select id="develop-role" aria-label="Development role" ${canAsk ? "" : "disabled"}>${roleOptions(selectedRole, !canAsk)}</select>` +
      `<p class="compose-note">${esc(DEVELOPMENT_ROLES[selectedRole].responsibility)} The same approved intent and builder remain underneath.</p>` +
      `<label class="compose-label" for="develop-message">${seed.ratified ? "Describe the next product change" : "What should we build?"}</label>` +
      `<textarea id="develop-message" rows="4" placeholder="Build a booking application where…" ${canAsk ? "" : "disabled"}></textarea>` +
      `<button class="btn-primary" id="develop-send" data-target="intent" type="button" ${canAsk ? "" : "disabled"}>Send</button>` +
      (canAsk ? "" : `<p class="compose-note">Configure the Seed assistant to use product chat.</p>`);
  }

  return `<div class="develop-view"><header class="develop-head"><h2>Develop</h2>` +
    `<span class="seed-badge build-state-${esc(phase)}">${esc(phase.replaceAll("_", " "))}</span>` +
    `<p>One conversation; explicit product approval; independently checked implementation.</p></header>` +
    `<ol class="develop-thread">${messages.join("")}</ol>` +
    renderRoleLens(controlRoom.development, selectedRole) +
    renderVerificationPlan(controlRoom.verification?.plan) +
    `<section class="develop-compose">${action}</section></div>`;
}
