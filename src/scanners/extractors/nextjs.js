import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { dedupeFacts } from "../utils.js";

const TEXT_FILE_EXTENSIONS = new Set([
  ".cjs", ".css", ".env", ".js", ".jsx", ".json", ".md", ".mjs",
  ".prisma", ".sql", ".ts", ".tsx", ".txt", ".yaml", ".yml"
]);

export async function extract(repoPath, files) {
  const facts = [];
  facts.push(...await packageFacts(repoPath));
  facts.push(...await fileShapeFacts(repoPath, files));
  facts.push(...await prismaFacts(repoPath, files));
  facts.push(...await envFacts(repoPath, files));
  return facts;
}

async function packageFacts(repoPath) {
  try {
    const contents = await readFile(path.join(repoPath, "package.json"), "utf8");
    const parsed = JSON.parse(contents);
    const deps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
    return Object.keys(deps).map((name) => ({
      kind: "package", name, detail: deps[name], tags: packageTags(name),
      evidence: [{ file: "package.json" }], layer: "heuristic"
    }));
  } catch { return []; }
}

async function fileShapeFacts(repoPath, files) {
  const facts = [];
  for (const file of files) {
    if (isNextPage(file)) {
      facts.push({ kind: "page", name: routeNameFor(file), evidence: [{ file }], layer: "heuristic" });
    }
    if (isNextApiRoute(file)) {
      const name = routeNameFor(file);
      facts.push({ kind: "api_route", name, evidence: [{ file }], layer: "heuristic" });
      if (/webhook/i.test(name) || /webhook/i.test(file)) {
        facts.push({ kind: "webhook_route", name, evidence: [{ file }], layer: "heuristic" });
      }
    }
    if (file.startsWith("components/") || file.includes("/components/")) {
      facts.push({ kind: "component", name: path.basename(file, path.extname(file)), evidence: [{ file }], layer: "heuristic" });
    }
    if (file.startsWith("supabase/migrations/")) {
      facts.push({ kind: "database_migration", name: path.basename(file), evidence: [{ file }], layer: "heuristic" });
    }
  }
  await maybeAddTextHints(repoPath, files, facts);
  return facts;
}

function isNextPage(file) {
  return /^app\/(?:.+\/)?page\.(jsx|tsx|js|ts)$/.test(file) || /^pages\/.+\.(jsx|tsx|js|ts)$/.test(file);
}

function isNextApiRoute(file) {
  return /^app\/api\/.+\/route\.(js|ts)$/.test(file) || /^pages\/api\/.+\.(js|ts)$/.test(file);
}

function routeNameFor(file) {
  const route = file
    .replace(/^app\//, "/").replace(/^pages\//, "/")
    .replace(/\/page\.(jsx|tsx|js|ts)$/, "").replace(/\/route\.(js|ts)$/, "")
    .replace(/\.(jsx|tsx|js|ts)$/, "").replace(/\/index$/, "/");
  return route || "/";
}

async function prismaFacts(repoPath, files) {
  const schemaFile = files.find((f) => f === "prisma/schema.prisma");
  if (!schemaFile) return [];
  const contents = await readFile(path.join(repoPath, schemaFile), "utf8");
  return [...contents.matchAll(/^model\s+([A-Za-z0-9_]+)\s+\{/gm)].map((m) => ({
    kind: "db_model", name: m[1], evidence: [{ file: schemaFile }], layer: "heuristic"
  }));
}

async function envFacts(repoPath, files) {
  const facts = [];
  for (const file of files) {
    if (!isTextFile(file)) continue;
    const abs = path.join(repoPath, file);
    try {
      const s = await stat(abs);
      if (s.size > 250_000) continue;
      const contents = await readFile(abs, "utf8");
      for (const m of [
        ...contents.matchAll(/process\.env\.([A-Z0-9_]+)/g),
        ...contents.matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)
      ]) {
        facts.push({ kind: "env_var", name: m[1], evidence: [{ file }], layer: "heuristic" });
      }
    } catch { /* skip unreadable */ }
  }
  return dedupeFacts(facts);
}

async function maybeAddTextHints(repoPath, files, facts) {
  const patterns = [
    { tag: "auth", re: /\b(auth|login|logout|signup|session|clerk|next-auth)\b/i },
    { tag: "payment", re: /\b(stripe|checkout|subscription|billing|webhook)\b/i },
    { tag: "email", re: /\b(resend|postmark|sendgrid|nodemailer|sendMail)\b/i },
    { tag: "notification", re: /notifications?|notify|bell|inbox/i },
    { tag: "permission", re: /\b(admin|role|permission|rbac)\b/i }
  ];
  for (const file of files) {
    if (!isTextFile(file)) continue;
    const abs = path.join(repoPath, file);
    try {
      const s = await stat(abs);
      if (s.size > 120_000) continue;
      const contents = await readFile(abs, "utf8");
      for (const { tag, re } of patterns) {
        if (re.test(contents) || re.test(file)) {
          facts.push({ kind: "code_hint", name: tag, evidence: [{ file }], layer: "heuristic" });
        }
      }
    } catch { /* skip */ }
  }
}

function packageTags(name) {
  const lower = name.toLowerCase();
  const tags = [];
  if (lower.includes("stripe")) tags.push("payment");
  if (lower.includes("clerk") || lower.includes("auth") || lower.includes("supabase")) tags.push("auth");
  if (["resend", "nodemailer", "postmark", "@sendgrid/mail"].includes(lower)) tags.push("email");
  if (lower.includes("prisma") || lower.includes("drizzle") || lower.includes("supabase")) tags.push("database");
  return tags;
}

function isTextFile(file) {
  return TEXT_FILE_EXTENSIONS.has(path.extname(file)) || path.basename(file).startsWith(".env");
}
