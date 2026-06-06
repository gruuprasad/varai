#!/usr/bin/env node

import { runMap } from "../src/map.js";
import { startServer } from "../src/server/index.js";

const args = process.argv.slice(2);
const command = args[0];

function usage() {
  return `Varai — a lens for your codebase

Usage:
  varai map [<repo-path>] [--include <prefix>]... [options]
  varai start [<repo-path>] [--port <N>] [--no-open]

Options (map):
  --include <prefix>   Scan only files under this path prefix (repeatable)
  --jobs <N>           Number of worker threads (default: cpus-2, min 1)
  --no-cache           Disable persistent fact cache
  --cache-dir <path>   Override cache directory (default: .varai/cache)
  --parser <backend>   Parser backend: native (default) or wasm

Options (start):
  --port <N>           Port to listen on (default: 3847)
  --no-open            Don't open the browser automatically

Examples:
  varai map
  varai map ../kalakar
  varai map ../kalakar --include services/backend --include services/frontend/src
  varai map ../kalakar --jobs 4 --parser wasm
  varai start
  varai start ../kalakar --port 8080
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

function parseStartOptions(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port" && argv[i + 1]) {
      const p = parseInt(argv[++i], 10);
      if (isNaN(p) || p < 1 || p > 65535) {
        process.stderr.write(`Invalid port: ${argv[i]}\n`);
        process.exit(1);
      }
      opts.port = p;
    } else if (argv[i] === "--no-open") {
      opts.open = false;
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

  if (command === "map") {
    await runMap(parseMapOptions(args.slice(1)));
    return;
  }

  if (command === "start") {
    const opts = parseStartOptions(args.slice(1));
    const server = await startServer({
      repoPath: opts.repo ?? ".",
      port: opts.port,
      open: opts.open,
    });

    process.on("SIGINT", () => {
      console.error("\n[server] shutting down...");
      server.close();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      server.close();
      process.exit(0);
    });

    // Keep the process alive
    await new Promise(() => {});
    return;
  }

  process.stderr.write(`Unknown command: ${command}\n\n${usage()}`);
  process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exitCode = 1;
});
