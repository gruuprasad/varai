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
