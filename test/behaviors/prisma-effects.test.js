import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createScanContext } from "../../src/scanners/context.js";
import { modelNamesFromPrisma } from "../../src/scanners/extractors/prisma.js";
import { classifyPrismaEffects } from "../../src/scanners/behaviors/prisma-effects.js";

const models = modelNamesFromPrisma(["Dataroom", "Document", "UserTeam"]);

async function effectsFor(source, file = "route.js") {
  const dir = await mkdtemp(join(tmpdir(), "varai-prisma-fx-"));
  await writeFile(join(dir, file), source);
  const ctx = createScanContext(dir);
  const tree = await ctx.tree(file, "javascript");
  return classifyPrismaEffects(tree, file, models, { content: source });
}

test("prisma.dataroom.create is creates Dataroom", async () => {
  const effects = await effectsFor(`
import prisma from "@/lib/prisma";
export async function POST() {
  await prisma.dataroom.create({ data: { name: "x" } });
}
`);
  assert.ok(effects.writes.some((w) => w.relation === "creates" && w.target === "Dataroom"));
});

test("prisma.document.update is changes Document", async () => {
  const effects = await effectsFor(`
import prisma from "@/lib/prisma";
await prisma.document.update({ where: { id: "1" }, data: {} });
`);
  assert.ok(effects.writes.some((w) => w.relation === "changes" && w.target === "Document"));
});

test("prisma.userTeam.findUnique is reads only", async () => {
  const effects = await effectsFor(`
import prisma from "@/lib/prisma";
await prisma.userTeam.findUnique({ where: { id: "1" } });
`);
  assert.ok(effects.reads.some((r) => r.target === "UserTeam"));
  assert.equal(effects.writes.length, 0);
});

test("$transaction is not a domain effect", async () => {
  const effects = await effectsFor(`
import prisma from "@/lib/prisma";
await prisma.$transaction([]);
await prisma.dataroom.create({ data: {} });
`);
  assert.equal(effects.writes.filter((w) => !w.target || w.target === "unknown").length, 0);
  assert.ok(effects.writes.some((w) => w.target === "Dataroom"));
});

test("unknown delegate is skipped", async () => {
  const effects = await effectsFor(`
import prisma from "@/lib/prisma";
await prisma.widget.create({ data: {} });
`);
  assert.equal(effects.writes.length, 0);
});

test("skips files that do not import prisma", async () => {
  const effects = await effectsFor(`
const prisma = { dataroom: { create() {} } };
await prisma.dataroom.create({ data: {} });
`);
  assert.equal(effects.writes.length, 0);
});
