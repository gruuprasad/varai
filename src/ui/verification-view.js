// Verification control room: decisions first, evidence as drill-down.
// Ready chrome is structurally impossible unless gate.state === "ready".

export const READY_CHROME_CLASS = "gate-ready";
export const READY_BADGE_TEXT = "Ready";

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const DECISION_LABELS = Object.freeze({
  missing_behavior: "Missing required behavior",
  failed_scenario: "Failed scenario",
  unaccounted_surface: "Unaccounted public surface",
  coverage_degradation: "Coverage degradation",
  stale_binding: "Stale or ambiguous binding",
  unattested: "Unattested changes",
});

function evidenceAttrs(ids = []) {
  return ids.map((id) => `data-evidence-id="${esc(id)}"`).join(" ");
}

function isReady(verification) {
  return verification?.gate?.state === "ready" && !(verification.decisions?.length);
}

export function renderVerification(verification) {
  if (!verification || verification.phase === "empty" || (!verification.gate && !verification.decisions?.length)) {
    return `<div class="verification verification-empty"><h2>Verify</h2>` +
      `<p class="empty-copy">No verification yet — approve a Seed and run a build to see readiness decisions.</p></div>`;
  }

  const ready = isReady(verification);
  const state = verification.gate?.state ?? verification.phase ?? "unknown";

  // Ready chrome only when the gate itself is ready. Class + badge + aria are
  // the contract tests assert against; never emit them for failing gates.
  let html = `<div class="verification${ready ? ` ${READY_CHROME_CLASS}` : " gate-blocked"}">` +
    `<header class="verification-head"><h2>Verify ` +
    (ready
      ? `<span class="seed-badge ratified" aria-label="${READY_BADGE_TEXT}">${READY_BADGE_TEXT}</span>`
      : `<span class="seed-badge draft" aria-label="${esc(state)}">${esc(state)}</span>`) +
    `</h2></header>`;

  const decisions = verification.decisions ?? [];
  if (decisions.length) {
    html += `<section class="verification-decisions"><h3>Decisions</h3><ul class="decision-list">`;
    for (const decision of decisions) {
      const title = DECISION_LABELS[decision.kind] ?? decision.kind;
      html += `<li class="decision decision-${esc(decision.kind)}" ${evidenceAttrs(decision.evidenceIds)}>` +
        `<strong>${esc(title)}</strong> ` +
        `<span class="decision-label">${esc(decision.label ?? decision.id)}</span> ` +
        `<code>${esc(decision.id)}</code></li>`;
    }
    html += `</ul></section>`;
  } else if (ready) {
    html += `<p class="empty-copy">All critical gates hold for this recorded build.</p>`;
  }

  if (verification.gate?.reasons?.length) {
    html += `<details class="verification-reasons"><summary>Gate reasons (${verification.gate.reasons.length})</summary><ul>` +
      verification.gate.reasons.map((reason) => `<li><code>${esc(reason)}</code></li>`).join("") +
      `</ul></details>`;
  }

  html += `<details class="verification-drilldown"><summary>Architecture &amp; evidence drill-down</summary>` +
    `<p class="empty-copy">Open Architecture for surface → API → resource projections, or expand a decision to follow its evidence ids.</p>` +
    `</details>`;

  return `${html}</div>`;
}
