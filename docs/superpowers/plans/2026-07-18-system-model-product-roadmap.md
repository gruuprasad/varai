# Varai System Model Product Roadmap

Status: Consolidated into `docs/roadmap.md`

This document originally proposed introducing the System Model beside Analysis IR. Dogfooding and product review rejected that migration shape while Varai is still pre-release.

The accepted architecture is now:

```text
repository -> deterministic analyzers -> System Model -> map/diff/checks/explanation
```

There is one canonical, persisted, versioned product model. Framework-shaped parser observations remain private analyzer details. See `docs/roadmap.md`, `docs/spec.md`, and ADR 0004 for the current plan and contract.
