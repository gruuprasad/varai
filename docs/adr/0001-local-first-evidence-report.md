# ADR 0001: Local-First Evidence Report

Status: Partially superseded by ADR 0004

ADR 0004 supersedes the intent-file evidence-report product shape. The local-first, evidence-backed, uncertainty-aware constraints remain accepted.

## Context

The original idea was a transparent view into AI-built software. The practical buildable wedge is narrower: a local build-state report that compares intent against repo evidence.

Builders may not want to upload private repos to a new service. They also should not trust fluent summaries without evidence.

## Decision

Varai starts as a local-first CLI that scans a repo, reads an intent file, and writes an evidence-backed report.

The first product surface is Markdown. HTML can follow.

The system must distinguish:

- deterministic facts from code
- inferred findings from evidence
- explicit uncertainty

## Consequences

This keeps the first version small and inspectable.

It also means the early product may feel humble. That is intentional. Trust matters more than breadth.
