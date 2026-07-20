# Semantic Assembly Acceptance Corpus: Seven Kalakar Paths

**Date:** 2026-07-19  
**Status:** Discovery fixture for the next model increment  
**Depends on:** `docs/semantic-language.md`, `2026-07-19-anchor-based-lift-design.md`, ADR 0004

## Purpose

The anchor lift recovered useful subjects, but the current model still presents routes, UI
handlers, contracts, and individual claims as the primary reading units. This corpus defines
the next target without adding speculative vocabulary.

The proposed missing stage is **semantic assembly**:

```text
observed claims
    -> bind representations and roles
    -> recover stable application actions where evidence permits
    -> compose one behavior frame
    -> connect frames into observed system paths
```

A behavior frame and a system path are projections over the existing kernel. They are not new
kernel primitives. Claim identity and semantic diff remain unchanged.

This corpus uses Kalakar at commit `a7d20f40018312afc30434c695eaa700d237277e`, plus the
uncommitted structural-type acknowledgment experiment in:

- `services/frontend/src/components/workspace/structure/StructuralBasisTypesPanel.tsx`
- `services/frontend/src/components/workspace/structure/StructuralBasisTypesPanel.test.tsx`

The source was manually inspected to establish the acceptance target. Product code may emit a
sentence below only after deterministic analyzers recover its supporting links.

## What the live model reveals

The current Kalakar scan contains 1,058 Elements, 4,177 Claims, and 676 Elements carrying a
Behavior role. It also has:

- 314 API operations and 328 UI actions;
- 49 `invokes` claims;
- zero promoted Application Behaviors;
- contracts included in capability `resourceIds`, which makes inputs and responses read as
  things an operation "acts on";
- effects such as `changes file`, `changes row`, and `changes unknown` where the implementation
  contains a resolvable domain effect;
- 23 new `contains` claims in the current diff because containment analysis improved after the
  baseline snapshot.

These are not primarily visual defects. They identify four model defects:

1. **Interface and action are conflated.** An HTTP route is both Interface and Behavior even
   when a stable application operation exists below it.
2. **Semantic roles are conflated.** Subjects, request/response contracts, supporting objects,
   and produced artifacts are all treated as resources in capability presentation.
3. **Connected claims are not assembled.** Trigger, condition, invocation, effect, output, and
   outcome remain separate rows.
4. **Analyzer progression is not isolated from system progression.** A better analyzer can make
   an unchanged repository appear to have gained semantic behavior.

## Behavior-frame contract

A deterministic behavior frame may contain:

| Field | Source |
|---|---|
| Action name | UI label, command name, handler/use-case symbol, or stable boundary name |
| Trigger | `triggered_by` claim |
| Surface | Interface that `offers` or invokes the action |
| Conditions | `requires` and `available_when` claims |
| Inputs | `accepts` claims |
| Primary subjects | Resources reached through effect relations |
| Effects | `reads`, `changes`, `creates`, and `removes` claims |
| Outputs and outcomes | `produces`, `succeeds_with`, `fails_with`, `navigates_to`, `emits` |
| Reach | Interface and `invokes` chain |
| Honesty | claim state, missing-link diagnostics, and capability coverage |
| Evidence | ordered implementation paths, collapsed below the frame by default |

The assembler may omit empty fields. It must not fill them from naming intuition.

## Path rule

Varai may compose a system path only from connected public Claims:

```text
UI Interface -> offered action -> invoked API Interface
             -> invoked Application Behavior -> Resource effect / Outcome
```

An implementation path proves how one Claim was derived. It is not itself a public system path.

A subject lifecycle is stricter. Varai must not infer `created -> edited -> previewed -> rendered`
because several behaviors touch the same subject. It may show ordered stages only when a state
machine, explicit orchestration, or equivalent control-flow evidence proves that order.

## Corpus overview

| Scenario | Strongest current evidence | Dominant missing mechanism |
|---|---|---|
| Create project | API contract and authorization | form action, UI-to-API link, service effects, navigation |
| Apply structural type | UI-to-API link and conditional acknowledgment | preview availability, Building Model effect, response and failure meaning |
| Render building model | UI action and backend read/output claims | exact wrapper binding, artifact effects, application operation |
| Reset password | backend contract and reads | form action, UI conditions, User change, token removal |
| Export plan | backend format operations | callback-prop chain, hook action, produced file identity |
| Draw wall | canvas tool and wall API contract | multi-event gesture, preview-to-commit continuation, topology effects |
| Inspect quantities | quantities surface and read API | view activation, parallel reads, derived result identity |

## 1. Create project

### Target frame

```text
Create project
  Started from: Create New Project form
  Accepts: project name and optional description
  Requires: signed-in user
  Creates: Project and its initial Building Model workspace
  Produces: Project response
  On success: opens the project editor
  Reached through: POST /api/v1/projects
```

### Claims already recovered

| Claim | Evidence |
|---|---|
| API accepts `ProjectCreate` | `services/backend/routes/projects.py:139` |
| API requires the current user | `services/backend/routes/projects.py:140` |
| API produces `ProjectResponse` | `services/backend/routes/projects.py:138` |
| Dismiss is unavailable while loading | `services/frontend/src/components/projects/CreateProjectModal.tsx` |

### Missing links

| Missing link | Deterministic evidence available in source | Required mechanism |
|---|---|---|
| Form submit is a UI Behavior | `handleSubmit` is bound through `<form onSubmit>` at `CreateProjectModal.tsx:28` | Recover form-submit and component-prop event boundaries, not only button clicks |
| UI action invokes the API operation | `handleSubmit -> createProject -> apiRequest("/api/v1/projects")` at `CreateProjectModal.tsx:34` and `api/project.ts:13` | Resolve re-exports and API wrappers through the frontend call graph |
| The operation creates `Project` | `create_project -> create_project_with_ir -> db.add(project)` at `routes/projects.py:146` and `app_services/project_instances.py:182-218` | Resolve service calls and ORM effects to declared entities |
| The operation creates an initial Building Model document | blank document construction at `routes/projects.py:151`, persisted at `project_instances.py:195-196` | Bind produced files/documents to the `BuildingModelDocument` representation |
| Success opens the editor | `navigate(...)` at `CreateProjectModal.tsx:46` | Recover navigation outcomes from resolved UI handlers |

### Stable application boundary

`create_project_with_ir` is independently named, shared by create/import/duplicate paths, and owns
the persistent effects. It is a candidate Application Behavior. The route should remain the API
Interface that reaches it. Promotion must be earned by this structural boundary, not by the phrase
"create project."

## 2. Apply structural type change

### Target frame

```text
Apply structural type change
  Started from: Structural Basis Types panel
  Available after: a change preview exists
  Available when: a job exists and no update is running
  Requires: integrity changes acknowledged when the preview reports integrity changes
  Accepts: updated structural type and preview fingerprint
  Changes: Building Model
  Can fail: invalid type data; required or stale preview
  Reached through: PUT /api/v1/building-model/{job_id}/structural-types/{type_id}
```

### Claims already recovered

| Claim | Evidence |
|---|---|
| Action is triggered by click | `StructuralBasisTypesPanel.tsx:454` |
| Action requires integrity acknowledgment conditionally | `StructuralBasisTypesPanel.tsx:454` |
| Action is unavailable while busy or without a job | `StructuralBasisTypesPanel.tsx:454` |
| Action invokes the exact PUT operation | `api/buildingModel/structure.ts:46` |
| API accepts `UpdateStructuralTypeRequest` | `routes/building_model/structural_types.py:136` |
| API can fail with 400 or 409 | `structural_types.py:139,155` |

### Missing links

| Missing link | Deterministic evidence available in source | Required mechanism |
|---|---|---|
| Apply exists only after preview | JSX selects Preview or Apply from the `preview` state at `StructuralBasisTypesPanel.tsx:454` | Recover branch-controlled interface availability |
| API changes the Building Model, not an anonymous file | `_mutate(... update_structural_type ...)` receives the persisted document at `structural_types.py:142-150` | Bind mutation helpers and persistence writes back to their input aggregate |
| 409 means preview required or stale | explicit error values at `structural_types.py:151-155` | Preserve evidence-backed outcome reasons, not only HTTP status |
| Response is a structural-type mutation result | route `response_model=StructuralTypeMutationResponse` at `structural_types.py:129-132` | Recover the declared response model from the route registration |

### Path boundary

Preview and Apply remain distinct Behaviors. They may be connected because Apply's visibility is
controlled by preview state. They must not be merged into one vague "manage structural type"
capability.

## 3. Render building model

### Target frame

```text
Render building model
  Started from: Render workspace
  Available when: a job exists and rendering is idle
  Reads: Building Model and project render settings
  Produces: 3D model file and workspace render result
  Creates: Project Artifact when a new render is written
  Can fail: Building Model cannot be loaded for rendering
  Reached through: POST /api/v1/building-model/{job_id}/render
```

### Claims already recovered

| Claim | Evidence |
|---|---|
| UI action is triggered by click | `RenderWorkspaceView.tsx:217,230,242` |
| UI action is unavailable without a job or while rendering | `RenderWorkspaceView.tsx:216,229,241` |
| Backend reads `BuildingModelDocument` | `_common.py:106` through the route implementation path |
| Backend reads `Settings` and `Project` | `render_artifact_descriptor.py:105`, `_routes.py:397` |
| Backend produces `WorkspaceRenderResponse` | `_routes.py:392` |
| Backend can fail with 409 | `_common.py:108` |

### Missing links

| Missing link | Deterministic evidence available in source | Required mechanism |
|---|---|---|
| UI action invokes the exact render operation | `handleRender -> renderBuildingModel -> bmFetch(.../render)` at `RenderWorkspaceView.tsx:171-177` and `artifacts.ts:363-370` | Normalize parameterized wrapper paths and reject unrelated transport details such as `GET content-type` |
| Render produces a GLB file | writer path at `app_services/gltf_writer.py:203` | Model the written file as an Artifact output, not `changes file` |
| Render may create `ProjectArtifact` | `register_building_model_3d_artifact` is conditional on `!cache_hit` at `_routes.py:412-427` | Resolve ORM creation through service calls and retain the cache-miss condition |
| `GLTFWriter` is mechanism, not a primary subject | the writer is reached inside rendering and writes the output | Separate supporting implementation objects from effect subjects using their role in the path |

### Stable application boundary

The route `render_workspace_model` visibly orchestrates loading, descriptor construction, render,
artifact registration, and response construction. Deeper helpers remain implementation unless one
of them is also reached independently from another Interface.

## 4. Reset password

### Target frame

```text
Reset password
  Started from: Reset Password screen
  Available when: a reset token is present
  Requires: matching passwords with at least eight characters
  Accepts: reset token and new password
  Reads: User and Password Reset Token
  Changes: User password
  Removes: Password Reset Token
  Produces: password-reset confirmation
  Can fail: invalid or expired token; user not found
  Reached through: POST /api/auth/reset-password
```

### Claims already recovered

| Claim | Evidence |
|---|---|
| API accepts `ResetPasswordRequest` | `services/backend/routes/auth.py:340` |
| API reads `PasswordResetToken` and `User` | `auth.py:346,360` |
| API produces `ResetPasswordResponse` | `auth.py:339` |
| Reset Password is a navigable screen | `services/frontend/src/App.tsx:41` |

### Missing links

| Missing link | Deterministic evidence available in source | Required mechanism |
|---|---|---|
| Form submission is a UI Behavior and invokes the API | `handleSubmit -> apiRequest("/api/auth/reset-password")` at `ResetPasswordPage.tsx:20-43` | Recover form actions and direct transport calls in page components |
| Token controls availability | the no-token branch replaces the form at `ResetPasswordPage.tsx:52` | Recover branch-controlled screen/action availability |
| Client validation is part of the action contract | match and minimum-length checks at `ResetPasswordPage.tsx:24-31` | Lift explicit guard branches into `requires`/failure outcomes |
| User is changed | `user.password_hash = ...` at `auth.py:364` | Resolve field mutation to the owning `User` entity |
| Token is removed | `db.delete(row)` where `row` resolves from `PasswordResetToken` at `auth.py:345-365` | Track query-result identity through local variables into ORM effects |
| 400 outcomes have distinct meanings | explicit invalid-token and missing-user branches at `auth.py:354-362` | Preserve branch-specific outcome reasons |

## 5. Export plan drawing

### Target frame

```text
Export plan drawing
  Started from: Export menu -> Plan drawing
  Available when: a job and active storey exist
  Accepts: PDF/DXF/DWG format, scale, and format-specific options
  Reads: Building Model and selected Plan Slice
  Produces: downloadable PDF, DXF, or DWG file
  Can fail: projection or option error; DWG converter unavailable
  Reached through: the matching plan export operation
```

### Claims already recovered

| Claim | Evidence |
|---|---|
| PDF/DXF/DWG API operations read `BuildingModelDocument` and `PlanSlice` | `_routes.py:739-872` and their implementation paths |
| API operations return response/file content | `_routes.py:771,835,878` |
| API operations expose 400/404/409, plus 503 for DWG | `_routes.py:739-876` |
| Export menu labels the three output families | `ExportMenu.tsx:32-55` |

### Missing links

| Missing link | Deterministic evidence available in source | Required mechanism |
|---|---|---|
| Menu action reaches the plan export workflow | `ExportMenu.onPlanDrawingExport -> WorkspaceShell.handleOpenPlanDrawingExport -> openExportRequest` at `ExportMenu.tsx:38` and `WorkspaceShell.tsx:93-95` | Trace callback props across component boundaries and state signals |
| Download button reaches one of three API operations | `PlanExportPopover.onDownload -> usePlanExport.download -> downloadPlanPdf/Dxf/Dwg` at `PlanExportPopover.tsx:184-188` and `usePlanExport.ts:54-68` | Trace hook-returned callbacks and branch-selected invocations |
| Job and active storey are availability conditions | guard at `usePlanExport.ts:55` | Lift early-return guards into availability/requirements |
| Output is a typed downloadable artifact | endpoint media type, filename header, and frontend blob download | Bind response construction and download handling to an Artifact output |
| `changes unknown` is a false semantic emphasis for read-only projection work | plan projection helpers allocate/derive intermediate structures | Distinguish mutation of local/intermediate values from persistent or externally observable effects |

## 6. Draw wall on the Plan Canvas

### Target frame

```text
Draw wall
  Started from: Plan Canvas wall tool
  Available when: a job, active storey, model revision, and wall type exist
  Accepts: snapped wall points, wall type, placement, and current model revision
  Previews: room, topology, and integrity consequences
  Requires: consequence confirmation when review is necessary
  Changes: Building Model
  Produces: updated Plan Slice, created wall identities, and topology changes
  Selects: the last created wall
  Can fail: topology resolution required; invalid wall; stale or failed mutation
  Reached through: POST /api/v1/building-model/{job_id}/walls/chain
```

### Deterministic evidence in source

| Observation | Evidence |
|---|---|
| The wall tool accumulates snapped canvas points | `useWallTool.ts:85-119,260-300` |
| Commit requires job, storey, revision, wall type, and enough points | `useWallTool.ts:121-134,194-208` |
| The completed draft is previewed before commit | `useWallTool.ts:210-228` |
| Reviewable consequences suspend commit behind confirmation | `useWallTool.ts:229-244` |
| The committed action invokes the wall-chain API | `useWallTool.ts:135-176`, `api/buildingModel/plan.ts:473-493` |
| The backend mutates and persists `BuildingModelDocument` | `_routes.py:2266-2310` |
| The response identifies created walls and topology changes | `_routes.py:2311-2318` |

### Envelope questions

| Question | Why it matters |
|---|---|
| Can one logical action begin with several canvas events rather than one click? | Tests whether an envelope can assemble a gesture without pretending every pointer event is a separate capability. |
| Does preview remain a prerequisite/branch of commit rather than a second unrelated story? | Tests evidence-backed continuation across stored callback/state. |
| Are the Building Model and created walls primary results while draft state and mutation session remain mechanism? | Tests semantic-role separation on an authoring path. |
| Are topology consequences visible without turning every affected entity into a headline subject? | Tests bounded presentation of fan-out effects. |

## 7. Inspect quantities

### Target frame

```text
Inspect quantities
  Started from: Quantities workspace
  Available when: a job exists
  Reads: Building Model, material catalog, rate book, and costing profile
  Derives: quantity takeoff and priced estimate
  Produces: quantity summary, measured rows, material statement, and readiness/assumptions
  Can fail: Building Model cannot be projected into quantities
  Reached through: GET /api/v1/building-model/{job_id}/quantities
```

### Deterministic evidence in source

| Observation | Evidence |
|---|---|
| Quantities is a selectable workspace view | `ActivityRail.tsx:84-88`, `workspaceViewRegistry.ts:13` |
| Entering the view loads quantities and the material catalog in parallel | `QuantitiesWorkspaceView.tsx:90-108` |
| The frontend reaches the quantities API | `api/buildingModel/artifacts.ts:333-342` |
| The backend loads the Building Model and derives the quantity artifact | `_routes.py:362-369` |
| The response exposes summaries, measured elements, assumptions, and a material statement | `buildingModel.generated.ts:3983-4004` |
| Projection failure is exposed as 409 | `_routes.py:365-369` |

### Envelope questions

| Question | Why it matters |
|---|---|
| Can a surface-opening/load behavior be represented without forcing a button-like trigger? | Tests a read-oriented application surface rather than an explicit command. |
| Can parallel reads remain one coherent inspection envelope? | Tests fan-out that belongs together by entry behavior. |
| Is `BuildingModelDocument` the source subject while quantity takeoff is a derived output? | Tests the difference between a domain subject and a computed representation. |
| Do material catalog, rate book, and costing profile appear as supporting inputs rather than peer headline subjects? | Tests role-correct packaging of a broad read path. |
| Does the envelope avoid reporting local aggregation and table formatting as system effects? | Tests separation of presentation computation from observable behavior. |

## Required mechanisms, ordered by leverage

### A. Role-correct behavior frames

Extend the capability projection so it separates:

- primary subjects, using only resolved effect relations;
- inputs and outputs, using contract relations;
- supporting resources and external dependencies;
- interfaces and triggers;
- outcomes and uncertainty.

This immediately fixes the current "acts on WorkspaceRenderResponse" presentation without any new
analyzer.

### B. Frontend behavioral boundaries

Recover form submissions, callback props, hooks returning actions, conditional rendering, and
navigation. These are framework-specific observations converted to existing kernel Claims.

### C. Cross-boundary invocation resolution

Build on the private implementation graph to resolve re-exports, transport wrappers, route
parameters, and service calls. Emit a public `invokes` Claim only when one target remains. Preserve
ambiguous candidates otherwise.

### D. Application Behavior promotion

When an independently meaningful operation owns orchestration or effects, promote it as an
Application Behavior. The API operation becomes an Interface that offers or invokes it. Do not
promote every handler or helper.

### E. Effect and artifact binding

Resolve ORM query results, entity field mutations, deletes, aggregate persistence, and produced
files. Separate externally observable effects from mutations of temporary/local objects.

### F. System-path projection

Compose connected public Claims into an ordered path. Do not expose the private implementation
graph as the path, and do not infer a lifecycle from shared subjects.

### G. Analyzer-version compatibility

Persist analyzer identity/version with snapshots. When semantic extraction changes incompatibly,
Varai must either re-analyze the baseline with the same analyzer or report that the baseline is not
comparable. It must not label newly recoverable `contains` Claims as repository progression.

## Acceptance criteria

The semantic-assembly increment passes this corpus when:

1. Each scenario renders one concise frame whose sentences map to Claim IDs.
2. The seven frames use the existing semantic vocabulary; no Kalakar-only relation is added.
3. Routes appear as reach, not as the only human-facing action name where a stable application
   boundary is recovered.
4. Request/response contracts never appear under "acts on."
5. A frame with a missing link names the gap locally instead of joining unrelated claims.
6. Implementation paths remain accessible beneath every composed statement.
7. System paths contain only proven `offers`/`invokes`/effect/outcome connections.
8. Analyzer-only changes cannot appear as ordinary semantic progression.

## First implementation slice

Use **Apply structural type change** first. It already has the strongest observed cross-boundary
chain and exercises the complete frame shape:

```text
surface -> action -> API operation -> condition -> input -> effect -> failure
```

Implementation order:

1. Add a role-correct behavior-frame projection over existing Claims.
2. Render this projection in CLI fixtures before changing the dashboard.
3. Bind the PUT mutation from `file` to `BuildingModelDocument`.
4. Recover preview-controlled availability and the response contract.
5. Add a public system-path projection joining the UI action to the API operation and subject.
6. Make the dashboard consume the same frame/path JSON without deriving semantics client-side.

After that vertical slice, use Create Project, Render, Reset Password, Export Plan, Draw Wall, and
Inspect Quantities to widen the resolver rather than adding scenario-specific labels. The last two
deliberately contrast an authoring gesture with a read-only inspection surface.

## Corpus execution: 2026-07-20

Executed against the current Kalakar `main` worktree through System Model analyzer `0.13.0`. The
passes added generalized HTML form, React lifecycle, `useCallback`, uniquely wired callback-prop,
and custom-hook member continuation. Frontend transport classification was also tightened. No
scenario labels or semantic-region logic were added.

| Scenario | Result | Observed envelope | Next evidence mechanism |
|---|---|---|---|
| Apply structural type | Credible / closed | Panel action -> PUT operation -> `BuildingModelDocument`; request, response, availability, 400, and 409 are present | Improve condition wording separately; no structural blocker |
| Create project | Partial | Form submit -> POST projects; `ProjectCreate`, `ProjectResponse`, and persistent subjects are present | Bind the initial Building Model creation, remove generic `db` effect, recover navigation, and distinguish created subjects from supporting ownership/user records |
| Render building model | Partial | Render action -> render operation plus manifest check -> `BuildingModelDocument`; response and failures are present | Bind written GLB as an Artifact and classify the manifest check as part of the same action without flattening its contracts/effects |
| Reset password | Open | Form submit -> reset-password operation; token visibility, request, and response are present | Bind query result `row` to `PasswordResetToken`, recover `User` field mutation and token removal, and lift explicit validation/failure branches |
| Export plan drawing | Partial | Explicit Download DXF -> plan DXF -> `BuildingModelDocument`; response and 400/404/409 are present. The selected literal survives callback, hook, branch, and route-template boundaries | Bind PDF/DXF/DWG files as Artifacts and reduce derived implementation reads beneath the envelope |
| Draw wall | Credible / partial | `Wall on canvas` is isolated from the shared canvas dispatcher by the observed `tool === "wall"` condition, then reaches consequence preview plus wall-chain/closed-shell operations and `BuildingModelDocument` | Reduce unresolved backend fan-out effects and distinguish chain from closed-shell mode without implying that every draft click commits |
| Inspect quantities | Credible / closed | Reactive load -> quantities plus material-catalog operations -> `BuildingModelDocument`; both response contracts and 409 outcomes are present | Distinguish automatic load from manual Refresh in display and reduce derived-plan implementation reads beneath the envelope |

### Findings

1. A behavioral envelope is credible for a conventional UI action once Varai proves its API reach
   and aggregate effect. The Apply case remains the reference.
2. Form submission is a reusable frontend boundary. It recovered both Create Project and Reset
   Password without domain-specific rules.
3. React hook/callback continuation closes the read-oriented Quantities case and recovers the
   explicit DXF export without weakening unique-target rules. Only statically known literal values
   select a branch; unknown values retain all reachable alternatives.
4. Backend effect binding remains independently incomplete for Create Project, Render, and Reset
   Password. A UI-to-API join alone does not make an envelope semantically closed.
5. Region experiments should remain deferred until the corpus contains several credible envelopes
   from mutation, read/inspection, artifact production, and form workflows—not only direct buttons.
6. Literal argument flow, direct callback forwarding, production-over-test wiring, scoped callable
   fallbacks, and uniquely typed ref-backed hook continuation now recover the bounded Wall
   preview-to-commit alternatives. The observed tool condition keeps Wall separate from stair, trim,
   dimension, beam, and slab canvas actions; unresolved backend fan-out keeps it honestly partial.

## Application-operation increment: 2026-07-20

System Model analyzer `0.14.0` adds one framework-neutral lift for aggregate-member operations:

```text
typed aggregate parameter + typed containment + unique operation/result/interface match
    -> Application operation -> contained Resource effect + aggregate effect
```

The neutral acceptance fixture uses `CatalogDocument -> Catalog -> Item`; no Kalakar name appears
in the analyzer. REST paths contribute resource vocabulary only after a stable internal operation
and typed containment exist. Route vocabulary alone does not create an Application operation.

The Kalakar corpus now recovers seven Application operations. The Wall authoring path includes:

```text
Plan Canvas: Wall on canvas
  -> POST /api/v1/building-model/{job_id}/walls/chain
  -> Create Wall Chain
       creates Wall
       changes BuildingModelDocument
```

The wall-chain and closed-shell alternatives are closed paths. Consequence preview remains a
separate partial alternative, as it does not itself establish the authored Wall.

Three generic analyzer gaps were exposed and fixed during corpus execution:

1. A costly earlier branch must not erase already-resolved local bindings when recursive analysis
   reaches its work budget.
2. Test-local declarations are fallback candidates when a production declaration of the same name
   exists; multiple production declarations remain ambiguous.
3. Exact lexical coverage ranks `Wall` above `CompoundWall`, `WallJoin`, and other partial token
   matches when operation, result, and interface evidence agree.
