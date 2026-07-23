import assert from "node:assert/strict";
import test from "node:test";
import { renderViewSplit } from "../../src/ui/view-split.js";

test("renderViewSplit wraps master and detail in a grid-layer split", () => {
  const html = renderViewSplit(`<article class="card">A</article>`, `<div class="detail-content">B</div>`);
  assert.match(html, /class="view-split"/);
  assert.match(html, /view-split-master/);
  assert.match(html, /view-split-detail/);
  assert.match(html, /<article class="card">A<\/article>/);
  assert.match(html, /<div class="detail-content">B<\/div>/);
  assert.ok(html.indexOf("view-split-master") < html.indexOf("view-split-detail"));
});
