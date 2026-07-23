#!/usr/bin/env node

import { runMap } from "../src/map.js";
import { runCheck } from "../src/reconciliation/commands.js";
import { runHandoff, runSeedRatify, runSeedValidate } from "../src/seed/commands.js";
import { startServer } from "../src/server/index.js";
import { runDiff, runLog, runSnapshot } from "../src/semantic-commands.js";

const args = process.argv.slice(2);
const command = args[0];

function usage() {
  return `Varai — a lens for your codebase

Usage:
  varai map [<repo-path>] [--include <prefix>]... [options]
  varai start [<repo-path>] [--port <N>] [--no-open] [scan options]
  varai snapshot [<repo-path>] [scan options]
  varai log [<repo-path>]
  varai diff [<repo-path>] [--from <selector>] [--to <selector|current>] [--json] [--show-evidence-moves]
  varai seed validate [<repo-path>]
  varai seed approve [<repo-path>]   (alias: ratify)
  varai handoff [<repo-path>] [--json] [--brief <file>]
  varai check [<repo-path>] [--json] [scan options]

Options (map):
  --include <prefix>   Scan only files under this path prefix (repeatable)
  --exclude <prefix>   Exclude a file or directory prefix (repeatable)
  --jobs <N>           Number of worker threads (default: cpus-2, min 1)
  --no-cache           Disable persistent observation cache
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
  varai snapshot ../kalakar
  varai diff ../kalakar
  varai seed validate ../varai-slotkeeper-pilot
  varai check ../varai-slotkeeper-pilot
`;
}

function parseMapOptions(argv) {
  const opts = { include: [], exclude: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--include" && argv[i + 1]) {
      opts.include.push(argv[++i]);
    } else if (argv[i] === "--exclude" && argv[i + 1]) {
      opts.exclude.push(argv[++i]);
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
  const opts = { include: [], exclude: [] };
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
    } else if (argv[i] === "--include" && argv[i + 1]) {
      opts.include.push(argv[++i]);
    } else if (argv[i] === "--exclude" && argv[i + 1]) {
      opts.exclude.push(argv[++i]);
    } else if (argv[i] === "--jobs" && argv[i + 1]) {
      opts.jobs = parseInt(argv[++i], 10);
    } else if (argv[i] === "--no-cache") {
      opts.cache = false;
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

function parseSemanticOptions(argv, { diff = false, json = false } = {}) {
  const opts = { include: [], exclude: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--include" && argv[i + 1]) opts.include.push(argv[++i]);
    else if (arg === "--exclude" && argv[i + 1]) opts.exclude.push(argv[++i]);
    else if (arg === "--jobs" && argv[i + 1]) opts.jobs = parseInt(argv[++i], 10);
    else if (arg === "--no-cache") opts.cache = false;
    else if (arg === "--parser" && argv[i + 1]) opts.parser = argv[++i];
    else if (diff && arg === "--from" && argv[i + 1]) opts.from = argv[++i];
    else if (diff && arg === "--to" && argv[i + 1]) opts.to = argv[++i];
    else if (json && arg === "--json") opts.json = true;
    else if (diff && arg === "--show-evidence-moves") opts.showEvidenceMoves = true;
    else if (!arg.startsWith("-")) opts.repo = arg;
    else throw new Error(`Unknown option: ${arg}`);
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
      scanOptions: {
        include: opts.include,
        exclude: opts.exclude,
        jobs: opts.jobs,
        cache: opts.cache,
        parser: opts.parser,
      },
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

  if (command === "snapshot") {
    await runSnapshot(parseSemanticOptions(args.slice(1)));
    return;
  }

  if (command === "log") {
    await runLog(parseSemanticOptions(args.slice(1)));
    return;
  }

  if (command === "diff") {
    await runDiff(parseSemanticOptions(args.slice(1), { diff: true, json: true }));
    return;
  }

  if (command === "seed") {
    const subcommand = args[1];
    if (subcommand === "validate" || subcommand === "ratify" || subcommand === "approve") {
      const positional = args.slice(2).filter((arg) => !arg.startsWith("-"));
      const run = subcommand === "validate" ? runSeedValidate : runSeedRatify;
      await run({ repo: positional[0] });
      return;
    }
    process.stderr.write(`Unknown seed subcommand: ${subcommand ?? "(none)"}\n\n${usage()}`);
    process.exitCode = 1;
    return;
  }

  if (command === "handoff") {
    const opts = {};
    const rest = args.slice(1);
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "--json") opts.json = true;
      else if (rest[i] === "--brief" && rest[i + 1]) opts.brief = rest[++i];
      else if (!rest[i].startsWith("-")) opts.repo = rest[i];
      else {
        process.stderr.write(`Unknown option: ${rest[i]}\n\n${usage()}`);
        process.exitCode = 1;
        return;
      }
    }
    await runHandoff(opts);
    return;
  }

  if (command === "check") {
    await runCheck(parseSemanticOptions(args.slice(1), { json: true }));
    return;
  }

  process.stderr.write(`Unknown command: ${command}\n\n${usage()}`);
  process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exitCode = 1;
});
