# ADR 0003: Vendor-Neutral Lens for Builders Supervising AI-Written Code

Status: Partially superseded by ADR 0004

ADR 0004 makes the System Model the product and semantic diff one projection over it. The target user, vendor-neutrality, Git boundaries, and dogfood rule remain accepted.

## Context

Two candidate primary users were considered:

1. **Non-technical vibe-coding founders** (Lovable/Bolt-style, Next/Supabase/Stripe stack) needing a "can I ship this?" trust panel.
2. **Technical builders who delegate implementation to AI coding tools** and want to see and steer the codebase above code level, without reading everything and without trusting blindly.

Option 1 fails two practical tests: the maintainer does not inhabit that stack or persona (every design question becomes guesswork), and the hosted platforms have the incentive and position to build that panel themselves. Option 2 is the user Varai's original framing always described — and it is the maintainer, daily, on kalakar (a Python/FastAPI + React SaaS app). That gives a free, fast feedback loop.

A second decision: Varai must not depend on any specific AI coding tool. The user builds with open, interchangeable tools; Varai's value is the lens, not the integration.

## Decision

- Varai targets **technical builders supervising AI-written code**, on whatever stack they actually use. The stock catalog and checks grow from real dogfooded codebases (kalakar first), not from a presumed market stack.
- Varai stays **vendor-neutral**: no coupling to Claude Code, Cursor, or any agent. Change boundaries anchor to neutral events — git commits, watcher-detected change bursts, explicit CLI invocation — never to a vendor's session concept.
- The wedge feature is the **concept-level diff**: "what changed in this codebase, expressed in facts and stock patterns, between two points in time." It exercises the always-on property of the lens and answers the question an AI-supervising builder faces daily.
- Steering output (fix instructions generated from findings) is **plain text/markdown** a user can paste into any agent.

## Dogfood rule

A feature enters or stays in Varai only if it changed a real decision on a real repo (kalakar) recently. This is the guard against drifting into a software-engineering research project.

## Consequences

- The SaaS-founder trust panel is deferred, not dead: it becomes a later re-targeting of the same check machinery once checks earn their shape on dogfooded stacks.
- Checks (auth-wall integrity, env-var hygiene, etc.) are built FastAPI/Python-first rather than Next.js-first.
- Snapshot/diff infrastructure must be designed around git and the existing watcher, keeping the local-first stance of ADR 0001.
