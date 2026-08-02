// Human-facing projection of the forward verification plan. It describes the
// method and limits before a build; it never renders an outcome as a verdict.

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");

const METHOD_LABELS = Object.freeze({
  deterministic: "deterministic check",
  runtime: "runtime scenario",
  measurement: "declared measurement",
  judgment: "human or AI judgment",
  recorded_only: "recorded context",
});

export function renderVerificationPlan(plan = null, { limit = 12 } = {}) {
  if (!plan?.obligations?.length) return "";
  const obligations = plan.obligations.slice(0, limit);
  const hidden = plan.obligations.length - obligations.length;
  const rows = obligations.map((item) => {
    const method = METHOD_LABELS[item.method] ?? item.method;
    const roleText = item.roles?.length ? ` · ${item.roles.join(", ")}` : "";
    const limitText = item.blocking ? "required for readiness" : "not machine-checked";
    return `<li class="verification-plan-item">` +
      `<div><strong>${esc(item.title ?? item.id)}</strong><span class="verification-plan-method">${esc(method)}</span></div>` +
      `<small><code>${esc(item.id)}</code> · ${esc(limitText)}${esc(roleText)}</small>` +
      `</li>`;
  }).join("");
  return `<section class="verification-plan" aria-labelledby="verification-plan-title">` +
    `<header><h3 id="verification-plan-title">How Varai will check this</h3>` +
    `<p>These checks are planned before the builder runs. AI or builder explanations do not replace independent evidence.</p></header>` +
    `<ul>${rows}</ul>` +
    (hidden > 0 ? `<p class="verification-plan-more">${hidden} more planned checks are included in the build packet.</p>` : "") +
    `</section>`;
}
