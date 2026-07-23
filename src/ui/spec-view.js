// The approved spec, presented as a document. Verdicts are joined onto seed
// commitments by id — this module never decides one. Spec shows the document;
// the evidence pane (wired in `app.js`) reuses Report's card — rows select via
// `data-expand`, and only "See the report →" leaves Spec.

import { seedRelationText, verdictLabel } from "../reporters/display-language.js";
import { shortHash } from "./intent-view.js";

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Domain reading order: who acts, what they do, what it touches. Copied rather
// than imported from ../seed/schema.js — the server only serves /reporters/ to
// the browser (src/server/index.js), so importing from ../seed/ would 404 and
// take the whole module graph down with it. A test pins this to CONCEPT_ROLES
// so the copy cannot drift.
export const ROLE_ORDER = Object.freeze(["actor", "behavior", "resource", "condition", "outcome"]);
const ROLE_RANK = new Map(ROLE_ORDER.map((role, index) => [role, index]));

export function verdictById(review) {
  const verdicts = new Map();
  for (const group of review?.groups ?? []) {
    for (const card of group.cards) verdicts.set(card.id, card.verdict);
  }
  return verdicts;
}

function targetName(target, nameOf) {
  return target?.concept !== undefined ? nameOf(target.concept) : String(target?.literal);
}

export function specSections(seed, review) {
  const nameOf = (id) => seed.concepts.find((concept) => concept.id === id)?.name ?? id;
  const verdicts = verdictById(review);

  const referenced = new Map();
  for (const commitment of seed.commitments) {
    const id = commitment.target?.concept;
    if (id) referenced.set(id, (referenced.get(id) ?? 0) + 1);
  }

  return [...seed.concepts]
    .sort((a, b) => (ROLE_RANK.get(a.role) ?? 99) - (ROLE_RANK.get(b.role) ?? 99) || a.name.localeCompare(b.name))
    .map((concept) => ({
      concept,
      referencedBy: referenced.get(concept.id) ?? 0,
      requirements: seed.commitments
        .filter((commitment) => commitment.source === concept.id)
        .map((commitment) => ({
          id: commitment.id,
          text: `${seedRelationText(commitment.relation)} ${targetName(commitment.target, nameOf)}`,
          note: commitment.note ?? null,
          verdict: verdicts.get(commitment.id) ?? null,
        }))
        .sort((a, b) => a.text.localeCompare(b.text)),
    }));
}

function renderRequirement(requirement, expandedId) {
  const verdict = requirement.verdict
    ? `<span class="spec-verdict verdict-${esc(requirement.verdict)}">${esc(verdictLabel(requirement.verdict))}</span>`
    : `<span class="spec-verdict spec-unchecked">not checked yet</span>`;
  const selected = requirement.id === expandedId;
  return `<button class="spec-req${selected ? " selected" : ""}" data-expand="${esc(requirement.id)}" ` +
    `aria-expanded="${selected}" title="Show why varai scored this">` +
    `<span class="spec-req-text">${esc(requirement.text)}` +
    (requirement.note ? `<span class="spec-req-note">${esc(requirement.note)}</span>` : "") +
    `</span>${verdict}</button>`;
}

function renderSection(section, expandedId) {
  const { concept, requirements, referencedBy } = section;
  const body = requirements.length
    ? requirements.map((requirement) => renderRequirement(requirement, expandedId)).join("")
    : `<p class="spec-refs">${referencedBy
        ? `Referenced by ${referencedBy} ${referencedBy === 1 ? "requirement" : "requirements"}.`
        : "Nothing in the spec says anything about this yet."}</p>`;
  return `<section class="spec-section">` +
    `<h3 class="spec-subject">${esc(concept.name)}<span class="role-chip">${esc(concept.role)}</span></h3>` +
    (concept.summary ? `<p class="spec-summary">${esc(concept.summary)}</p>` : "") +
    body + `</section>`;
}

export function renderSpecDoc(seed, review, { query = "", expandedId = null } = {}) {
  const sections = specSections(seed, review);
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? sections
        .map((section) => ({
          ...section,
          requirements: section.requirements.filter((req) =>
            `${section.concept.name} ${req.text}`.toLowerCase().includes(needle)),
        }))
        .filter((section) => section.requirements.length || section.concept.name.toLowerCase().includes(needle))
    : sections;

  if (!visible.length) return `<p class="empty-copy">Nothing in your spec matches this search.</p>`;
  return visible.map((section) => renderSection(section, expandedId)).join("");
}

// Used by app.js to drop the evidence pane when search filters out the open row.
export function requirementVisible(seed, review, query, id) {
  if (!id) return false;
  const sections = specSections(seed, review);
  const needle = query.trim().toLowerCase();
  for (const section of sections) {
    for (const req of section.requirements) {
      if (req.id !== id) continue;
      if (!needle) return true;
      return `${section.concept.name} ${req.text}`.toLowerCase().includes(needle);
    }
  }
  return false;
}

// Replaces the three-card row: identity, approval state, and one honest tally
// that hands off to Report rather than re-answering it.
export function renderSpecHeader(seedData, summary) {
  const seed = seedData?.seed;
  if (!seed) return "";
  const approved = seedData.ratified;
  const when = seed.ratification?.ratifiedAt
    ? new Date(seed.ratification.ratifiedAt).toLocaleString()
    : null;
  const meta = [
    `<span class="seed-hash" title="${esc(seedData.contentHash ?? "")}">${esc(shortHash(seedData.contentHash))}</span>`,
    when ? `<span>${approved ? "approved" : "drafted"} ${esc(when)}</span>` : null,
    seedData.gitDirty ? `<span class="seed-badge git-dirty">uncommitted changes</span>` : null,
  ].filter(Boolean).join(`<span class="dot">·</span>`);

  const counts = `${seed.commitments.length} ${seed.commitments.length === 1 ? "requirement" : "requirements"} ` +
    `about ${seed.concepts.length} ${seed.concepts.length === 1 ? "thing" : "things"}.`;
  const tally = summary
    ? `<p class="spec-tally">${counts} ` +
      `<span class="verdict-holds">${summary.holds} confirmed</span> · ` +
      `<span class="verdict-violated">${summary.violated} missing</span> · ` +
      `<span class="verdict-cannot_verify">${summary.cannotVerify} couldn't tell</span> · ` +
      `<span class="verdict-not_checkable">${summary.notCheckable} noted</span>` +
      `<button class="spec-goto-report" data-goto-report type="button">See the report →</button></p>`
    : `<p class="spec-tally">${counts}</p>`;

  return `<header class="spec-head">` +
    `<h2>${esc(seed.system?.name ?? "Untitled system")}` +
    `<span class="seed-badge ${approved ? "ratified" : "draft"}">${approved ? "approved" : "draft"}</span></h2>` +
    `<p class="spec-meta">${meta}</p>${tally}</header>`;
}

// How many requirements a search matches, for the count beside the search box.
export function countSpecMatches(seed, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;
  const nameOf = (id) => seed.concepts.find((concept) => concept.id === id)?.name ?? id;
  return seed.commitments.filter((commitment) =>
    `${nameOf(commitment.source)} ${seedRelationText(commitment.relation)} ${targetName(commitment.target, nameOf)}`
      .toLowerCase().includes(needle)).length;
}

export function renderSpecNotes(context) {
  if (!context?.length) return "";
  return `<section class="spec-notes"><h3>Notes — recorded, not checked</h3><ul>` +
    context.map((entry) => `<li>${esc(entry.text)}</li>`).join("") + `</ul></section>`;
}
