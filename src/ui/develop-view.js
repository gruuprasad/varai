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

export function renderDevelop({ seed = {}, controlRoom = {} } = {}) {
  const phase = controlRoom.phase ?? "empty";
  const build = controlRoom.build ?? { session: null, live: { running: false }, events: [], adapters: [] };
  const running = Boolean(build.live?.running || build.session?.builder?.running);
  const conversation = seed.conversation ?? seed.authoring?.conversation ?? [];
  const messages = conversation.map((item) => message(
    item.role === "user" ? "user" : "assistant",
    item.role === "assistant" ? assistantText(item.content) : item.content,
    item.role === "user" ? "You" : "Product assistant",
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
      `<label class="compose-label" for="develop-message">${seed.ratified ? "Describe the next product change" : "What should we build?"}</label>` +
      `<textarea id="develop-message" rows="4" placeholder="Build a booking application where…" ${canAsk ? "" : "disabled"}></textarea>` +
      `<button class="btn-primary" id="develop-send" data-target="intent" type="button" ${canAsk ? "" : "disabled"}>Send</button>` +
      (canAsk ? "" : `<p class="compose-note">Configure the Seed assistant to use product chat.</p>`);
  }

  return `<div class="develop-view"><header class="develop-head"><h2>Develop</h2>` +
    `<span class="seed-badge build-state-${esc(phase)}">${esc(phase.replaceAll("_", " "))}</span>` +
    `<p>One conversation; explicit product approval; independently checked implementation.</p></header>` +
    `<ol class="develop-thread">${messages.join("")}</ol>` +
    `<section class="develop-compose">${action}</section></div>`;
}
