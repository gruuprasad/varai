import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createScanContext } from "../../src/scanners/context.js";
import { createResolver } from "../../src/scanners/behaviors/resolver.js";

test("resolveFunction finds local and imported same-repo functions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-resolver-"));
  await mkdir(join(dir, "pkg"), { recursive: true });
  await writeFile(join(dir, "pkg/helpers.py"), `def persist(doc):\n    pass\n`);
  await writeFile(join(dir, "pkg/routes.py"), `from pkg.helpers import persist\n\ndef local_helper():\n    pass\n\ndef handler():\n    local_helper()\n    persist(1)\n`);
  const ctx = createScanContext(dir);
  const resolver = createResolver(["pkg/helpers.py", "pkg/routes.py"], ctx);

  const local = await resolver.resolveFunction("pkg/routes.py", "local_helper");
  assert.equal(local.file, "pkg/routes.py");
  assert.equal(local.node.childForFieldName("name").text, "local_helper");

  const imported = await resolver.resolveFunction("pkg/routes.py", "persist");
  assert.equal(imported.file, "pkg/helpers.py");
  assert.equal(imported.node.childForFieldName("name").text, "persist");

  assert.equal(await resolver.resolveFunction("pkg/routes.py", "nonexistent"), null);
});

test("resolveFunction handles multi-line parenthesized imports", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-resolver-ml-"));
  await mkdir(join(dir, "pkg"), { recursive: true });
  await writeFile(join(dir, "pkg/common.py"), `def _ensure_doc(ctx):\n    pass\ndef _assert_rev(ctx):\n    pass\n`);
  await writeFile(join(dir, "pkg/routes.py"), `from pkg.common import (
    _ensure_doc,
    _assert_rev,
)

def handler(ctx):
    doc = _ensure_doc(ctx)
    _assert_rev(doc)
`);
  const ctx = createScanContext(dir);
  const resolver = createResolver(["pkg/common.py", "pkg/routes.py"], ctx);

  const ensureDoc = await resolver.resolveFunction("pkg/routes.py", "_ensure_doc");
  assert.ok(ensureDoc, "_ensure_doc resolved through multi-line import");
  assert.equal(ensureDoc.node.childForFieldName("name").text, "_ensure_doc");

  const assertRev = await resolver.resolveFunction("pkg/routes.py", "_assert_rev");
  assert.ok(assertRev, "_assert_rev resolved through multi-line import");
});
