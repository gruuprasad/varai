# Varai Roadmap

Direction: ADR 0004. Varai builds one local, evidence-backed System Model. Kalakar is the first serious acceptance project, never the source of core vocabulary.

## 0. Product language — complete

- Define Systems, Subsystems, Elements, Claims, evidence, claim state, and coverage.
- Validate the vocabulary across API, UI, Worker, CLI, Data, Library, mobile, and AI-using systems.
- Keep `docs/semantic-language.md` normative.

## 1. One-model foundation — complete

- Make System Model v1 the only scanner output and snapshot payload.
- Render `varai map` from the model.
- Diff Elements, Claims, coverage, confidence, and evidence movement.
- Invalidate pre-release Analysis IR snapshots instead of migrating them.
- Remove intent matching, stock catalogs, fact-inventory reporters, framework-shaped diff, and dual-payload compatibility code.

Exit: map, snapshot, diff, server, and dashboard all consume the same model.

## 2. Anchor-based semantic lift — implemented (v1)

- Recover declaration-backed Resource subjects through persistence or resolved convergence.
- Keep distinct Behaviors grouped around Resources and attach Interfaces as reach.
- Preserve ordered implementation provenance while keeping the implementation graph private.
- Derive browse-by-thing and browse-by-capability projections without adding an Anchor primitive.

## 3. Semantic analyzer contract — next

- Replace scanner-level framework branches with registered analyzers.
- Require every analyzer to emit Elements, Claims, capability coverage, and diagnostics.
- Keep parser observations private to each analyzer.
- Prove a second implementation of one lens without changing kernel, diff, persistence, or rendering.

Exit: a conformance analyzer can be registered without editing downstream model consumers.

## 4. Improve current-system usefulness

- Add Element detail views organized around inputs, outputs, conditions, effects, outcomes, and relationships.
- Make partial/unsupported/failed coverage prominent.
- Improve stable application/workflow lifting where it changes a real Kalakar decision.

## 5. Prove breadth deliberately

Recommended order: CLI, Worker, Data relationships, a second API framework, then another UI implementation style. Every capability needs a generic fixture, analyzer conformance test, model assertion, semantic diff assertion, and real-project acceptance where useful.

## 6. Checks and intent reconciliation

- Derive falsifiable checks from the model with holds/violated/cannot-verify outcomes.
- Bind durable repository intent as a separate overlay with bound/unbound/ambiguous states.

## 7. Optional English interpreter

After deterministic views are useful, allow an opt-in LLM to explain selected model claims. Every sentence must cite model IDs; removing the LLM changes readability only.

## Deferred

- hosted repository upload;
- LLM-first discovery;
- exhaustive framework coverage;
- generic architecture diagrams;
- runtime guarantees without runtime evidence.
