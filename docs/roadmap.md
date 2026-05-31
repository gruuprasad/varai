# Roadmap

## Phase 0: Seed Repo

- Define product principles.
- Add a local CLI.
- Generate a basic Markdown report.
- Keep all scanning local.

## Phase 1: Useful Local Audit

- Improve Next.js scanning.
- Add first-class Prisma and Supabase extraction.
- Add requirement extraction from pasted prompt/brief.
- Add an evidence-constrained LLM matcher behind an explicit provider config.
- Generate a useful next prompt.

## Phase 2: Intent Ledger

Capture evolving intent, not just one original prompt.

Sources:

- manual notes
- GitHub issue
- PRD file
- Claude Code hook
- Codex wrapper
- Cursor/Copilot extension later

The ledger should be visible and editable.

## Phase 3: Check Packs

Community-maintained checks for common AI-build failure modes.

Candidate packs:

- auth and route protection
- Stripe SaaS launch
- Supabase RLS
- email delivery
- notifications
- admin permissions
- file uploads and storage

## Phase 4: Better Surfaces

- HTML report
- local web UI
- GitHub Action
- PR comments
- shareable client handoff report

## Non-Goals For Now

- universal language support
- diagram-first visualization
- cloud-hosted repo ingestion
- autonomous code generation
