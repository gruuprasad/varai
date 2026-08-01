// Verification control room: decisions first, evidence as focus targets.
// Ready chrome is structurally impossible unless gate.state === "ready"
// AND there are zero decisions.

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

function evidenceFocusButtons(ids = []) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return "";
  return `<span class="evidence-focus-group">` +
    unique.map((id) =>
      `<button type="button" class="evidence-focus btn-quiet" data-evidence-target="${esc(id)}" ` +
      `aria-label="Focus evidence ${esc(id)}">${esc(id)}</button>`
    ).join(" ") +
    `</span>`;
}

export function renderVerification(verification) {
  if (!verification || verification.phase === "empty" || (!verification.gate && !verification.decisions?.length)) {
    return `<div class="verification verification-empty"><h2>Verify</h2>` +
      `<p class="empty-copy">No verification yet — approve a Seed and run a build to see readiness decisions.</p></div>`;
  }

  const ready = isReady(verification);
  // When decisions exist, never emit ready wording — even if gate.state says ready.
  const state = ready
    ? READY_BADGE_TEXT
    : (verification.decisions?.length
      ? "needs_attention"
      : (verification.gate?.state === "ready" ? "needs_attention" : (verification.gate?.state ?? verification.phase ?? "unknown")));
  const badgeLabel = state;
  const badgeClass = ready ? "ratified" : "draft";

  let html = `<div class="verification${ready ? ` ${READY_CHROME_CLASS}` : " gate-blocked"}">` +
    `<header class="verification-head"><h2>Verify ` +
    `<span class="seed-badge ${badgeClass}" aria-label="${esc(badgeLabel)}">${esc(badgeLabel)}</span>` +
    `</h2></header>`;

  const decisions = verification.decisions ?? [];
  if (decisions.length) {
    html += `<section class="verification-decisions"><h3>Decisions</h3><ul class="decision-list">`;
    for (const decision of decisions) {
      const title = DECISION_LABELS[decision.kind] ?? decision.kind;
      const ids = decision.evidenceIds?.length ? decision.evidenceIds : [decision.id];
      html += `<li class="decision decision-${esc(decision.kind)}" id="evidence-${esc(decision.id)}" ${evidenceAttrs(ids)} tabindex="-1">` +
        `<strong>${esc(title)}</strong> ` +
        `<span class="decision-label">${esc(decision.label ?? decision.id)}</span> ` +
        `<code>${esc(decision.id)}</code> ` +
        (decision.detail ? `<small class="decision-detail">evidence: ${esc(decision.detail)}</small> ` : "") +
        evidenceFocusButtons(ids) +
        `</li>`;
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

  html += `<p class="verification-evidence-help empty-copy">Use an evidence id button to focus the matching decision or blueprint item in this control room.</p>`;

  return `${html}</div>`;
}
