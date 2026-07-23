// Pure Domain Review presentation helpers. Builder testimony (bindings) is
// always visually separate from independently observed evidence (claims).
// Reading order is a deterministic suggestion, never an LLM narration.

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function shortHash(hash) {
  return hash ? String(hash).replace(/^sha256:/, "").slice(0, 12) : "—";
}

const VERDICT_LABELS = {
  holds: "holds",
  violated: "violated",
  cannot_verify: "cannot verify",
  not_checkable: "not checkable",
};

export function verdictChip(verdict) {
  return `<span class="verdict-chip verdict-${esc(verdict)}">${esc(VERDICT_LABELS[verdict] ?? verdict)}</span>`;
}

function formatTarget(target) {
  if (target?.concept !== undefined) return target.concept;
  return JSON.stringify(target?.literal);
}

export function renderReviewOverview(review) {
  if (!review) return "";
  const { summary, realization } = review;
  const realizationBadge = !realization?.present
    ? `<span class="seed-badge missing">witness missing</span>`
    : realization.stale
      ? `<span class="seed-badge git-dirty">witness stale</span>`
      : `<span class="seed-badge ratified">witness current</span>`;
  return `<section class="review-overview">` +
    `<h2>${esc(review.system?.name ?? "System")}</h2>` +
    `<div class="review-overview-row">` +
    `<span class="seed-badge ${review.ratified ? "ratified" : "draft"}">${review.ratified ? "ratified" : "draft"}</span>` +
    `<span class="seed-hash" title="${esc(review.seedHash ?? "")}">${esc(shortHash(review.seedHash))}</span>` +
    realizationBadge +
    `</div>` +
    `<div class="review-counts">` +
    `<span class="review-count holds"><strong>${summary.holds}</strong> realized</span>` +
    `<span class="review-count violated"><strong>${summary.violated}</strong> missing</span>` +
    `<span class="review-count cannot"><strong>${summary.cannotVerify}</strong> unverified</span>` +
    `<span class="review-count context"><strong>${summary.notCheckable}</strong> human context</span>` +
    `</div>` +
    (review.context?.length
      ? `<ul class="review-context">${review.context.map((entry) => `<li>${esc(entry.text)}</li>`).join("")}</ul>`
      : "") +
    `</section>`;
}

export function renderGroupHeading(group) {
  return `<h3 class="group-heading"><code>${esc(group.concept)}</code> ` +
    `<span class="group-score">${group.holds}/${group.total} realized</span></h3>`;
}

export function renderCompactCard(card, expanded) {
  const target = formatTarget(card.target);
  return `<article class="card review-card${expanded ? " selected open" : ""}">` +
    `<button class="card-head" data-expand="${esc(card.id)}" aria-expanded="${expanded}">` +
    `<span class="card-title">${verdictChip(card.verdict)} <strong>${esc(card.id.replace(/^commitment\./, ""))}</strong>` +
    `<small><code>${esc(card.source)}</code> ${esc(card.relation)} <code>${esc(target)}</code></small></span>` +
    `<span class="chevron">›</span></button></article>`;
}


function renderBinding(binding) {
  const names = binding.elements.map((element) => element.name).join(", ");
  const state = binding.reason ? `${binding.state} (${binding.reason})` : binding.state;
  return `<li><code>${esc(binding.id)}</code> <span class="binding-state binding-${esc(binding.state)}">${esc(state)}</span>` +
    (names ? ` <span class="binding-target">→ ${esc(names)}</span>` : "") + `</li>`;
}

function renderClaimEvidence(claim) {
  const steps = (claim.implementationPath?.length ? claim.implementationPath : claim.evidence)
    .map((step, index) =>
      `<li><button class="trace-step" data-file="${esc(step.file)}" data-line="${step.line ?? 1}">` +
      `<span class="step-num">${index + 1}</span><code class="trace-code">${esc(step.symbol ? `${step.symbol} · ${step.file}` : step.file)}${step.line ? `:${step.line}` : ""}</code></button>` +
      `<div class="snippet" data-snippet="${esc(`${step.file}:${step.line ?? 1}`)}" hidden></div></li>`).join("");
  return `<div class="claim"><p><span class="relation-chip rel-${esc(claim.relation)}">${esc(claim.relation)}</span> ` +
    `<strong class="claim-target">${esc(claim.targetName)}</strong> <span class="state-mark">${esc(claim.claimState)}</span></p>` +
    (steps ? `<ol class="trace">${steps}</ol>` : "") + `</div>`;
}

export function renderReadingOrder(card) {
  if (!card.readingOrder?.length) return "";
  const items = card.readingOrder.map((step, index) =>
    `<li class="reading-step"><span class="step-why">${esc(step.why)}</span>` +
    `<button class="trace-step" data-file="${esc(step.file)}" data-line="${step.line ?? 1}">` +
    `<span class="step-num">${index + 1}</span><code class="trace-code">${esc(step.symbol ? `${step.symbol} · ${step.file}` : step.file)}${step.line ? `:${step.line}` : ""}</code></button>` +
    `<div class="snippet" data-snippet="${esc(`${step.file}:${step.line ?? 1}`)}" hidden></div></li>`).join("");
  return `<section class="reading-order"><h4>Suggested code-reading order</h4><ol class="trace">${items}</ol></section>`;
}

export function renderCardDetail(card) {
  const coverage = card.coverage?.length
    ? `<p class="coverage-line">coverage: ${card.coverage.map((record) => `<span class="coverage-chip cov-${esc(record.state)}">${esc(record.capability)} ${esc(record.state)}</span>`).join(" ")}</p>`
    : "";
  const reasons = card.reasons?.length
    ? `<p class="reason-line">reasons: <code>${card.reasons.map(esc).join(", ")}</code></p>`
    : "";
  const envelope = card.envelope
    ? `<p class="envelope-line">behavioral envelope: <strong>${esc(card.envelope.name)}</strong> (${esc(card.envelope.completeness ?? "")})</p>`
    : "";
  return `<div class="review-detail">` +
    `<h3>${verdictChip(card.verdict)} <code>${esc(card.id)}</code></h3>` +
    `<p class="commitment-sentence"><code>${esc(card.source)}</code> <strong>${esc(card.relation)}</strong> <code>${esc(formatTarget(card.target))}</code></p>` +
    reasons + coverage + envelope +
    `<section class="review-columns">` +
    `<div class="review-col testimony"><h4>Builder testimony</h4>` +
    (card.bindings.length ? `<ul class="binding-list">${card.bindings.map(renderBinding).join("")}</ul>` : `<p class="empty-copy">No bindings — unbound.</p>`) +
    `</div>` +
    `<div class="review-col observed"><h4>Independently observed</h4>` +
    (card.claims.length ? card.claims.map(renderClaimEvidence).join("") : `<p class="empty-copy">No matching canonical claims.</p>`) +
    `</div>` +
    `</section>` +
    renderReadingOrder(card) +
    `</div>`;
}

export function renderCoverageLimitations(review) {
  if (!review?.coverageLimitations?.length) return "";
  const items = review.coverageLimitations.map((item) =>
    `<li><code>${esc(item.id)}</code> — <code>${item.reasons.map(esc).join(", ")}</code>` +
    (item.coverage?.length
      ? ` <span class="coverage-chip cov-${esc(item.coverage[0].state)}">${esc(item.coverage[0].capability)} ${esc(item.coverage[0].state)}</span>`
      : "") +
    `</li>`).join("");
  return `<section class="coverage-limitations"><h3>What Varai could not determine</h3><ul>${items}</ul></section>`;
}
