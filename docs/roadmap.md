# Varai Roadmap

Direction: ADR 0004. Varai builds a local, evidence-backed System Model for technical builders supervising AI-written code. Kalakar is the first serious acceptance project, never the source of core vocabulary.

## 0. Product and language alignment

- Keep `docs/semantic-language.md` normative.
- Record the System Model product decision and shared vocabulary.
- Validate kernel changes across multiple system contexts.

Status: complete for semantic language v0; product documentation alignment is part of the System Model v1 slice.

## 1. System Model v1 vertical slice

- Introduce a framework-neutral, versioned model beside Analysis IR v2.
- Project current API, UI, Data, CLI, and Service observations.
- Add explicit analyzer coverage.
- Make `varai map` render the System Model.
- Persist both Analysis IR and System Model objects.

Exit: the current system is understandable in system language while existing snapshots/diffs remain compatible.

## 2. Semantic adapter contract

- Replace scanner-level framework branches with registered semantic adapters.
- Require each adapter to emit Elements, Claims, capability coverage, and diagnostics.
- Prove that adding a second implementation of one lens changes no kernel/diff/persistence code.

## 3. Current-system interface

- Make System Model navigation the primary dashboard experience.
- Add subsystem and Element detail views with evidence links.
- Make partial/unsupported/failed coverage prominent.

## 4. System Model diff

- Diff Elements and Claims rather than fixed framework clauses.
- Separate application changes, qualifier changes, confidence changes, evidence movement, and coverage evolution.
- Replay the backend output-contract and frontend availability dogfood scenarios.

## 5. Breadth through structurally different lenses

Recommended order: CLI, Worker, Data, a second API framework, then a second UI implementation style. Each capability needs a generic fixture, adapter conformance test, model assertion, semantic diff assertion, and real-project acceptance when applicable.

## 6. Checks and intent reconciliation

- Derive falsifiable checks from the System Model with holds/violated/cannot-verify outcomes.
- Bind durable repository intent artifacts as a separate overlay with bound/unbound/ambiguous states.
- Keep steering output evidence-grounded and vendor-neutral.

## 7. Optional English interpreter

An opt-in LLM may explain selected System Model Claims after deterministic output is useful. Every sentence must cite model IDs; removing the LLM changes readability only.

## Deferred

- hosted repository upload;
- LLM-first discovery;
- exhaustive framework coverage;
- generic architecture diagrams;
- runtime guarantees without runtime evidence.
