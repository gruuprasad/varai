#!/usr/bin/env node

import { runMap } from "../src/map.js";

const args = process.argv.slice(2);
const command = args[0];

function usage() {
  return `Varai — a lens for your codebase

Usage:
  varai map [<repo-path>] [--include <prefix>]...

Options:
  --include <prefix>   Scan only files under this path prefix (repeatable)

Examples:
  varai map
  varai map ../kalakar
  varai map ../kalakar --include services/backend --include services/frontend/src
`;
}

function parseMapOptions(argv) {
  const opts = { include: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--include" && argv[i + 1]) {
      opts.include.push(argv[++i]);
    } else if (!argv[i].startsWith("-")) {
      opts.repo = argv[i];
    } else {
      process.stderr.write(`Unknown option: ${argv[i]}\n\n${usage()}`);
      process.exit(1);
    }
  }
  return opts;
}

async function main() {
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(usage());
    return;
  }
  if (command !== "map") {
    process.stderr.write(`Unknown command: ${command}\n\n${usage()}`);
    process.exitCode = 1;
    return;
  }
  await runMap(parseMapOptions(args.slice(1)));
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exitCode = 1;
});
