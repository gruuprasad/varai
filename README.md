# Varai

Varai is a local-first clarity tool for AI-assisted software building.

Status: experimental seed project.

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
node ./bin/varai.js audit --intent ./examples/golden/todo-partial/intent.md --repo ./examples/golden/todo-partial/app --out ./.varai/report.md
node ./bin/varai.js audit --intent ./examples/golden/todo-partial/intent-messy.md --repo ./examples/golden/todo-partial/app
```

Paste intent at audit time:

```bash
cat ./brief.md | node ./bin/varai.js audit --intent - --repo .
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

## Golden Scenarios

Varai is developed against tiny audit scenarios under `examples/golden/`:

- `todo-partial`: task/auth evidence exists, but notifications, admin approval, and Stripe are unverified
- `stripe-ui-no-webhook`: payment UI exists, but Stripe integration and webhook handler are missing
- `stripe-full-loop`: checkout UI, Stripe package, checkout API, and webhook handler are all evidenced
- `notifications-ui-no-backend`: notification UI exists, but persistence and API routes are missing

## Current Status

This is a seed repo. The current CLI performs a dependency-free scan for common Next.js app surfaces: pages, API routes, packages, Prisma models, Supabase migrations, env vars, and simple code hints.

It intentionally marks related evidence as `partial` when required capability links are missing, and `satisfied` when the full loop is evidenced. The next step is an evidence-constrained LLM matcher that can compare intent against extracted facts without inventing confidence.

See [docs/spec.md](docs/spec.md) for what Varai does and does not do, and [docs/sample-report.md](docs/sample-report.md) for the current output shape.

Development is example-driven. See [docs/development.md](docs/development.md) for the workflow and definition of done.

## Name

Varai is short, regional, and ends in `ai` without being obvious about it. The working metaphor is sure-footed orientation on steep terrain.
