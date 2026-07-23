// Verdict-first presentation of the reconciliation review. Ordering is by what
// needs attention — never by concept id. Builder testimony stays visually
// separate from independently observed evidence; nothing here re-decides a verdict.

import { verdictLabel, reasonLabel, bindingStateLabel, seedRelationText } from "../reporters/display-language.js";
import { renderReadingOrder } from "./review-view.js";

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Attention order: what is wrong, then what is uncertain, then what is merely
// recorded, then what is fine.
export const BUCKETS = Object.freeze([
  ["violated", "Missing", "varai could not find these in the code."],
  ["cannot_verify", "Couldn't tell", "varai found something but could not confirm it."],
  ["not_checkable", "Noted", "Recorded in your spec, but not the kind of rule varai can check."],
  ["holds", "Confirmed", "Found in the code."],
]);

export function allCards(review) {
  return (review?.groups ?? []).flatMap((group) => group.cards);
}

export function bucketCards(review) {
  const cards = allCards(review);
  return BUCKETS
    .map(([verdict, title, blurb]) => ({
      verdict, title, blurb,
      cards: cards.filter((card) => card.verdict === verdict),
    }))
    .filter((bucket) => bucket.cards.length > 0);
}

export function requirementSentence(card) {
  const source = card.sourceName ?? card.source;
  const target = card.targetName ?? (card.target?.concept ?? card.target?.literal ?? "");
  return `${source} ${seedRelationText(card.relation)} ${target}`.trim();
}

export function headlineSentence(review) {
  const { holds, violated, cannotVerify, notCheckable } = review.summary;
  const checkable = holds + violated + cannotVerify;
  const parts = [`<strong>${holds} of ${checkable} requirements are confirmed in the code.</strong>`];
  if (violated) parts.push(`${violated} ${violated === 1 ? "is" : "are"} missing.`);
  if (cannotVerify) parts.push(`${cannotVerify} couldn't be checked.`);
  if (notCheckable) parts.push(`${notCheckable} ${notCheckable === 1 ? "is" : "are"} noted but not the kind of rule varai can check.`);
  return parts.join(" ");
}

function evidenceByFile(steps) {
  const files = new Map();
  for (const step of steps ?? []) {
    const lines = files.get(step.file) ?? [];
    if (step.line != null) lines.push(step.line);
    files.set(step.file, lines);
  }
  return [...files].map(([file, lines]) => ({ file, lines: [...new Set(lines)].sort((a, b) => a - b) }));
}

// Chips and their snippet holders must be siblings: app.js's toggleSnippet()
// looks the holder up with button.parentElement.querySelector(...), so wrapping
// the chips in their own span would break source peeking.
function renderEvidence(steps) {
  const grouped = evidenceByFile(steps);
  if (!grouped.length) return `<p class="empty-copy">No location.</p>`;
  return `<ul class="evidence-list">` + grouped.map(({ file, lines }) =>
    `<li><code>${esc(file)}</code>` +
    lines.map((line) =>
      `<button class="line-chip trace-step" data-file="${esc(file)}" data-line="${line}">${line}</button>` +
      `<div class="snippet" data-snippet="${esc(`${file}:${line}`)}" hidden></div>`).join("") +
    `</li>`).join("") + `</ul>`;
}

function renderRow(card, expanded) {
  return `<article class="req-row${expanded ? " open" : ""}">` +
    `<button class="req-head" data-expand="${esc(card.id)}" aria-expanded="${expanded}">` +
    `<span class="req-verdict verdict-${esc(card.verdict)}">${esc(verdictLabel(card.verdict))}</span>` +
    `<span class="req-text">${esc(requirementSentence(card))}</span>` +
    `<span class="chevron">›</span></button>` +
    (expanded ? renderRowDetail(card) : "") +
    `</article>`;
}

function renderRowDetail(card) {
  const reasons = card.reasons?.length
    ? `<p class="reason-line">why: ${esc(card.reasons.map((code) => reasonLabel(code)).join("; "))}</p>`
    : "";
  const builder = card.bindings?.length
    ? `<ul class="binding-list">` + card.bindings.map((binding) =>
        `<li>${esc(binding.elements.map((element) => element.name).join(", ") || binding.concept)} ` +
        `<span class="binding-state binding-${esc(binding.state)}">${esc(bindingStateLabel(binding.state))}</span></li>`).join("") + `</ul>`
    : `<p class="empty-copy">No location given.</p>`;
  const found = card.claims?.length
    ? card.claims.map((claim) =>
        `<div class="claim"><p><strong>${esc(claim.targetName)}</strong> <span class="state-mark">${esc(claim.claimState)}</span></p>` +
        renderEvidence(claim.implementationPath?.length ? claim.implementationPath : claim.evidence) + `</div>`).join("")
    : `<p class="empty-copy">Nothing matching found in the code.</p>`;

  return `<div class="req-detail">${reasons}<div class="truth-columns">` +
    `<section><h4>You asked</h4><p class="asked">${esc(requirementSentence(card))}</p></section>` +
    `<section><h4>The builder says</h4>${builder}</section>` +
    `<section><h4>varai found</h4>${found}</section>` +
    `</div>${renderReadingOrder(card)}</div>`;
}

export function renderReport(review, { expandedId } = {}) {
  if (!review) return `<p class="empty-copy">Waiting for the scan to finish…</p>`;
  const badge = review.ratified ? "approved" : "draft";
  let html = `<section class="report-head">` +
    `<h2>${esc(review.system?.name ?? "System")} <span class="seed-badge ${review.ratified ? "ratified" : "draft"}">${badge}</span></h2>` +
    `<p class="headline">${headlineSentence(review)}</p></section>`;

  const buckets = bucketCards(review);
  if (!buckets.length) return html + `<p class="empty-copy">No requirements match this search.</p>`;

  for (const bucket of buckets) {
    html += `<section class="req-bucket bucket-${esc(bucket.verdict)}">` +
      `<h3>${esc(bucket.title)} <span class="bucket-count">${bucket.cards.length}</span></h3>` +
      `<p class="bucket-blurb">${esc(bucket.blurb)}</p>` +
      bucket.cards.map((card) => renderRow(card, card.id === expandedId)).join("") +
      `</section>`;
  }

  if (review.context?.length) {
    html += `<details class="report-notes"><summary>Notes from your spec (${review.context.length})</summary>` +
      `<ul>${review.context.map((entry) => `<li>${esc(entry.text)}</li>`).join("")}</ul></details>`;
  }
  if (review.coverageLimitations?.length) {
    html += `<details class="report-limits"><summary>Limits of this check (${review.coverageLimitations.length})</summary>` +
      `<ul>${review.coverageLimitations.map((item) =>
        `<li>${esc(item.id.replace(/^commitment\./, ""))} — ${esc(item.reasons.map((code) => reasonLabel(code)).join("; "))}</li>`).join("")}</ul></details>`;
  }
  return html;
}
