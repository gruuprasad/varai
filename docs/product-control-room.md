# The product control room

This page is the product contract. It says who Varai is for, what it will and
will not become, and — most importantly — exactly what each kind of evidence can
and cannot establish. The accepted decision is
[ADR 0007](adr/0007-product-control-room-and-constrained-substrate.md).

## What it is

A local product control room for AI-built operational software.

A person authors and approves roles, workflows, product surfaces, and concrete
behavioral scenarios. An interchangeable AI builder implements the approved
change inside a recorded build session. Varai then independently checks the
resulting system and makes missing, extra, degraded, or unverified behavior
impossible to mistake for health.

The emphasis is on *independently*. A builder that reports its own success is
testimony. Varai's job is to be the party that does not take that report at face
value.

## Who it is for

A domain expert, operator, or product owner who:

- understands how their business process should work;
- does not want to operate primarily through code;
- will inspect a product blueprint and approve explicit changes;
- uses an AI builder for implementation;
- needs more confidence than builder-authored prose or tests provide.

## What it is for

Multi-role operational and workflow web applications: requests and approvals,
bookings and resource allocation, case management, membership operations,
lightweight internal SaaS.

These share the properties that make verification interesting — several roles
with different authority, records that move through states, side effects that
must accompany decisions, and a real cost to unrequested behavior.

## Supported substrate

The first proof supports exactly:

- React/Vite frontend;
- FastAPI backend;
- SQLAlchemy over PostgreSQL or SQLite;
- synchronous HTTP commands and queries;
- local process execution;
- one configured AI-builder subprocess.

Framework breadth is not a success metric. Where the stack is unsupported or
routes are registered dynamically, surface accounting must report
`cannot_account` rather than an empty, clean-looking result.

## What each evidence source can prove

This is the load-bearing table. Every claim Varai makes traces to one of these
rows, and none of the rows is sufficient alone.

| Source | Can establish | Cannot establish alone |
| --- | --- | --- |
| Static System Model | routes, effects, dependencies, public artifacts | runtime authorization correctness, atomicity |
| Runtime scenario | one concrete interaction and its observed result | a universal invariant |
| Realization / runtime map | where to check | correctness |
| Builder tests and prose | supporting testimony | a verdict |

Three consequences follow, and they are stated in ADR 0007 as rules rather than
guidance:

**Scenarios are examples.** A passing scenario proves the ratified example ran
and produced the asserted result. "Scenario passed" is honest; "only owners can
ever withdraw" is not established by two examples. General property checking and
concurrency proof are later research, not a rewording of what exists.

**Pointers are not proof.** The runtime map tells the runner which operation to
call. The runner still calls the real public operation and checks the response
itself, and every mapped operation must cross-resolve to the same canonical
Element as an approved surface binding.

**Testimony is not verdict.** No LLM output — and no builder-authored test —
sets a verdict, coverage state, surface-accounting state, scenario assertion, or
readiness gate.

## The three authorities

| Authority | Owner | Persisted? |
| --- | --- | --- |
| Seed | human (assistant may propose, only a person ratifies) | yes, `varai.seed.json` |
| System Model | independent observation of the repository | yes, the one analyzer model |
| Build/session evidence | recorded workflow | yes, as audit evidence |

No graph combining Seed and System Model is ever persisted. The blueprint,
surface accounting, reconciliation, and readiness are all pure projections
computed on demand. This is what keeps the authorities from quietly merging into
a single model that nobody owns.

Editing is one-way. Product chat produces only an unapproved draft. Approval
freezes a content hash. A builder changes implementation files and emits
untrusted bindings, and can never edit or approve the Seed. No terminal or
builder console mutates semantic intent.

## Build states

```text
draft -> approved -> building -> verifying
      -> ready | needs_attention | build_failed | superseded
```

- `building` requires an exact approved Seed hash.
- Ratifying a changed Seed mid-build marks that build `superseded` — inspectable,
  never `ready`.
- Builder exit always passes through `verifying`.
- Any repository change after `ready` makes the state `unattested` until another
  recorded verification completes.

There is no generic green state. A build cannot be `ready` while carrying hidden
`cannot_verify` results.

## When a build is ready

`ready` requires all of:

- no ratified requirement is `violated`;
- no critical scenario failed or went unexecuted;
- no required binding is stale, ambiguous, or unbound;
- no expected public surface is missing;
- no observed public surface is unaccounted;
- no analyzed critical scope degraded to partial, failed, or unsupported;
- realization, runtime mapping, Seed hash, tree hash, and scan configuration all
  match the completed session.

Anything else is `needs_attention`, with machine-readable reasons. Acknowledging
a problem never turns an unverifiable critical rule green; that needs a new Seed
decision or a real analyzer/runtime improvement.

### Why degradation blocks readiness

A builder that cannot satisfy a rule has a cheaper option than fixing the code:
make the handler harder to analyze, so `violated` decays into a calm
`cannot_verify`. So a critical scope moving from `analyzed` to `partial`,
`unsupported`, `failed`, or missing is reported as a **regression**, not as a
neutral limitation. Reduced analyzability is a build result.

The mirror of that rule is that uncertainty must stay expensive: an unresolved
helper in an otherwise understood handler genuinely can hide an effect, so Varai
recognizes only known framework, schema, and model mechanics and keeps every
other unknown call loud.

## Product language: surfaces and scenarios

Seed v3 adds two human-owned arrays to the v2 language. The full normative
vocabulary is in [semantic-language.md](semantic-language.md); the worked example
is [examples/purchase-approvals.seed.v3.json](examples/purchase-approvals.seed.v3.json).

**Surfaces** declare expected externally reachable behavior by `channel`
(`ui | api | webhook | job | cli`) and `access`
(`public | authenticated | internal`). A surface names no HTTP path, framework,
file, or symbol. This is what gives Varai the code-to-spec direction it has been
missing: every observed externally reachable Element must be claimed by exactly
one ratified surface, so an extra route is `unaccounted` even when every positive
requirement holds. The only way to accept a legitimate new public surface is a
reviewed Seed change, ratification, and rebinding.

**Scenarios** are bounded ordered interactions — sequential steps, distinct
principals bound to actor concepts, behavior invocation, scalar or JSON input,
references to captured response fields, exact status assertions, partial body
assertions. Deliberately absent: concurrency, temporal windows, performance,
arbitrary expressions, database inspection, and user-supplied test code.

## The proof application, expressed in the language

The proof application is a purchase-approval workflow with seven product rules.
The hand-authored Seed is
[examples/purchase-approvals.seed.v3.json](examples/purchase-approvals.seed.v3.json)
— 19 concepts, 23 commitments, 11 surfaces, 9 scenarios. It was written before
the schema, as a test of whether the language can hold real product rules without
implementation vocabulary.

| Product rule | Expressed as |
| --- | --- |
| 1. An employee can submit a purchase request | `commitment.employee-performs-submit`, `commitment.submit-creates-request`, `surface.submit-request-api`, `surface.submit-request-ui` |
| 2. The requester can withdraw only their own pending request | `commitment.withdraw-requires-ownership`, `commitment.withdraw-requires-pending`, `commitment.withdraw-fails-not-allowed`, `scenario.owner-can-withdraw`, `scenario.non-owner-cannot-withdraw`, `scenario.decided-request-cannot-be-withdrawn` |
| 3. A manager can approve at or below the threshold | `commitment.approve-requires-manager-limit`, `commitment.manager-performs-approve`, `scenario.manager-approves-within-limit` |
| 4. Finance approval is required above the threshold | `commitment.approve-requires-finance-above-limit`, `commitment.finance-performs-approve`, `scenario.manager-cannot-approve-above-limit`, `scenario.finance-approves-above-limit` |
| 5. An approved request creates one purchase order | `commitment.approve-creates-order`, `commitment.reject-creates-no-order` (expectation `absent`), `scenario.manager-approves-within-limit`, `scenario.rejection-is-recorded` |
| 6. Every approval, rejection, and withdrawal creates an audit entry | `commitment.approve-creates-audit`, `commitment.reject-creates-audit`, `commitment.withdraw-creates-audit`, `commitment.audit-reads-entries`, `scenario.approval-is-recorded`, `scenario.rejection-is-recorded`, `scenario.withdrawal-is-recorded` |
| 7. No unauthenticated destructive operation is an approved surface | every surface declares `access: "authenticated"`; there are zero `public` surfaces, so any observed unauthenticated route is `unaccounted` |

Two things in that table are worth reading carefully.

Rule 2 needs three scenarios, not one, because "only their own pending request"
has three distinct failure modes: the owner is refused, a non-owner succeeds, or
a denial silently corrupts state. Each scenario ends by reading the request back,
so a handler that returns 403 *after* mutating state fails the follow-up
assertion rather than passing on the status code alone.

Rule 7 is enforced by absence rather than by a commitment. There is no way to
write "nothing else exists" as a commitment; it falls out of surfaces being a
closed set within the supported substrate. That is the whole reason surface
accounting exists.

What the example deliberately does not claim: `context.one-order-per-approval`
records that exactly one order per approval is required *and* that concurrency is
not established by the current checks. `context.scenarios-are-examples` says the
same thing about every scenario in the file. Honest limits belong in the Seed, not
only in the docs.

## Non-goals

Varai is not becoming a general AI IDE, a prompt-to-app builder, or a framework
breadth project. Explicitly deferred: browser code editor, arbitrary stacks,
hosted repository upload, production deployment and hosting, universal policy or
temporal-logic language, general invariant proving, concurrency and atomicity
proof, performance and SLA verification, mobile and native applications, a
builder model marketplace, and any automatic inference of human intent from code.

## The decision this is set up to make

The proof is a purchase-approval workflow in a separate sibling repository,
subjected to adversarial trials: omitted audit write, inverted authorization,
state corruption after denial, an unrequested destructive route, coverage
poisoning, a pure refactor, a product change through chat, and an outside-session
edit. False greens must be zero.

If those checks work but target users reject the workflow, Varai narrows to an
AI-development architecture and trust tool for developers. The response to
rejection is not more frameworks and not a larger IDE.
