import assert from "node:assert/strict";
import test from "node:test";
import { createDeclarationRegistry } from "../../src/scanners/lift/declarations.js";

test("prisma db_model observations become persisted declarations without Python AST", async () => {
  const observations = [{
    kind: "db_model",
    name: "Document",
    evidence: [{ file: "prisma/schema/document.prisma", line: 1, symbol: "Document" }],
    layer: "ast",
  }];
  const registry = await createDeclarationRegistry({
    observations,
    symbolIndex: { allDeclarations: async () => [], resolveDeclaration: async () => null },
  });
  const docs = registry.named("Document");
  assert.equal(docs.length, 1);
  assert.equal(docs[0].persisted, true);
  assert.equal(docs[0].file, "prisma/schema/document.prisma");
});

test("does not duplicate when a persisted declaration already exists", async () => {
  const observations = [{
    kind: "db_model",
    name: "Workspace",
    evidence: [{ file: "models.py", line: 3, symbol: "Workspace" }],
    layer: "ast",
  }];
  const registry = await createDeclarationRegistry({
    observations,
    symbolIndex: {
      allDeclarations: async () => [{
        id: "py:models.py:Workspace",
        name: "Workspace",
        file: "models.py",
        line: 3,
        node: null,
      }],
      resolveDeclaration: async () => null,
    },
  });
  assert.equal(registry.named("Workspace").length, 1);
  assert.equal(registry.named("Workspace")[0].id, "py:models.py:Workspace");
});
