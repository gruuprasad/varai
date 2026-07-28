// Builder console: fingerprints, status, logs, interventions, messages.
// Never offers semantic Seed editing — product intent is approved elsewhere.

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function shortHash(hash) {
  return hash ? String(hash).replace(/^sha256:/, "").slice(0, 12) : "—";
}

/** Only http(s) preview links are safe to render as hrefs. */
export function safePreviewHref(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    // Prefer the caller string when it already parses; avoid inventing a trailing slash.
    return url.trim();
  } catch {
    return null;
  }
}

export function renderBuild({ session = null, live = { running: false }, events = [], adapters = [] } = {}) {
  if (!session) {
    const adapterOptions = adapters.length
      ? adapters.map((id) => `<option value="${esc(id)}">${esc(id)}</option>`).join("")
      : `<option value="" disabled>No builders configured</option>`;
    return `<div class="build-view build-empty"><h2>Build</h2>` +
      `<p class="empty-copy">No active build session. Start from an approved Seed fingerprint — the builder cannot edit intent.</p>` +
      `<div class="build-actions">` +
      `<label class="compose-label" for="build-adapter">Builder</label>` +
      `<select id="build-adapter" aria-label="Builder adapter">${adapterOptions}</select>` +
      `<button type="button" class="btn-primary" id="build-run" ${adapters.length ? "" : "disabled"}>Start build</button>` +
      `</div></div>`;
  }

  const state = session.lifecycleState ?? "unknown";
  const running = live?.running || session.builder?.running;
  let html = `<div class="build-view"><header class="build-head">` +
    `<h2>Build <span class="seed-badge build-state-${esc(state)}">${esc(state)}</span></h2>` +
    `<p class="build-fingerprint">Approved Seed <code title="${esc(session.seedHash ?? "")}">${esc(shortHash(session.seedHash))}</code>` +
    ` · session <code>${esc(session.id)}</code></p></header>`;

  if (session.builder?.adapterId) {
    html += `<p class="build-adapter">Adapter <strong>${esc(session.builder.adapterId)}</strong>` +
      (running ? ` <span class="seed-badge draft">running</span>` : "") + `</p>`;
  }

  const preview = safePreviewHref(session.previewUrl);
  if (preview) {
    html += `<p class="build-preview">Preview <a href="${esc(preview)}" rel="noreferrer noopener">${esc(preview)}</a></p>`;
  } else if (session.previewUrl) {
    html += `<p class="build-preview build-preview-blocked">Preview link blocked (only http/https allowed).</p>`;
  }

  const files = session.changedFiles ?? [];
  if (files.length) {
    html += `<section class="build-files"><h3>Changed files</h3><ul>` +
      files.map((file) => `<li><code>${esc(file)}</code></li>`).join("") + `</ul></section>`;
  }

  const interventions = session.interventions ?? [];
  if (interventions.length) {
    html += `<section class="build-interventions"><h3>Interventions</h3><ul>` +
      interventions.map((item) =>
        `<li class="intervention"><code>${esc(item.path)}</code>` +
        (item.at ? ` <time>${esc(item.at)}</time>` : "") + `</li>`).join("") +
      `</ul></section>`;
  }

  html += `<section class="build-log"><h3>Event stream</h3>`;
  if (!events.length) {
    html += `<p class="empty-copy">No builder events yet.</p>`;
  } else {
    html += `<ul class="build-events">` + events.map((event) => {
      const text = event.text ?? event.message ?? JSON.stringify(event);
      const kind = event.type ?? event.stream ?? "event";
      return `<li class="build-event build-event-${esc(kind)}"><span class="event-kind">${esc(kind)}</span> ${esc(text)}</li>`;
    }).join("") + `</ul>`;
  }
  html += `</section>`;

  if (running) {
    html += `<div class="build-actions">` +
      `<label class="compose-label" for="build-message">Message to builder</label>` +
      `<textarea id="build-message" rows="2" placeholder="Clarify product intent for the builder…"></textarea>` +
      `<button type="button" class="btn-primary" id="build-send">Send message</button>` +
      `<button type="button" class="btn-quiet" id="build-stop">Stop builder</button>` +
      `</div>`;
  }

  return `${html}</div>`;
}
