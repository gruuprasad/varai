# Varai

Varai is a local-first clarity tool for AI-assisted software building.

It started from a simple frustration: AI coding tools can move a project faster than a human can keep a clear mental model of it. After a few sessions, you may not know what is real, what is half-built, what was forgotten, or what to ask next.

Varai reads an intent file and a local repo, then produces a build-state report:

- what appears to exist
- what is missing or unverified
- what is only partially evidenced
- what to ask the AI coding agent next

The goal is not to replace code review or tests. The goal is orientation.

## Install

The package is not published yet. Run it from the repo:

```bash
node ./bin/varai.js audit --intent ./examples/intent.md --repo ./examples/next-task-app --out ./.varai/report.md
```

When published, the intended shape is:

```bash
npx varai audit --intent ./intent.md --repo .
```

## Principles

- Local-first by default.
- No silent repo upload.
- No claim without evidence.
- Uncertainty is a valid answer.
- Report first, diagrams later.
- Help the builder make the next good move.

## Current Status

This is a seed repo. The current CLI performs a dependency-free scan for common Next.js app surfaces: pages, API routes, packages, Prisma models, Supabase migrations, env vars, and simple code hints.

It intentionally marks related evidence as `partial`, not `satisfied`. The next step is an evidence-constrained matcher that can compare intent against extracted facts without inventing confidence.

See [docs/sample-report.md](docs/sample-report.md) for the current output shape.

## Name

Varai is short, regional, and ends in `ai` without being obvious about it. The working metaphor is sure-footed orientation on steep terrain.
