// The approved spec, presented as a document. Verdicts are joined onto seed
// commitments by id — this module never decides one. Spec answers "what did I
// ask for"; Report answers "is it true". Rows link across, never duplicate.

import { seedRelationText, verdictLabel } from "../reporters/display-language.js";

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

function renderRequirement(requirement) {
  const verdict = requirement.verdict
    ? `<span class="spec-verdict verdict-${esc(requirement.verdict)}">${esc(verdictLabel(requirement.verdict))}</span>`
    : `<span class="spec-verdict spec-unchecked">not checked yet</span>`;
  return `<button class="spec-req" data-goto="${esc(requirement.id)}" title="Open this in the report">` +
    `<span class="spec-req-text">${esc(requirement.text)}` +
    (requirement.note ? `<span class="spec-req-note">${esc(requirement.note)}</span>` : "") +
    `</span>${verdict}</button>`;
}

function renderSection(section) {
  const { concept, requirements, referencedBy } = section;
  const body = requirements.length
    ? requirements.map(renderRequirement).join("")
    : `<p class="spec-refs">${referencedBy
        ? `Referenced by ${referencedBy} ${referencedBy === 1 ? "requirement" : "requirements"}.`
        : "Nothing in the spec says anything about this yet."}</p>`;
  return `<section class="spec-section">` +
    `<h3 class="spec-subject">${esc(concept.name)}<span class="role-chip">${esc(concept.role)}</span></h3>` +
    (concept.summary ? `<p class="spec-summary">${esc(concept.summary)}</p>` : "") +
    body + `</section>`;
}

export function renderSpecDoc(seed, review, { query = "" } = {}) {
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
  return visible.map(renderSection).join("");
}

export function renderSpecNotes(context) {
  if (!context?.length) return "";
  return `<section class="spec-notes"><h3>Notes — recorded, not checked</h3><ul>` +
    context.map((entry) => `<li>${esc(entry.text)}</li>`).join("") + `</ul></section>`;
}
