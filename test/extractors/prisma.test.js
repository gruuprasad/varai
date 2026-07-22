import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { extract, modelNamesFromPrisma } from "../../src/scanners/extractors/prisma.js";
import { createScanContext } from "../../src/scanners/context.js";

const fixture = path.resolve("test/fixtures/prisma-dataroom-create");

test("extracts models from multi-file prisma schema folder", async () => {
  const files = [
    "prisma/schema/schema.prisma",
    "prisma/schema/document.prisma",
    "prisma/schema/dataroom.prisma",
  ];
  const facts = await extract(fixture, files, createScanContext(fixture));
  const names = new Set(facts.filter((f) => f.kind === "db_model").map((f) => f.name));
  assert.ok(names.has("Document"));
  assert.ok(names.has("Dataroom"));
  assert.equal(names.has("datasource"), false);
});

test("camelCase delegate map matches Prisma client naming", () => {
  assert.equal(modelNamesFromPrisma(["Document", "UserTeam"]).get("document"), "Document");
  assert.equal(modelNamesFromPrisma(["Document", "UserTeam"]).get("userTeam"), "UserTeam");
});
