#!/usr/bin/env node

import { runMap } from "../src/map.js";

const args = process.argv.slice(2);
const command = args[0];

function usage() {
  return `Varai — a lens for your codebase

Usage:
  varai map [<repo-path>] [--include <prefix>]... [options]

Options:
  --include <prefix>   Scan only files under this path prefix (repeatable)
  --jobs <N>           Number of worker threads (default: cpus-2, min 1)
  --no-cache           Disable persistent fact cache
  --cache-dir <path>   Override cache directory (default: .varai/cache)
  --parser <backend>   Parser backend: native (default) or wasm

Examples:
  varai map
  varai map ../kalakar
  varai map ../kalakar --include services/backend --include services/frontend/src
  varai map ../kalakar --jobs 4 --parser wasm
`;
}

function parseMapOptions(argv) {
  const opts = { include: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--include" && argv[i + 1]) {
      opts.include.push(argv[++i]);
    } else if (argv[i] === "--jobs" && argv[i + 1]) {
      opts.jobs = parseInt(argv[++i], 10);
    } else if (argv[i] === "--no-cache") {
      opts.cache = false;
    } else if (argv[i] === "--cache-dir" && argv[i + 1]) {
      opts.cacheDir = argv[++i];
    } else if (argv[i] === "--parser" && argv[i + 1]) {
      opts.parser = argv[++i];
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
