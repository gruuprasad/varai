# Varai Semantic Language v0 Validation

Status: Passed with two clarifications  
Date: 2026-07-18  
Normative source: `docs/semantic-language.md`

## Method

Each scenario is expressed as:

- the user-level question;
- canonical claims before and after;
- evidence and coverage requirements;
- deterministic current-system and diff language;
- a portability check using a second implementation style where useful.

Application and framework terms may appear in recovered names and evidence. They may not become kernel relationships.

## 1. API response contract changes

Question: What does this API operation return now?

Before:

```text
API exposes GET Current Job.
GET Current Job accepts project slug.
```

After:

```text
GET Current Job produces CurrentJobResponse.
```

Evidence: operation boundary plus response-contract declaration. Cross-file schema definition may supply supporting evidence.

Coverage: `api.operation` and `api.output` analyzed; return-body conformance may remain partial.

Diff:

```text
Changed: GET Current Job
  + produces CurrentJobResponse
```

Portability: FastAPI `response_model`, Express/OpenAPI response schema, and a typed controller return annotation all produce the same `produces` relationship.

Verdict: language sufficient.

## 2. UI action availability changes

Question: When can the user perform this action?

Before:

```text
Create Project modal offers Dismiss.
Dismiss is triggered by a user click.
```

After:

```text
Dismiss is available when loading is false.
```

Evidence: controls invoke the dismissal action and carry the loading condition. Multiple controls merge as evidence for one Claim.

Coverage: `ui.action` and direct `ui.availability` analyzed; async state transitions partial.

Diff:

```text
Changed: Create Project dismissal
  + available when loading is false
```

Portability: React `disabled={loading}` and Vue `:disabled="loading"` express the same relationship.

Verdict: language sufficient. “Restored after failure” remains outside available coverage.

## 3. API authorization is added or removed

Question: Who or what is required to invoke this operation?

Before:

```text
DELETE Project accepts project ID.
```

After:

```text
DELETE Project requires authenticated project owner.
```

Evidence: authorization dependency/middleware and its resolved role where deterministically recoverable.

Coverage: boundary-local middleware analyzed; dynamically installed/global middleware may be partial.

Diff:

```text
Changed: DELETE Project
  + requires authenticated project owner
```

Portability: FastAPI dependency and Express route middleware both emit `requires`. If only a symbol such as `requireOwner` is recoverable, Varai uses that name rather than inventing a role.

Verdict: language sufficient.

## 4. A form navigates to a different screen

Question: Where does this user action lead?

Before:

```text
Create Project navigates to Project Details.
```

After:

```text
Create Project navigates to Project Editor.
```

Evidence: navigation call reachable within supported local action flow.

Coverage: direct navigation analyzed; conditional/indirect navigation may be partial.

Diff:

```text
Changed: Create Project
  - navigates to Project Details
  + navigates to Project Editor
```

Portability: React Router `navigate` and Vue Router `push` emit `navigates_to`.

Verdict: language sufficient.

## 5. A worker produces a new artifact

Question: What work runs outside the request and what does it create?

Before:

```text
Worker exposes Generate Preview job.
Generate Preview is triggered by PreviewRequested.
Generate Preview reads BuildingModel.
```

After:

```text
Generate Preview produces PreviewImage.
```

Evidence: registered worker boundary plus artifact return/write or emission.

Coverage: worker registration and direct artifact effects analyzed; external worker internals may be partial.

Diff:

```text
Changed: Generate Preview
  + produces PreviewImage
```

Portability: Celery task and BullMQ processor emit the same Worker element and relationships.

Verdict: language sufficient.

## 6. A CLI command gains a required argument

Question: What must the user provide to run this command?

Before:

```text
Export accepts format argument (optional).
```

After:

```text
Export accepts format argument (required).
```

Evidence: command registration/signature and argument requiredness.

Coverage: declared command arguments analyzed; runtime parsing outside known registrations may be partial.

Diff:

```text
Changed: Export
  ~ format argument became required
```

Portability: Typer parameter declaration and Commander required option emit `accepts` with the same requiredness qualifier.

Verdict: relationship vocabulary sufficient, but progression must explicitly support qualifier changes. The normative spec is amended below.

## 7. A data entity gains a field or relationship

Question: What information and connections make up this entity?

Before:

```text
Data contains Project entity.
Project has field slug.
```

After:

```text
Project has field current_job_id.
Project relates to Job.
```

Evidence: model/schema field plus foreign-key/reference declaration. A name alone does not prove the relationship.

Coverage: declared entity fields analyzed; dynamically added fields or implicit database constraints may be partial.

Diff:

```text
Changed: Project
  + field current_job_id
  + relates to Job
```

Portability: SQLAlchemy model and Prisma schema emit `has_field` and `relates_to`.

Verdict: language sufficient.

## 8. A behavior changes from read-only to state-changing

Question: Did this behavior begin changing system state?

Before:

```text
Calculate Quantities reads BuildingModel.
```

After:

```text
Calculate Quantities changes QuantityCache.
```

Evidence: resolved read/effect operations, including supported helper traversal.

Coverage: effect analysis must be complete before rendering the derived phrase “reads only.”

Diff:

```text
Changed: Calculate Quantities
  + changes QuantityCache
```

If calls remain unresolved, Varai instead says:

```text
No state change was observed; effect analysis is partial.
```

Verdict: language and honesty rule sufficient.

## 9. Code moves without changing meaning

Question: Did system behavior change, or did its implementation only move?

Before and after canonical claims:

```text
GET Current Job produces CurrentJobResponse.
```

Only evidence changes from one file/symbol location to another.

Coverage: identity analyzer resolves the same externally meaningful operation boundary.

Diff:

```text
No semantic change within analyzed coverage.
1 evidence location moved.
```

Verdict: language sufficient. This exposes an implementation requirement: source file paths cannot be mandatory semantic identity when a stronger boundary exists.

## 10. Edited code is outside analyzer coverage

Question: Does “no semantic change” mean nothing changed, or that Varai could not understand it?

Scenario: a UI action uses a higher-order callback and a compound state expression unsupported by the current analyzer.

Claims: no new semantic Claim is emitted.

Coverage:

```text
UI action discovery: analyzed.
UI availability conditions: partial.
Higher-order callback flow: unsupported.
```

Diff:

```text
No modeled semantic change.
Coverage warning: this change touched unsupported higher-order UI behavior.
```

Verdict: language sufficient. Coverage must be a first-class model output, not only an analyzer-crash diagnostic.

## Unrelated project exercise: Newsletter system

This synthetic project deliberately avoids Kalakar’s domain and combines all initial lenses.

### System structure

```text
Newsletter System contains UI.
Newsletter System contains API.
Newsletter System contains Worker.
Newsletter System contains CLI.
Newsletter System contains Data.
Newsletter System contains Mail Service.
```

### UI

```text
UI contains Subscribe screen.
Subscribe screen offers Submit Subscription.
Submit Subscription is triggered by a user action.
Submit Subscription accepts email address.
Submit Subscription is available when email is valid.
Submit Subscription invokes POST /subscriptions.
Submit Subscription succeeds with confirmation feedback.
```

### API and Data

```text
API exposes POST /subscriptions.
POST /subscriptions accepts SubscriptionRequest.
POST /subscriptions creates Subscriber.
POST /subscriptions emits SubscriberCreated.
POST /subscriptions fails with duplicate-email outcome.

Data contains Subscriber entity.
Subscriber has field email.
Subscriber has field status.
Subscriber is stored in database.
```

### Worker and Service

```text
Worker exposes Send Welcome Email job.
Send Welcome Email is triggered by SubscriberCreated.
Send Welcome Email reads Subscriber.
Send Welcome Email invokes Mail Service.
Send Welcome Email changes Subscriber status.
Send Welcome Email fails with DeliveryFailed.
```

### CLI

```text
CLI exposes Import Subscribers command.
Import Subscribers accepts CSV file argument.
Import Subscribers creates Subscriber records.
Import Subscribers produces import summary.
Import Subscribers fails with invalid-row outcome.
```

### Exercise verdict

- All system parts fit existing primitives.
- Cross-subsystem paths use `invokes` and `emits`; no story-specific relation is needed.
- Service dependency is expressed by a Behavior invoking the Service, not by inventing a static framework dependency.
- “confirmation feedback” is an observed outcome only when rendered UI state proves it.
- No newsletter-domain term enters the kernel.

## Clarifications discovered

### 1. Qualifier changes are semantic changes

Requiredness, storage medium, status, cardinality, and similar qualifiers can change while source, relationship, and target remain stable. Progression therefore includes **Claim qualifier changed**.

Claim identity should preserve the conceptual relationship while canonical comparison detects qualifier changes. Evidence remains excluded from both semantic identity and qualifier comparison.

### 2. Interface is a role, not a required extra object

An API operation or CLI command can be both Interface and Behavior. A UI screen can expose separate action Behaviors. Adapters should not manufacture redundant Interface elements merely to satisfy a rigid hierarchy.

The required structure is therefore:

```text
Subsystem contains Elements.
An Element may expose/offer another Element.
A Behavior is an Element with behavioral relationships.
Interface and Resource are roles Elements can play.
```

## Validation result

The v0 language passes the design gate with the two clarifications above.

No new primitive or relationship was required across the ten scenarios or the unrelated project. The next design step may define the System Model IR, provided it encodes this language and includes qualifier-change and flexible-role tests from the start.
