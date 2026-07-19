# Varai

Varai translates a codebase into a local, evidence-backed System Model so builders can reason about AI-written software above the code level.

```text
repository -> analyzers -> System Model -> map and semantic progression
```

The model describes system elements—API operations, UI screens and actions, data contracts, commands, and services—and atomic claims about what they accept, produce, require, read, or change. Every claim points to source evidence and carries analyzer coverage.

## Install

```bash
npm install -g .
```

## Usage

```bash
varai map                           # current system view
varai map ../kalakar                # another repository
varai snapshot ../kalakar           # create a Git-bound checkpoint
varai diff ../kalakar               # compare checkpoint with current code
varai start ../kalakar              # live dashboard
```

Limit a scan when needed:

```bash
varai map ../kalakar --include services/backend --include services/frontend/src
```

Example model language:

```text
## API

### GET /projects/{slug}/current-job
- GET /projects/{slug}/current-job produces CurrentJobResponse. — services/backend/routes/projects.py:42
- GET /projects/{slug}/current-job requires current_user. — services/backend/routes/projects.py:40

## UI

### CreateProjectModal Cancel
- CreateProjectModal Cancel is available when not isCreating. — services/frontend/src/components/CreateProjectModal.tsx:71
```

## Current analyzer coverage

- FastAPI operations and selected request/response, requirement, effect, and failure shapes.
- React/Vite screens, components, direct UI actions, and simple availability guards.
- SQLAlchemy entities and Pydantic contracts.
- npm/Python/Make commands and Docker/Compose services.

Coverage is intentionally explicit and partial. Unsupported syntax is not treated as proof that behavior is absent.

## Development

```bash
npm test
```

Product direction: [docs/roadmap.md](docs/roadmap.md). Normative language: [docs/semantic-language.md](docs/semantic-language.md).
