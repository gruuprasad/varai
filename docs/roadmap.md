# Roadmap

Varai is a pre-release prototype. The roadmap is organized around proof of the
workflow, not framework count.

## Shipped in the current prototype

- A single Develop conversation for product authoring, builder messages, and
  verification evidence.
- Human approval of a Seed with a semantic content hash and recoverable
  multi-turn drafting.
- Local command adapters for the product assistant and builder, configured by
  project-level `varai.config.json`.
- `varai create` for a ready-to-open project with Codex CLI configured to
  `gpt-5.6-luna`.
- Recorded build sessions, Seed-change supersession, interventions, snapshots,
  progression, and readiness gates.
- Realization lint, runtime-map validation/derivation, surface accounting, and
  bounded scenario execution.
- System Model scanning with native/WASM parser parity and explicit coverage.
- Signal, a small AI-native knowledge-feed application built through Varai.
  Its live Luna sequence has been black-box checked for new, redundant,
  corroborating, and conflicting contributions; disagreement remains visible.
- A Python stdlib HTTP analyzer that observes Signal's public API/UI surfaces.
- Built-in AI-assisted development roles over one shared Seed/System Model
  core, with role-attributed authoring, a pre-build verification plan, exact
  scenario handoff, and role-filtered advisory evidence.

## Next: make the workflow useful to real people

### Human evaluation

Run the human-evaluation protocol in
[poc/purchase-approvals-human-eval.md](poc/purchase-approvals-human-eval.md)
with target product owners. Measure whether people understand the Seed,
evidence limits, and next action without reading code.

### Static coverage that changes decisions

Teach the analyzer to observe plain-Python dataclasses, in-memory resources,
and application effects where that enables a real commitment to move from
`cannot_verify` to evidence-backed. Add focused fixtures and before/after
coverage tests; do not add framework breadth without a decision it improves.

### Preview and change continuity

Make the local application preview a first-class Develop action, show the
current session's runtime URL and scenario results in the conversation, and
make the next product change carry forward only still-valid bindings.

### Provider boundary

Keep the Codex CLI path as the current implementation. Add a second local
command adapter only when it tests the replaceable boundary or solves a real
workflow need. Hosted APIs and API keys are not the next step.

## Later, if the human gate passes

- prove the workflow on a second meaningful application substrate;
- expand analyzer coverage where a real user decision is blocked;
- add richer runtime assertions without accepting arbitrary user code;
- improve architecture/dependency lenses and explainers over existing Claims;
- evaluate deployment handoff only after local build/verify is reliable.

## Deliberately deferred

- browser code editing and a general AI IDE;
- hosted repository upload or silent remote analysis;
- production hosting and deployment orchestration;
- exhaustive framework/language support;
- universal policy, temporal-logic, concurrency, atomicity, or performance
  proofs;
- automatic inference of human intent from implementation;
- a builder-model marketplace.

## Historical records

The purchase-approval and Slotkeeper documents in `docs/poc/` and
`docs/product-loop-pilot.md` preserve earlier experiments. They are evidence of
how the verifier evolved, not the current quick-start path. The current product
contract is [product-control-room.md](product-control-room.md).
