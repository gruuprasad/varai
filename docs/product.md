# Product Thinking

## Seed Problem

While building with AI, the app keeps moving but the builder's mental model starts lagging behind.

The painful moment is not "I need a diagram of my codebase." It is:

> I have been building with AI for a while. I no longer fully know what exists, what is half-built, what was forgotten, or what I should ask next.

Varai exists for that moment.

## Product Definition

Varai is a local-first tool that turns messy AI coding sessions into a clear build state: what exists, what is missing, what is uncertain, and what to ask next.

The first useful loop:

1. The builder provides intent: prompt, brief, issue, chat transcript, or notes.
2. Varai scans the local repo for grounded evidence.
3. Varai compares intent against evidence.
4. Varai writes a report and a next prompt.

## What It Is Not

Varai is not a general code intelligence platform.

Varai is not a sovereign model that becomes the source of truth.

Varai is not a diagram-first product.

Varai is not a tool that silently uploads private repos.

## Wedge

The practical wedge is post-AI build orientation:

> Before the next AI pass, show me what the current build actually appears to contain.

This can later become pre-ship audit, PR review, client handoff, or CI policy checks. The open-source core should stay focused on the builder's local clarity loop.

## Users

- Indie builders using Claude Code, Codex, Cursor, or similar tools.
- Developers returning to an AI-built project after several sessions.
- Nontechnical founders trying to understand what an AI/contractor actually built.
- Small teams using AI-generated PRs and wanting a grounded status report.

## Core Promise

AI helps you move fast. Varai helps you stay oriented.
