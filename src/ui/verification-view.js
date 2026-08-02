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

function renderRoleEvidence(development) {
  const roles = Object.values(development?.roles ?? {});
  if (!roles.length) return "";
  const suggested = new Set(development.suggestedRoles ?? []);
  return `<section class="verification-role-evidence"><h3>Role lenses over the same result</h3>` +
    `<p class="empty-copy">Each lens filters shared evidence. Role lenses cannot change the readiness gate.</p><ul>` +
    roles.map((item) => {
      const intent = item.intent ?? {};
      const observed = item.observed ?? {};
      const evidence = item.evidence ?? {};
      const surfaces = evidence.surfaces ?? {};
      const total = (evidence.obligations ?? 0) + (evidence.commitments ?? 0) + (evidence.scenarios ?? 0)
        + (surfaces.accounted ?? 0) + (surfaces.missing ?? 0) + (surfaces.ambiguous ?? 0) + (surfaces.stale ?? 0);
      const review = item.review;
      const reviewStatus = review?.status?.state ?? null;
      const reviewHtml = review
        ? `<div class="role-review"><small>AI review · ${esc(reviewStatus ?? "advisory")} · advisory only</small>` +
          `<p>${esc(review.summary)}</p>` +
          (review.findings?.length ? `<ul>${review.findings.map((finding) =>
            `<li><span>${esc(finding.statement)}</span> <em>${esc(finding.certainty)}</em>` +
            (finding.evidenceIds?.length ? ` <code>${esc(finding.evidenceIds.join(", "))}</code>` : "") +
            (development.reviewerAvailable ? ` <button type="button" class="btn-quiet role-review-change" data-review-change data-role="${esc(item.role?.id)}" data-message="${esc(finding.statement)}">Propose change</button>` : "") +
            `</li>`).join("")}</ul>` : "") +
          `</div>`
        : (development.reviewerAvailable ? `<button type="button" class="btn-quiet role-review-ask" data-role-review="${esc(item.role?.id)}">Ask AI reviewer</button>` : "");
      return `<li><div><strong>${esc(item.role?.label ?? item.role?.id)}</strong>` +
        `${suggested.has(item.role?.id) ? `<span class="role-chip">suggested</span>` : ""}</div>` +
        `<small>${esc(item.role?.responsibility ?? "")} · ${total} evidence items` +
        `${(evidence.decisionIds ?? []).length ? ` · ${evidence.decisionIds.length} attention item(s)` : ""}</small>${reviewHtml}</li>`;
    }).join("") +
    `</ul></section>`;
}

export function renderVerification(verification, development = null) {
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
  html += renderRoleEvidence(development);

  return `${html}</div>`;
}
