// Grid-layer master + detail side by side. Callers pass the result as
// renderPanes' master HTML with { inlineExpand: true } so the focus layer
// never activates. Detail content is unchanged — only placement changes.
export function renderViewSplit(masterHtml, detailHtml) {
  return `<div class="view-split">` +
    `<div class="view-split-master">${masterHtml}</div>` +
    `<div class="view-split-detail">${detailHtml}</div>` +
  `</div>`;
}
