import path from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";

const IGNORED_DIRS = new Set([
  ".git",
  ".next",
  ".varai",
  "build",
  "coverage",
  "dist",
  "node_modules"
]);

const TEXT_FILE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".env",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mjs",
  ".prisma",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);

export async function scanRepo(repoPath) {
  const files = await walk(repoPath);
  const facts = [];

  facts.push(...await packageFacts(repoPath));
  facts.push(...await fileShapeFacts(repoPath, files));
  facts.push(...await prismaFacts(repoPath, files));
  facts.push(...await envFacts(repoPath, files));

  return {
    summary: {
      fileCount: files.length,
      factCount: facts.length
    },
    files,
    facts
  };
}

async function walk(root) {
  const files = [];

  async function visit(dir) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      const absolutePath = path.join(dir, entry.name);
      const relativePath = path.relative(root, absolutePath);

      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }

  await visit(root);
  return files.sort();
}

async function packageFacts(repoPath) {
  const packagePath = path.join(repoPath, "package.json");

  try {
    const contents = await readFile(packagePath, "utf8");
    const parsed = JSON.parse(contents);
    const dependencies = {
      ...(parsed.dependencies ?? {}),
      ...(parsed.devDependencies ?? {})
    };

    return Object.keys(dependencies).map((name) => ({
      kind: "package",
      name,
      detail: dependencies[name],
      tags: packageTags(name),
      evidence: [{ file: "package.json" }]
    }));
  } catch {
    return [];
  }
}

async function fileShapeFacts(repoPath, files) {
  const facts = [];

  for (const file of files) {
    if (isNextPage(file)) {
      facts.push({
        kind: "page",
        name: routeNameFor(file),
        evidence: [{ file }]
      });
    }

    if (isNextApiRoute(file)) {
      facts.push({
        kind: "api_route",
        name: routeNameFor(file),
        evidence: [{ file }]
      });
    }

    if (file.startsWith("components/") || file.includes("/components/")) {
      facts.push({
        kind: "component",
        name: path.basename(file, path.extname(file)),
        evidence: [{ file }]
      });
    }

    if (file.startsWith("supabase/migrations/")) {
      facts.push({
        kind: "database_migration",
        name: path.basename(file),
        evidence: [{ file }]
      });
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
    .replace(/^app\//, "/")
    .replace(/^pages\//, "/")
    .replace(/\/page\.(jsx|tsx|js|ts)$/, "")
    .replace(/\/route\.(js|ts)$/, "")
    .replace(/\.(jsx|tsx|js|ts)$/, "")
    .replace(/\/index$/, "/");

  return route || "/";
}

async function prismaFacts(repoPath, files) {
  const schemaFile = files.find((file) => file === "prisma/schema.prisma");

  if (!schemaFile) {
    return [];
  }

  const contents = await readFile(path.join(repoPath, schemaFile), "utf8");
  const models = [...contents.matchAll(/^model\s+([A-Za-z0-9_]+)\s+\{/gm)];

  return models.map((match) => ({
    kind: "db_model",
    name: match[1],
    evidence: [{ file: schemaFile }]
  }));
}

async function envFacts(repoPath, files) {
  const facts = [];

  for (const file of files) {
    if (!isTextFile(file)) {
      continue;
    }

    const absolutePath = path.join(repoPath, file);
    const fileStat = await stat(absolutePath);
    if (fileStat.size > 250_000) {
      continue;
    }

    const contents = await readFile(absolutePath, "utf8");
    const envVars = [
      ...contents.matchAll(/process\.env\.([A-Z0-9_]+)/g),
      ...contents.matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)
    ];

    for (const match of envVars) {
      facts.push({
        kind: "env_var",
        name: match[1],
        evidence: [{ file }]
      });
    }
  }

  return dedupeFacts(facts);
}

async function maybeAddTextHints(repoPath, files, facts) {
  const hintPatterns = [
    { tag: "auth", pattern: /\b(auth|login|logout|signup|session|clerk|next-auth)\b/i },
    { tag: "payment", pattern: /\b(stripe|checkout|subscription|billing|webhook)\b/i },
    { tag: "email", pattern: /\b(resend|postmark|sendgrid|nodemailer|sendMail)\b/i },
    { tag: "notification", pattern: /\b(notification|notify|bell|inbox)\b/i },
    { tag: "permission", pattern: /\b(admin|role|permission|rbac)\b/i }
  ];

  for (const file of files) {
    if (!isTextFile(file)) {
      continue;
    }

    const absolutePath = path.join(repoPath, file);
    const fileStat = await stat(absolutePath);
    if (fileStat.size > 120_000) {
      continue;
    }

    const contents = await readFile(absolutePath, "utf8");

    for (const hint of hintPatterns) {
      if (hint.pattern.test(contents) || hint.pattern.test(file)) {
        facts.push({
          kind: "code_hint",
          name: hint.tag,
          evidence: [{ file }]
        });
      }
    }
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

function dedupeFacts(facts) {
  const seen = new Set();

  return facts.filter((fact) => {
    const key = `${fact.kind}:${fact.name}:${fact.evidence?.[0]?.file ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
