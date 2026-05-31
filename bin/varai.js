#!/usr/bin/env node

import { runAudit } from "../src/index.js";

const args = process.argv.slice(2);
const command = args[0] ?? "help";

function usage() {
  return `Varai

Usage:
  varai audit --intent <file|-> [--repo <dir>] [--out <file>]
  varai help

Examples:
  varai audit --intent ./intent.md
  varai audit --intent - --repo .
  varai audit --repo ./my-app --intent ./brief.md --out ./varai-report.md
`;
}

function parseOptions(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--repo") {
      options.repo = next;
      index += 1;
    } else if (arg === "--intent") {
      options.intent = next;
      index += 1;
    } else if (arg === "--out") {
      options.out = next;
      index += 1;
    } else if (arg === "--json") {
      options.json = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function main() {
  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(usage());
    return;
  }

  if (command !== "audit") {
    throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }

  const options = parseOptions(args.slice(1));
  const result = await runAudit(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(`Varai report written to ${result.reportPath}\n`);
  process.stdout.write(`Found ${result.scan.summary.fileCount} files and ${result.findings.length} initial findings.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
