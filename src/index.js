import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { stdin } from "node:process";

import { intentFromText, readIntent } from "./intent.js";
import { matchIntentToScan } from "./matcher.js";
import { scanRepo } from "./scanners/repo.js";
import { renderMarkdownReport } from "./reporters/markdown.js";

export async function runAudit(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");

  if (!options.intent) {
    throw new Error("Missing required --intent <file|-");
  }

  const intent = options.intent === "-"
    ? intentFromText(await readStdin(), "-")
    : await readIntent(path.resolve(options.intent));
  const intentPath = options.intent === "-" ? "-" : path.resolve(options.intent);
  const outputPath = path.resolve(options.out ?? path.join(repoPath, ".varai", "report.md"));

  const scan = await scanRepo(repoPath);
  const findings = matchIntentToScan(intent, scan);
  const report = renderMarkdownReport({
    generatedAt: new Date().toISOString(),
    repoPath,
    intentPath,
    intent,
    scan,
    findings
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, report, "utf8");

  return {
    repoPath,
    intentPath,
    reportPath: outputPath,
    intent,
    scan,
    findings
  };
}

async function readStdin() {
  const chunks = [];

  for await (const chunk of stdin) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}
