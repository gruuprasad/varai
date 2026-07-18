# Varai Semantic Language

Status: Draft v0.1  
Date: 2026-07-18

## Purpose

Varai translates source code into a system-level language that lets a builder understand a software project without reading its implementation.

This document defines that language before it defines a storage schema. Future IRs, adapters, renderers, diffs, checks, and explanations must encode or project this language; they must not grow an accidental vocabulary independently.

Varai describes:

- what parts a system contains;
- what behaviors those parts offer;
- how behaviors are triggered and constrained;
- what enters, changes, and comes out;
- how behaviors complete or fail;
- how parts connect;
- what Varai observed, inferred, or could not analyze.

Varai does not claim business purpose, correctness, quality, or intent unless those claims come from a separate, explicit source.

## Design principles

### One kernel, several lenses

The semantic kernel is framework- and language-neutral. API, UI, Worker, CLI, Data, Service, Library, and Application lenses render the same kernel using words natural to that subsystem.

### Claims, not summaries

The atomic unit is a claim grounded in evidence. A paragraph, card, system view, or English explanation is a projection over claims.

### Absence is not evidence

If Varai does not find a behavior or effect, it may report absence only when the relevant analyzer declares complete coverage for that construct. Otherwise it reports partial or unsupported coverage.

### Stable meaning, movable evidence

Source locations prove claims but do not define their meaning. Moving code must not change semantic identity when the externally meaningful boundary remains the same.

### Domain names are recovered, not invented

Names may come from routes, commands, schemas, UI labels, symbols, configuration, or supplied design artifacts. Varai may normalize such names deterministically, but it does not invent a business-domain interpretation from implementation alone.

## The semantic kernel

### System

The software project being described. A repository normally maps to one System, though a monorepo may contain several independently operable systems.

### Subsystem

A coherent part of the System with its own interaction language. Initial subsystem kinds are:

- API
- UI
- Worker
- CLI
- Data
- Service
- Library
- Application

Subsystem kinds are presentation lenses, not framework names. FastAPI and Express both populate the API lens; React Native, React Web, Vue, and terminal interfaces populate the UI lens with a `platform` qualifier such as `mobile`, `web`, `desktop`, or `terminal`.

### Element

A stable, referable part inside a Subsystem. Examples include an API operation, screen, user action, worker job, command, data entity, schema contract, artifact, or process.

An Element has:

- a semantic identity;
- a kind within its lens;
- a recovered name;
- zero or more evidence-backed relationships.

### Interface

An Element through which something outside a Subsystem can interact with it. Examples are an endpoint, screen/control, queue topic, scheduled hook, command, or service port.

Interface is a role: an API operation may itself be the interface; a screen may expose several action interfaces.

An adapter does not create a separate Interface Element when an existing Element already plays that role.

### Behavior

An Element representing something the system can do. It is the primary unit users inspect and the primary unit Varai compares over time.

A Behavior may have:

- a trigger;
- inputs;
- conditions;
- resource effects;
- invoked behaviors or systems;
- outputs;
- outcomes.

Not every Behavior has every part. Missing unsupported parts remain unknown.

### Resource

An Element read, changed, created, removed, or produced by a Behavior. Common resource roles are:

- state;
- data entity;
- contract/schema;
- file or artifact;
- configuration;
- queue;
- external system.

Storage medium is a qualifier on a Resource or relationship, not a new semantic primitive.

## Relationship vocabulary

A relationship is one atomic semantic statement from a source Element to a target Element or literal value.

### Composition and exposure

| Relationship | Meaning |
|---|---|
| `contains` | A System/Subsystem/Element owns or groups another Element. |
| `exposes` | A Subsystem makes an Interface available. |
| `offers` | An Interface makes a Behavior available. |

### Trigger and interaction

| Relationship | Meaning |
|---|---|
| `triggered_by` | An actor, request, event, schedule, command, or call starts a Behavior. |
| `invokes` | A Behavior calls or initiates another Behavior or external system. |

### Contract

| Relationship | Meaning |
|---|---|
| `accepts` | A Behavior receives an input or contract. |
| `produces` | A Behavior returns or generates an output or artifact. |

### Conditions

| Relationship | Meaning |
|---|---|
| `requires` | A prerequisite, authorization, dependency, or configuration must be present. |
| `available_when` | A state condition controls whether an Interface or Behavior is available. |

### State and effects

| Relationship | Meaning |
|---|---|
| `reads` | A Behavior observes a Resource without intentionally changing it. |
| `changes` | A Behavior updates a Resource. |
| `creates` | A Behavior establishes a new persistent Resource. |
| `removes` | A Behavior deletes or retires a Resource. |

Silence never proves read-only. Varai may render “reads only” only when effect coverage for that Behavior is complete.

### Outcomes

| Relationship | Meaning |
|---|---|
| `succeeds_with` | A Behavior has an observable successful completion. |
| `fails_with` | A Behavior has an observable failure outcome. |
| `navigates_to` | A UI Behavior changes the active screen/location. |
| `emits` | A Behavior publishes an event or message. |

### Data structure

| Relationship | Meaning |
|---|---|
| `has_field` | A contract or entity exposes a named field. |
| `relates_to` | A data Element refers to another data Element. |
| `stored_in` | A Resource is persisted through a known medium or store. |

The vocabulary is deliberately small. New relationships require examples from at least two system contexts or proof that no existing relationship can express the meaning.

## Claim model

Every relationship presented to the user is a Claim.

A Claim contains:

- source Element;
- relationship type;
- target Element or literal;
- optional qualifiers;
- evidence;
- observation method;
- claim state;
- analyzer capability responsible for it.

Qualifiers refine a relationship without creating framework-specific verbs. Examples include storage medium, HTTP status, event name, direction, cardinality, condition expression, UI platform, delivery mode, application state, dependency optionality, execution mode, timeout, queue name, or concurrency.

### Claim states

| State | Meaning | Permitted language |
|---|---|---|
| `observed` | Direct syntax/manifest/file structure proves the claim. | “does”, “accepts”, “produces” |
| `inferred` | Deterministic cross-file or convention-based reasoning supports it. | “Varai identifies…”, optionally marked inferred |
| `unverified` | Evidence suggests the area, but analysis could not establish the relationship. | “could not determine…” |
| `ambiguous` | More than one supported interpretation remains. | “may…”, with alternatives |

An inferred friendly name must not increase the confidence of the underlying structural claim.

### Evidence

Evidence identifies where and how a Claim was established. It normally includes a repository-relative file and optional line, symbol, or manifest key.

Evidence may move without changing the Claim. Multiple evidence sites supporting the same Claim are merged.

### Observation methods

Initial methods include:

- AST observation;
- manifest/file observation;
- deterministic semantic resolution;
- named convention/heuristic.

The method describes how the claim was recovered; claim state describes how strongly Varai can state it.

## Coverage language

Coverage describes what Varai was capable of determining, not test coverage or a quality score.

Coverage attaches to an analyzer capability and repository scope.

| State | Meaning |
|---|---|
| `analyzed` | Relevant constructs in scope were handled by the capability. |
| `partial` | Some relevant constructs were handled; known unsupported shapes remain. |
| `unsupported` | Varai recognized the area but has no analyzer for the construct. |
| `failed` | The analyzer should have run but did not complete. |

User-facing absence language must be qualified:

```text
No semantic change within analyzed API-output and UI-availability coverage.

UI async outcomes were only partially analyzed.
```

Varai must not collapse either statement into an unconditional “no change.”

## Canonical sentence grammar

System views and deterministic renderers derive sentences from these forms:

```text
<System/Subsystem> contains <Element>.
<Subsystem> exposes <Interface>.
<Interface> offers <Behavior>.
<Behavior> is triggered by <Trigger>.
<Behavior> accepts <Input>.
<Behavior> requires <Condition>.
<Behavior> is available when <Condition>.
<Behavior> reads/changes/creates/removes <Resource>.
<Behavior> invokes <Behavior/System>.
<Behavior> produces <Output>.
<Behavior> succeeds/fails with <Outcome>.
<Behavior> navigates to <Screen>.
<Behavior> emits <Event>.
```

Renderers may combine several claims into natural prose, but the combined sentence must remain traceable to the individual Claim IDs.

## Lens vocabulary

The kernel remains constant while each lens uses familiar words.

| Kernel role | API | UI | Worker | CLI | Data | Service | Library |
|---|---|---|---|---|---|---|---|
| Interface | endpoint | screen/control | queue/schedule | command | repository/query surface | port/process interface | public function/type |
| Trigger | request | user action | event/job/schedule | invocation | operation | startup/request/event | function invocation |
| Input | request/path/body | form/selection | payload | argument/stdin | query/value | config/request | parameter/options |
| Condition | authorization/dependency | availability/validation | prerequisite | validation/config | constraint | health/config | precondition |
| Resource | database/service | UI state/data | artifact/store | file/service | entity/contract | dependency/process | value/context |
| Output | response | feedback/screen | artifact/event | stdout/file | record | response/artifact | returned value |
| Outcome | status/failure | success/error/navigation | completed/failed | exit result | committed/rejected | healthy/degraded/stopped | returned sentinel/thrown error |

Framework terms may appear in evidence details, never as required kernel vocabulary.

### Application logic

API, UI, Worker, and CLI Elements are entry points. They do not by themselves describe all meaningful application logic.

The Application lens represents internal Behaviors with stable system-level meaning: a use case, workflow, reusable operation, decision, orchestration, or state-changing operation. An Interface Behavior may `invoke` one or more Application Behaviors.

Varai does not promote every function, class, helper, or call-graph node. Internal code becomes an Application Behavior only when deterministic evidence supports a meaningful boundary that a user can reason about independently.

### Provisional AI lens

AI-oriented systems fit the kernel without new relationships. Model, Prompt, Context, Memory, Tool, Guardrail, Agent, and Evaluation are candidate lens-specific Element kinds. Existing relationships describe their wiring and effects.

Static analysis may support claims about configured models/providers, prompt and context sources, available tools and permissions, memory stores, invocations, guardrails, fallbacks, and evaluations. It does not establish model correctness, instruction following, deterministic output, successful tool execution, or reliable termination.

The AI lens remains provisional until validated against a direct LLM or agent application. Its vocabulary is not part of the kernel.

## Worked translations

### API

Observed code concepts:

```text
FastAPI route, path parameter, dependency, response_model, HTTPException
```

Canonical claims:

```text
API exposes GET /projects/{slug}/current-job.
GET Current Job accepts project slug.
GET Current Job requires the authenticated project owner.
GET Current Job produces CurrentJobResponse.
GET Current Job fails with project-not-found or job-not-found outcomes.
```

The kernel contains no FastAPI relationship.

### UI

Observed code concepts:

```text
CreateProjectModal, onClick={onClose}, disabled={loading}
```

Canonical claims:

```text
Create Project modal offers Dismiss.
Dismiss is triggered by a user click.
Dismiss is available when loading is false.
```

The direct JSX wiring and condition can be observed. “Dismissal is restored after failure” remains unverified until state-flow analysis proves the failure transition.

The same claims apply to native mobile, web, desktop, and terminal interfaces. Platform is a qualifier, not a separate kernel or relationship vocabulary.

### Worker

Observed code concepts:

```text
registered queue handler, payload schema, file write, status update
```

Canonical claims:

```text
Worker exposes Generate Preview job.
Generate Preview is triggered by a queued event.
Generate Preview accepts RenderJobPayload.
Generate Preview reads BuildingModel.
Generate Preview produces PreviewImage.
Generate Preview changes JobStatus.
Generate Preview fails with RenderFailed.
```

### CLI

Observed code concepts:

```text
registered export command, options, file output, exit code
```

Canonical claims:

```text
CLI exposes Export command.
Export is triggered by command invocation.
Export accepts format and destination arguments.
Export reads ProjectModel.
Export produces an export file.
Export fails with a non-zero exit outcome.
```

### Data

Observed code concepts:

```text
Project model, slug field, current job reference, database mapping
```

Canonical claims:

```text
Data contains Project entity.
Project has field slug.
Project relates to Job.
Project is stored in the database.
```

A declarative transformation may be represented as a Behavior that `reads` upstream datasets and `produces` a dataset. A renderer may summarize that pair as “derived from” without adding a separate kernel relationship. Data validation may likewise be represented as a check Behavior that reads a dataset and `fails_with` a violated invariant.

### Library

Observed code concepts:

```text
exported function, typed parameters, returned value, thrown error
```

Canonical claims:

```text
Library exposes Add Days.
Add Days accepts a date and number of days.
Add Days produces a new date.
Parse ISO accepts an ISO string.
Parse ISO produces a date or Invalid Date outcome.
```

Varai may say a function does not change its input only when effect coverage is complete or authoritative documentation supplies that claim. A return type or locally constructed result alone does not prove purity.

### Application

Observed code concepts:

```text
use-case function, workflow coordinator, decision service, state transition
```

Canonical claims:

```text
Create Project action invokes Create Project workflow.
Create Project workflow accepts project details.
Create Project workflow creates Project.
Create Project workflow invokes Generate Initial Plan.
Create Project workflow produces ProjectSummary.
```

The workflow is promoted because it is a meaningful operation with a stable boundary. Its private validation and persistence helpers remain evidence, not separate system Behaviors.

### Cross-subsystem path

Individual claims can form a system path without inventing a single high-level story:

```text
Create Project action invokes POST /projects.
POST /projects accepts CreateProjectRequest.
POST /projects creates Project.
POST /projects produces ProjectResponse.
Create Project action navigates to Project Editor.
```

The UI-to-API link is emitted only when deterministic resolution connects the call and operation. Otherwise both behaviors remain independently visible.

## Semantic progression

Diff is an operation over two instances of this language.

Varai reports:

- Element added or removed;
- Claim added or removed;
- Claim qualifier changed;
- Claim state changed;
- evidence moved;
- coverage changed;
- ambiguous identity or possible move.

Examples:

```text
Changed: GET Current Job
  + produces CurrentJobResponse

Changed: Create Project dismissal
  + available when loading is false
```

Diff introduces no new semantic primitives.

Claim identity preserves the conceptual source–relationship–target statement. Requiredness, medium, status, cardinality, and other qualifiers are compared as semantic properties, so they can change without removing and recreating the surrounding Element. Evidence is compared separately.

## Optional English interpretation

An LLM may translate selected Elements and Claims into concise prose only after Varai has built the deterministic model.

The interpreter:

- receives model data, not arbitrary source as its authority;
- cites every supporting Element/Claim ID;
- may combine or simplify claims but not add new ones;
- cannot claim intent, causality, correctness, completeness, or unchanged behavior beyond supplied coverage;
- is optional and clearly distinguished from deterministic output.

Removing the interpreter must change readability only, never model contents or findings.

## Explicit non-claims

Without additional evidence, Varai does not claim:

- why a feature exists;
- whether behavior matches product intent;
- whether code is correct, secure, performant, or tested;
- whether an unobserved effect is absent;
- whether a UI state transition occurs on every runtime path;
- whether similarly named elements are the same domain concept;
- whether generated code reflects the user's prompt.
- whether a function is pure or leaves its input unchanged without complete effect coverage or authoritative evidence.

These may later come from runtime evidence, checks, tests, or intent reconciliation, each as a separate claim source.

## Language-change rule

A proposed primitive or relationship must include:

1. a user question the existing language cannot answer;
2. at least two examples from different subsystem or framework contexts;
3. a deterministic evidence strategy or an explicit unverified state;
4. identity and diff behavior;
5. lens-specific rendering;
6. an explanation of why qualifiers or an existing relationship are insufficient.

Kalakar may supply one example, never the only example.

## Validation suite for v0

Before implementing a System Model IR, manually encode these scenarios using only this language:

1. API response contract changes.
2. UI action availability changes.
3. API authorization is added or removed.
4. A form begins navigating to a different screen.
5. A worker begins producing a new artifact.
6. A CLI command gains a required argument.
7. A data entity gains a field or relationship.
8. A behavior changes from read-only to state-changing.
9. A cross-file move changes evidence but not meaning.
10. An edited construct is outside analyzer coverage.

The language passes when each scenario can be stated naturally, diffed structurally, evidence-cited, and rendered in its subsystem vocabulary without introducing framework-specific kernel terms.

## Success criterion

Given a supported repository, a user can inspect the System and say:

> I understand its major parts, what I can do through them, what goes in and comes out, what state they affect, how they connect, and what Varai could not determine—without reading the implementation.

That understanding, not the number of extracted facts, is the measure of Varai's model.
