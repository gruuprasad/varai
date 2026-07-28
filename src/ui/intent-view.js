// Pure Seed Studio presentation helpers. The intent view separates three
// things visually: ratified seed state, the untrusted assistant proposal under
// review, and the deterministic diff between them. Ratification is always an
// explicit button, never a side effect. Approval is disabled while the
// unresolved queue (questions + unsupported) still has items.

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function shortHash(hash) {
  return hash ? String(hash).replace(/^sha256:/, "").slice(0, 12) : "—";
}

function formatTarget(target) {
  if (target?.concept !== undefined) return target.concept;
  return JSON.stringify(target?.literal);
}

export function unresolvedItems(draftState) {
  const items = [];
  for (const [index, question] of (draftState?.questions ?? []).entries()) {
    items.push({ kind: "question", index, text: question });
  }
  for (const [index, text] of (draftState?.unsupported ?? []).entries()) {
    items.push({ kind: "unsupported", index, text });
  }
  return items;
}

export function approvalBlockedReason(draftState) {
  if (!draftState?.draft) return "No draft under review.";
  if (draftState.problems?.length) return "Fix the validation problems before approving.";
  if (unresolvedItems(draftState).length) {
    return "Resolve unresolved questions and unsupported statements before approving.";
  }
  return null;
}

export function renderSeedStatus(seedData) {
  if (!seedData) return "";
  if (seedData.invalid) {
    return `<div class="seed-status seed-invalid">` +
      `<strong>${esc(seedData.file)} is invalid</strong>` +
      `<ul>${(seedData.problems ?? []).map((problem) => `<li>[${esc(problem.code)}] ${esc(problem.message)}</li>`).join("")}</ul></div>`;
  }
  if (!seedData.seed) {
    return `<div class="seed-status seed-empty">No <strong>${esc(seedData.file ?? "varai.seed.json")}</strong> yet — draft one below and approve it.</div>`;
  }
  const badges = [];
  badges.push(seedData.ratified
    ? `<span class="seed-badge ratified">approved</span>`
    : `<span class="seed-badge draft">draft</span>`);
  if (seedData.gitDirty) badges.push(`<span class="seed-badge git-dirty">git dirty</span>`);
  const counts = `${seedData.seed.concepts.length} things · ${seedData.seed.commitments.length} requirements`;
  return `<div class="seed-status">${badges.join("")}` +
    `<span class="seed-hash" title="${esc(seedData.contentHash ?? "")}">${esc(shortHash(seedData.contentHash))}</span>` +
    `<span class="seed-counts">${esc(counts)}</span></div>`;
}

export function renderQuestions(questions) {
  if (!questions?.length) return "";
  return `<section class="intent-questions"><h4>Assistant asks</h4><ul>` +
    questions.map((question) => `<li>${esc(question)}</li>`).join("") + `</ul></section>`;
}

export function renderUnsupported(unsupported) {
  if (!unsupported?.length) return "";
  return `<section class="intent-unsupported"><h4>Noted — can't check these yet</h4><ul>` +
    unsupported.map((item) => `<li><span class="verdict-chip not-checkable">noted</span> ${esc(item)}</li>`).join("") +
    `</ul></section>`;
}

export function renderUnresolvedQueue(draftState) {
  const items = unresolvedItems(draftState);
  if (!items.length) return "";
  return `<section class="unresolved-queue" aria-label="Unresolved queue">` +
    `<h4>Unresolved (${items.length})</h4>` +
    `<p class="intent-note">Approval stays disabled until each item is answered, converted to context, or removed via a reviewed proposal.</p>` +
    `<ul class="unresolved-list">` + items.map((item) => {
      const inputId = `unresolved-answer-${esc(item.kind)}-${item.index}`;
      return `<li class="unresolved-item unresolved-${esc(item.kind)}" data-kind="${esc(item.kind)}" data-index="${item.index}">` +
        `<span class="unresolved-kind">${esc(item.kind)}</span> ` +
        `<span class="unresolved-text">${esc(item.text)}</span>` +
        `<div class="unresolved-answer-block">` +
        `<label class="compose-label" for="${inputId}">Answer</label>` +
        `<textarea id="${inputId}" class="unresolved-answer-input" rows="2" ` +
        `data-kind="${esc(item.kind)}" data-index="${item.index}" ` +
        `aria-label="Answer for: ${esc(item.text)}"></textarea>` +
        `<button type="button" class="btn-quiet unresolved-answer-submit" data-kind="${esc(item.kind)}" data-index="${item.index}" ` +
        `aria-label="Submit answer: ${esc(item.text)}" data-input-id="${inputId}">Submit answer</button>` +
        `</div>` +
        `<div class="unresolved-actions">` +
        `<button type="button" class="btn-quiet unresolved-to-context" data-kind="${esc(item.kind)}" data-index="${item.index}" ` +
        `aria-label="Convert to context: ${esc(item.text)}">Convert to context</button>` +
        `<button type="button" class="btn-quiet unresolved-remove" data-kind="${esc(item.kind)}" data-index="${item.index}" ` +
        `aria-label="Remove via proposal: ${esc(item.text)}">Remove</button>` +
        `</div></li>`;
    }).join("") + `</ul></section>`;
}

export function renderProblems(problems) {
  if (!problems?.length) return "";
  return `<section class="intent-problems"><h4>Validation problems</h4><ul>` +
    problems.map((problem) => `<li><code>${esc(problem.code)}</code> ${esc(problem.message)}</li>`).join("") + `</ul></section>`;
}

export function renderDraftStructure(draft) {
  if (!draft) return "";
  const conceptRows = [...(draft.concepts ?? [])].sort((a, b) => a.id.localeCompare(b.id))
    .map((concept) => `<tr><td><code>${esc(concept.id)}</code></td><td>${esc(concept.role)}</td><td>${esc(concept.name)}</td></tr>`).join("");
  const commitmentRows = [...(draft.commitments ?? [])].sort((a, b) => a.id.localeCompare(b.id))
    .map((commitment) => `<tr><td><code>${esc(commitment.id)}</code></td>` +
      `<td><code>${esc(commitment.source)}</code></td><td>${esc(commitment.relation)}</td><td><code>${esc(formatTarget(commitment.target))}</code></td></tr>`).join("");
  return `<section class="intent-structure">` +
    `<h4>${esc(draft.system?.name ?? "Untitled system")} — proposed draft</h4>` +
    `<table class="intent-table"><thead><tr><th>Concept</th><th>Role</th><th>Name</th></tr></thead><tbody>${conceptRows}</tbody></table>` +
    `<table class="intent-table"><thead><tr><th>Commitment</th><th>Source</th><th>Relation</th><th>Target</th></tr></thead><tbody>${commitmentRows}</tbody></table>` +
    `</section>`;
}

export function renderSeedDiff(diff) {
  if (!diff) return "";
  const groups = [];
  for (const key of ["concepts", "commitments", "surfaces", "scenarios", "context"]) {
    const group = diff[key];
    if (!group) continue;
    const rows = [];
    for (const item of group.added ?? []) rows.push(`<li class="diff-added">+ ${esc(item.id)}</li>`);
    for (const item of group.removed ?? []) rows.push(`<li class="diff-removed">− ${esc(item.id)}</li>`);
    for (const pair of group.changed ?? []) rows.push(`<li class="diff-changed">~ ${esc(pair.after.id)}</li>`);
    if (rows.length) groups.push(`<section class="diff-group"><h4>${esc(key)}</h4><ul>${rows.join("")}</ul></section>`);
  }
  if (diff.systemChanged) groups.unshift(`<section class="diff-group"><h4>system</h4><ul><li class="diff-changed">~ system identity changed</li></ul></section>`);
  return groups.length
    ? `<section class="intent-diff"><h3>Draft vs approved spec</h3>${groups.join("")}</section>`
    : `<section class="intent-diff"><h3>Draft vs approved spec</h3><p class="empty-copy">No semantic differences.</p></section>`;
}

export function renderReviewActions(draftState) {
  if (!draftState?.draft) return "";
  const reason = approvalBlockedReason(draftState);
  const blocked = Boolean(reason);
  return `<div class="intent-actions">` +
    `<button class="intent-ratify" id="intent-ratify" type="button"` +
    `${blocked ? " disabled" : ""}` +
    ` aria-label="Approve this draft"` +
    `${blocked ? ` aria-disabled="true" aria-describedby="intent-approve-blocked"` : ""}>` +
    `Approve this draft${draftState.contentHash ? ` (${esc(shortHash(draftState.contentHash))})` : ""}</button>` +
    `<button class="intent-reject" id="intent-reject" type="button" aria-label="Discard draft">Discard draft</button>` +
    (blocked ? `<p class="intent-note" id="intent-approve-blocked">${esc(reason)}</p>` : "") +
    `</div>`;
}
