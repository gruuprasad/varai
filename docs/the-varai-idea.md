# Conserving Intent: The Idea Behind Varai

*Status: exploratory essay, not a specification. The load-bearing mechanism
described here is not yet proven to work.*

*Provenance: this piece was written by an AI (Claude) as a faithful synthesis of
an extended thinking session with Varai's author. It is published as an
AI-generated record of that reasoning — not to imply the author wrote it, and not
to claim the idea is finished. The point of publishing is the thinking, not a
product announcement.*

---

## Why this exists

Varai started as a vague "system analysis" tool and kept changing shape. This
essay is the attempt to say, plainly, what problem it is actually chasing — and
to be honest about the part that isn't solved. It is published regardless of
whether Varai ever works, because the *problem* is real and worth naming even if
this particular answer to it fails.

The author's real motivation is not grand. It is a concrete pain felt while
building a separate project (Kalakar, a house-authoring system): when an AI
builds and changes a system faster than you can read it, how do you stay sure the
thing that got built is still the thing you meant? Everything below is an attempt
to generalize that specific sting without losing it.

---

## The frontier problem

Software engineering still assumes **code is the human operating surface**. We
express intent, then write or read the implementation, inspect diffs, and recover
"what the system is" by reading the code.

AI breaks that assumption. Increasingly a human states a desired product in prose
and an LLM expands it into specs, decisions, and code. The generated
implementation grows and changes faster than the human can read or retain. And
asking the LLM to *explain* what it built does not close the gap — now a
probabilistic system is **both the builder and the narrator** of what it built.
You are trusting the same untrusted thing twice.

So the missing capability is:

> a durable, human-owned level of software engineering *above* the generated
> implementation, plus an independent way to keep that level honestly connected
> to what actually exists.

This is not only a code-understanding problem and not only a specification
problem. It is the problem of **conserving human intent across machine-performed
construction.**

## What breaks first: the direction of understanding

A tempting first move is to reverse-engineer meaning back out of the artifact —
read the code with an LLM and recover what each part "is." This fails for a
reason that turns out to be central: **meaning is many-to-one and lossy in the
downward direction.** The same compute structure implements arbitrarily different
domain concepts. A validation function looks identical whether it guards a bank
transfer or a comment box. The domain meaning was never *in* the artifact — it
lived in the prompt, in the author's head, in the act of creation.

So recovering intent by inspecting the artifact is always guessing, and guessing
is exactly what an accountability tool cannot afford. The lesson: **capture
intent at authorship, do not reconstruct it later.**

This splits cleanly. The *compute ladder* — code → functions → clusters →
modules — is derivable without an LLM, because it just re-describes structure
that is literally present. But the *domain jump* — "this cluster is the booking
flow," "this is a load-bearing wall" — cannot be recovered from below. It has to
come from the human, stated, not inferred.

## The seed

The **seed** is the human-owned statement of what a system is intended to be,
before committing to how it is computed.

It is **worker-agnostic**: it describes the work at domain altitude, not assuming
the worker is code. A booking system had inventory, holds, and confirmation when
it ran on clerks and ledgers; the computer is just today's substrate. The same
seed can be realized as a website, a mobile app, or a paper process. That is why
the seed — not the artifact and not the human's memory — is the fixed point that
everything else refers to.

Its natural *form* is the user's choice: players and exchanges, several players
sharing a resource, a process, a state model, responsibilities. Varai should not
impose a domain ontology. But it must impose a **fixed meta-structure** (the
grammar and semantics of the constructs) so that the statement can be checked —
free vocabulary, fixed grammar, exactly like a programming language lets you name
variables anything but fixes the keywords.

The seed is:

- authored with the human present;
- assisted by an LLM, because articulating an implicit mental model is hard;
- **ratified and owned by the human**, not authorized by the model;
- external to the implementation, not reverse-engineered from it;
- living and revisable as intent changes.

Crucially, the seed by itself is not a verifier. It is the independent, human-owned
anchor that *makes verification possible*. The hard part is the mechanism that
crosses from seed to artifact honestly.

## Three departments, two trust postures

The frame separates three jobs, and the whole design rests on treating them with
opposite trust:

1. **Seed.** Human + assisting LLM articulate intent; the human ratifies. Trust
   comes from human ownership, not model accuracy.
2. **Build.** An LLM (Codex, Claude, anything) expands the ratified seed toward
   code. Its capability is used fully, but its output is **doubted by design.**
   It need not be Varai and must never lock Varai to one vendor.
3. **Verify.** Varai independently observes the artifact and reports what is
   realized, missing, unaccounted for, drifted, ambiguous, or beyond coverage.
   **No LLM opinion ever becomes the verdict.**

The two postures:

- human-ratified intent is the authoritative statement of intent;
- machine-built implementation and machine-emitted claims are *claims requiring
  evidence.*

The same untrustworthy tool (an LLM) appears in two departments and is trusted in
one and doubted in the other — and the difference is **human ratification** on
one side and **mechanical cross-checking** on the other. That asymmetry is the
spine of the whole idea.

## The compiler parallel

The clarifying analogy: **the seed language is fed to an AI builder the way a
programming language is fed to a compiler.** The seed program describes the app;
the builder compiles it into a running system.

The compiler world already faced our exact dilemma — how do you trust the output
of a translator you don't trust? Its answer is not "trust the compiler." It is
**translation validation / proof-carrying code**: the compiler emits the output
*plus a certificate*, and a small, dumb, trusted checker validates the certificate
against the source. Producing is hard; checking is easy. That asymmetry is the
game.

Varai is that pattern, with one twist and one break:

- **The twist:** the compiler here is a probabilistic AI, so the certificate-and-
  checker isn't a nicety — it's the only available trust mechanism.
- **The break:** source → machine code is exact and total; **seed → system is
  partial by design.** The seed deliberately under-specifies. So verification is
  not "is the artifact *the* translation" (equality — the wrong question) but "is
  the artifact *a* valid realization within the space the seed allows"
  (refinement — the right question). Realized = inside the space; drift = stepped
  outside; orphan = code the space doesn't mention. The looseness of the seed is
  what makes checking tractable: you check *membership in a space*, not *equality
  to a point*.

## The unsolved mechanism: binding

Everything reduces to one word — the verifier must **map the artifact back to the
seed's parts**, and "map back" is where determinism is won or lost. There are
only three ways that map can be made:

| How the map is made | Deterministic? | Problem |
|---|---|---|
| Verifier infers it (reads code, decides "this is Checkout") | No | This is the interpretive "lift" — probabilistic, the laundering we forbid |
| Builder declares it (tags "this code = Checkout" at build time) | Yes, *if honest* | Data can lie; needs cross-checking |
| Language forces it (seed constructs appear as named anchors in the artifact) | Yes | Requires the builder to build in the language's terms |

The interpretive lift is the trap: imitating how a human recognizes "this is the
Structure logic" mechanizes exactly the step that is irreducibly a guess. So the
map must be **declared, not inferred.**

Two ideas make declaration safe:

1. **The tag is a pointer, not a truth.** A tag's job is only to say *"check this
   code against this seed claim"* — not *"this is correct."* A wrong pointer
   produces a **failed check**, not a false pass. A lie makes noise, not silence.
2. **The seed's claims over-constrain each other.** A seed says many things about
   the same part ("Structure consumes loadbearing," "produces columns," "runs
   after shell-close"). A mislabel can satisfy one claim but violates its
   neighbors. Truth is what satisfies all claims at once; a lie surfaces as
   contradiction — no interpretation required. Redundancy, not authority, secures
   the map.

In practice the tag is cheap, carried data: structured comments (`// seed:
Checkout consumes Cart`, valid in any language) plus a sidecar manifest — the same
shape as source maps and SBOMs. It can be emitted by a prompt contract today
(works with any model), by agent hooks tomorrow, or by Varai wrapping the build
for the strongest trail. And critically: **a missing or stale tag degrades
coverage, never correctness.** The verifier still observes the artifact
independently; worst case it says "cannot establish," never a wrong "realized."

## What honestly survives, and what doesn't

Under adversarial pressure, some claims collapse and should be conceded:

- **The verify *mechanism* is not novel.** It is the architecture-fitness-function
  family (ArchUnit, import-linter, dependency-cruiser). What is different is
  *altitude* (domain-level, authored by the person who intends the system, not in
  code terms by a developer) and the *authoring path* (LLM-assisted, human-ratified).
- **It is not "fully deterministic" unconditionally.** It is deterministic
  *conditional on the binding being declared rather than inferred.* If the binding
  is LLM-inferred, the accountability story is theater.
- **It is not OpenSpec.** OpenSpec is written to be *read* by a human or AI who
  then uses judgment. The seed language is written to be *checked* by a dumb
  verifier — which forces a hard constraint OpenSpec neither has nor wants:
  **every construct must have checkable semantics, and unfalsifiable statements
  are refused entry.** A seed cannot contain "the checkout should feel smooth."
  OpenSpec can. That single constraint is the difference of kind. (The seed can
  *expand into* an OpenSpec for the builder to read — spec is a projection of the
  seed, not the seed.)
- **"Magically unpack any app at any altitude" is not a mechanism.** It is a UI
  aspiration sitting on top of an unproven core.
- **Varai cannot verify everything.** It guards intent only as far as the seed can
  *state* it and the artifact leaves *observable evidence*. Structural and
  behavioral intent (who does what, what flows where) is its sweet spot.
  Qualitative intent ("elegant," "fun," "accurate") can be named but not checked —
  that is the irreducible **meaning-drift residue**, reported honestly as "cannot
  establish."

What survives is smaller and honest: **a domain-altitude, human-ratified,
continuously-bound conservation check** that lets someone who no longer reads the
code still have a trustworthy window into whether the system is still the one they
meant. Its value scales precisely with *how little of the code the human reads* —
which is the world AI-driven development is creating.

## Open questions (unsolved, on purpose)

1. **Representation.** The minimum common structure different natural seed forms
   need to participate in construction and verification. Rich enough to bind,
   loose enough for a human to speak. This is a language-design problem on a
   knife-edge.
2. **The weakest checkable semantics per construct.** What does "player X consumes
   resource Y from player Z" mean, precisely enough that "is this realized?" has a
   yes/no answer, yet loosely enough that a human states it naturally?
3. **Redundancy vs. ceremony.** How much over-determination must a seed carry to
   catch a lie, without turning the human into a formal-methods engineer?
4. **The binding contract.** What exactly does the builder emit, and via what
   mechanism (prompt contract → agent hooks → full wrap)?
5. **Coverage.** When can absence be reported, and when is "could not determine"
   the only honest result?
6. **Evolution.** Keeping seed changes, artifact changes, binding changes, and
   analyzer changes distinguishable over time.

## On openness

Varai's core — the seed language, the verifier, the tag contract — should be
open, and not as a business concession. **A verifier is only credible if anyone
can inspect how it reaches a verdict.** A closed, secret judge of "does this match
your intent" is just another black box to trust — the exact posture Varai exists
to escape. So openness is a *requirement of the trust model*, not a giveaway. A
company, if one ever forms, would sell the layer above the commons — hosting,
team collaboration, governance for AI-built systems — never by closing the core.
None of that matters until the mechanism works.

## The honest bottom line

The idea is coherent and it borrows a real, studied pattern (certifying compilers
and refinement checking) applied to a new, probabilistic compiler. But coherent
is not the same as proven. The one thing that decides whether any of this is real —
tool, protocol, or eventual company — is a single unproven atom:

> Can a seed claim be bound to a computational artifact and checked, without
> laundering a probabilistic guess into a deterministic verdict?

Everything else — packaging, business shape, IDE-or-plugin, which LLM — is
downstream of that. If the binding works, Varai is a genuinely new and useful
thing. If it doesn't, this essay is still an honest map of a real problem that
AI-driven software will keep making sharper.

That was reason enough to publish it.
