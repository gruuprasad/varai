# Varai Frontier Problem and Emerging System Shape

Status: Working reference, not an ADR or implementation specification  
Date: 2026-07-22

## Purpose

This document preserves the current research frame before Varai chooses the next
questions or implementation experiments. It records the problem being pursued,
the role of the seed, and the emerging shape of Varai as a software-engineering
system. It deliberately does not claim that the mechanism connecting seed and
artifact has been solved.

Accepted ADRs, `docs/semantic-language.md`, and `docs/spec.md` remain normative.
If this research changes the product contract, that change requires an explicit
decision rather than a silent reinterpretation of existing terms.

## The frontier problem

Software engineering still assumes that code is the human operating surface.
Humans express intent, write or review the implementation, inspect code changes,
and use the code to recover what the system is.

AI changes that relationship. Increasingly, a human states a problem or desired
product while an LLM performs much of the expansion into specifications,
decisions, and code. The generated implementation can grow and change faster
than the human can read or retain it. Asking an LLM to explain the implementation
does not close the trust gap: a probabilistic system is then both the builder and
the narrator of what it built.

The missing capability is a durable human-owned level of software engineering
above the generated implementation, together with an independent way to keep
that level connected to what actually exists.

Varai is pursuing that missing capability:

> Let humans frame, understand, and steer a system at the level at which they
> intend it; let AI perform the compute expansion; and preserve an independent,
> evidence-backed account of whether the resulting artifact still realizes what
> the human ratified.

This is not only a code-understanding problem and not only a specification
problem. It is the problem of conserving human intent and system understanding
across machine-performed software construction.

## The seed

The seed is the human-owned statement of what the system is intended to be before
choosing or describing its computational realization in detail.

It is worker-agnostic: it describes the work or system at domain altitude rather
than assuming that its worker is code. Depending on the system and the person
designing it, its natural form might emphasize players and exchanges, multiple
players sharing a resource, a process, a state model, responsibilities, or some
other domain-appropriate view.

The seed is:

- authored with the human present;
- assisted by an LLM because articulating an implicit mental model is difficult;
- ratified and owned by the human rather than authorized by the LLM;
- external to the implementation rather than reverse-engineered from it;
- living and revisable as the intended system changes.

The seed is not, by itself, a verifier. It cannot establish which artifacts
realize it, whether a realization is complete, or whether a declared identity is
truthful. It supplies the independent human-owned anchor that makes those
questions possible. The missing technique is how the rest of the system crosses
that gap honestly.

## Three departments and two trust postures

The current frame separates three departments:

### 1. Seed

The human and an assisting LLM articulate the intended system. The human reviews,
corrects, and ratifies the result. Trust comes from human ownership of the
statement, not from model accuracy.

### 2. Build

An LLM or other builder expands the ratified seed toward specification,
decisions, and code. Its capability is used fully, but its output is doubted by
design. The builder may participate in a future binding or evidence protocol,
but its declarations cannot become verdicts merely because it emitted them.

The build executor need not be Varai and must not make Varai dependent on one AI
vendor. Varai may nevertheless become the engineering environment that prepares,
coordinates, records, and examines this build process.

### 3. Verify

Varai independently observes the resulting artifact, relates observations to the
ratified seed, and reports what is realized, missing, unaccounted for, drifted,
ambiguous, or beyond current coverage. No LLM opinion becomes the verification
verdict.

These departments use two opposite trust postures:

- human-ratified intent is treated as the authoritative statement of intent;
- machine-built implementation and machine-emitted binding claims are treated as
  claims requiring evidence.

Verification is not a one-time final gate. Seed, build, observation, and
reconciliation form an ongoing engineering loop.

## Varai is becoming a software-engineering system

The seed does not replace the current System Model, map, diff, evidence, coverage,
or future checks. Its importance is that it gives those components a human-owned
direction. As the components come together, Varai is becoming more than a single
repository-analysis tool.

The emerging system includes:

- a seed-authoring environment that helps a human articulate and ratify intent;
- a durable, versioned record of that intent and its changes;
- a vendor-neutral handoff to builders;
- a contract through which build-time knowledge can be preserved as claims;
- deterministic analyzers that build the evidence-backed System Model;
- a mechanism for relating seed claims, builder claims, and artifact evidence;
- current-system maps and progressive views for understanding what exists;
- semantic progression showing how the realized system changes;
- verification and reconciliation when intent and artifact disagree;
- explicit coverage, ambiguity, and unknowns wherever the mechanism cannot
  establish a conclusion.

This does not yet decide whether these capabilities ship as one command, several
tools, a local environment, or integrations around a common model. "System"
describes the product responsibility: maintaining the engineering relationship
from human intent through machine construction to independent understanding and
verification.

## The unsolved mechanism

The load-bearing research problem is not whether a seed is useful. It is how a
seed participates in a mechanism strong enough to connect domain intent to a
computational artifact without laundering probabilistic interpretation into a
deterministic verdict.

The mechanism must eventually account for at least:

1. **Representation** — the minimum common structure that different natural seed
   forms need in order to participate in construction and verification.
2. **Expansion and refinement** — how information added between seed, spec, and
   code is preserved rather than disappearing inside the builder.
3. **Identity and binding** — how a seed concept acquires stable relationships to
   one or many realized artifacts across regeneration and refactoring.
4. **Independent evidence** — what Varai must observe to corroborate or contradict
   a builder's realization claim.
5. **Coverage** — when absence can be reported and when the only honest result is
   that Varai could not determine it.
6. **Evolution** — how seed changes, artifact changes, binding changes, and
   analyzer changes remain distinguishable over time.
7. **Meaning drift** — which domain statements can be made falsifiable and which
   irreducibly remain human declarations.
8. **Ceremony** — how the system captures enough structure and accountability
   without requiring the human to become a formal-methods engineer or approve
   implementation trivia.

Authorship-time markers, shared identifiers, deterministic data-flow analysis,
tests, runtime observations, and human ratification are possible ingredients.
None has yet been established as the complete technique.

## Relationship to the current System Model

The current canonical System Model remains the evidence-backed description Varai
builds from a repository. It is the independently observed side of the emerging
system and must not be replaced by a second analyzer IR.

The seed is a human-authored source of intent, not another parser product. The
research must determine how it overlays, constrains, or otherwise relates to
stable System Model identities and Claims without corrupting the distinction
between declared intent and observed realization.

The current map remains valuable even without a seed: it helps a human inspect
what exists. With a seed and a sound connecting mechanism, the same map may also
show what was intended, how it was realized, where the connection is supported,
and where it is absent or uncertain.

## Intended human experience

A successful Varai system would let a person:

1. articulate a system in their own domain language with LLM assistance;
2. inspect and ratify a durable seed rather than surrendering authority to a
   prompt or generated specification;
3. delegate computational construction to any capable builder;
4. see the resulting system at a high level without reading all generated code;
5. descend from a domain concept to behavior, state, interface, and repository
   evidence when more detail is needed;
6. see what was realized, what is missing, what appeared without a declared role,
   what changed, and what Varai cannot establish;
7. reconcile disagreement by changing the implementation, changing the ratified
   seed, or improving the evidence mechanism.

The desired result is not trust in the builder. It is sustained human control of
software construction even when the human no longer performs or reads most of
the implementation work.

## Research boundary

The next research should design and test the connecting mechanism. It should not
silently collapse the seed into a conventional requirements document, infer the
seed from an existing codebase, declare a universal seed ontology prematurely,
or reduce Varai to whichever part is easiest to implement today.

Likewise, the vision must not be protected through vague claims. Each proposed
mechanism should be tested against adversarial cases: incorrect builder claims,
unbound behavior, incomplete analyzer coverage, refactoring, shared mechanisms,
cross-cutting responsibilities, and genuine changes of human intent.

The immediate research agenda remains open. This document is the common frame
from which those questions should be selected.
