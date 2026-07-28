# Varai

**When an AI builds and changes software faster than you can read it, how do you stay sure the thing that got built is still the thing you meant?**

Varai is an attempt at a durable, human-owned level of software engineering
*above* the generated code — plus an independent, evidence-backed way to keep
that level honestly connected to what actually exists.

> The load-bearing mechanism is not yet proven. This repo is published to share
> the *thinking* and the working parts, and to ask for opinions — not to announce
> a finished product. The full essay: **[docs/the-varai-idea.md](docs/the-varai-idea.md)**.

## The problem

Software engineering assumes **code is the human operating surface**: we express
intent, then read the implementation and diffs to recover what the system is.

AI breaks that. A human states a product in prose; an LLM expands it into specs,
decisions, and code faster than the human can read or retain. Asking the LLM to
*explain* what it built doesn't close the gap — now the same probabilistic system
is **both the builder and the narrator**. You'd be trusting the same untrusted
thing twice.

Meaning is also lossy downward: the same code implements arbitrarily different
domain concepts. A validation function looks identical guarding a bank transfer
or a comment box. Domain meaning lived in the author's head, not the artifact —
so it must be **captured at authorship, not reconstructed later**.

## The approach

Three jobs, two opposite trust postures:

1. **Seed** — a human-ratified statement of what the system is meant to be, at
   domain altitude, authored with LLM assistance but *owned* by the human.
   Trusted because a person ratified it (`varai.seed.json`).
2. **Build** — any LLM/builder expands the seed toward code. Used fully, doubted
   by design. Vendor-neutral: Varai never locks to one agent.
3. **Verify** — Varai independently observes the artifact and reports what is
   realized, missing, unaccounted for, drifted, ambiguous, or beyond coverage.
   **No LLM opinion ever becomes the verdict.**

The connective tissue is *checking, not inference*. The builder emits an untrusted
**realization witness** (`varai.realization.json`) that names the seed hash it
built against and binds seed concepts to observed artifacts through stable
selectors. **Reconciliation** then deterministically resolves those bindings
against the independently-observed model and reports:

- **binding state** — `resolved`, `ambiguous`, `stale`, or `unbound`;
- **verdict** — `holds`, `violated`, `cannot_verify`, or `not_checkable`.

A wrong binding produces a *failed check*, never a false pass — a lie makes noise,
not silence. Absence is only reported as `violated` when a responsible analyzer
actually covered that area; otherwise it stays `cannot_verify`. This is the
compiler world's translation-validation / proof-carrying-code pattern applied to
a probabilistic compiler: producing is hard, checking is easy.

**The one unproven atom:** can a seed claim be bound to a computational artifact
and checked *without laundering a probabilistic guess into a deterministic
verdict*? Everything else is downstream of that.

## What runs today

The independent-observation half is real and shipped. Varai builds one local,
deterministic, **System Model** of a repository — every statement traceable to
source evidence, every analyzer limit explicit.

```text
repository -> analyzers -> System Model -> map / diff / dashboard
```

```bash
npm install -g .

varai map                    # current system view
varai map ../kalakar         # another repository
varai snapshot ../kalakar    # Git-bound checkpoint
varai diff ../kalakar        # compare checkpoint with current code
varai start ../kalakar       # live local dashboard
```

The seed → witness → reconciliation slice is also wired end to end:

```bash
varai seed validate ../repo  # check a varai.seed.json
varai seed approve ../repo   # human ratification (alias: ratify)
varai handoff ../repo        # package the ratified seed for a builder
varai check ../repo          # reconcile witness + model, report verdicts
```

Limit a scan when needed:

```bash
varai map ../kalakar --include services/backend --include services/frontend/src
```

### Current analyzer coverage

- FastAPI operations and selected request/response, requirement, effect, and failure shapes.
- React/Vite and Next.js screens, components, UI actions, and simple availability guards.
- SQLAlchemy and Prisma entities and data effects.
- npm/Python commands and Docker/Compose services.

Coverage is intentionally explicit and partial. Unsupported syntax is never
treated as proof that behavior is absent.

## On openness

A verifier is only credible if anyone can inspect how it reaches a verdict. A
closed judge of "does this match your intent" is just another black box to trust
— the exact posture Varai exists to escape. So the core stays open as a
*requirement of the trust model*, not a concession.

## Learn more

- **[The idea](docs/the-varai-idea.md)** — the full essay, including what survives adversarial pressure and what doesn't.
- **[The product control room](docs/product-control-room.md)** — who Varai is for, the supported substrate, and exactly what each kind of evidence can and cannot prove.
- **[Status & direction](docs/roadmap.md)** — what's proven, what's unproven, what's next.
- **[Semantic language](docs/semantic-language.md)** — the normative vocabulary.
- **[Spec](docs/spec.md)** — the running tool's contract. **[Glossary](docs/glossary.md)** — canonical terms.
- Product decisions: **[docs/adr/](docs/adr/)**.

## Development

```bash
npm test
```

426 tests, all passing, on Node 20+. The suite is the release gate: it exits
non-zero on any failure, and no documented claim about Varai's behavior should
outrun it.

## License

See [LICENSE](LICENSE).
