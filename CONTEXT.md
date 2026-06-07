# Varai Glossary

Canonical terms for the codebase. Implementation details (file paths, function names, schema) live in `docs/spec.md` and source. This file is the *meaning* layer — the shared vocabulary.

---

## Atom

### Fact

A fact is the **smallest deterministic observation** the lens makes about a repository. One fact is one observation, grounded in a specific file. Facts are the atoms of the inventory — they are produced by extractors, merged and deduped by the scanner, optionally enriched with derived attributes, and rendered by the markdown and UI surfaces.

A fact is *not* a verdict, a score, a coverage gap, or a guess. It is "this thing exists in your code, here is where, here is how confidently we know."

A fact carries four properties that are always present, plus a small number of optional extensions (see *Fact extensions* below):

- **Kind** — the technical category of the observation. *What kind of thing is this?* A fact is `kind: "api_route"` or `kind: "db_model"` or `kind: "package"`, and so on. One fact has exactly one kind.
- **Name** — the human-readable identifier of the thing observed. The shape of the name depends on the kind: `POST /api/auth/login` for a route, `User` for a model, `stripe` for a package, `STRIPE_SECRET_KEY` for an env var, `planStore` for a state store. The *thing itself*, not a description of it.
- **Evidence** — the grounding. Always a file (path relative to the repo root), often a line number. The proof that the fact is real and the link back to source. "Every line traces to a real file" is the truth condition of the lens.
- **Layer** — the honesty tag. *How confident can we be in this fact?* One of three values:
    - **`ast`** — a tree-sitter parse tree confirmed the node is real. A parser ruled out comments, strings, and broken formatting. Most trustworthy for syntax-shaped facts.
    - **`heuristic`** — a file-path convention, manifest read, or text scan. Reliable for things like Next.js path-based routes or env-var name regexes, but not parser-verified.
    - **`semantic`** — cross-file resolution. Examples: FastAPI router prefixes resolved by walking `app.include_router(...)` calls.

### Fact extensions

Some kinds carry optional fields beyond the four core properties. Two that exist today:

- **Integration facts** carry a `category` (the kind of external service: `payments`, `email`, `database`, …) and a `signals` object (which packages and env-var names triggered the integration match, with file references).
- **Package facts** carry an `ecosystem` (`"python"` or `"npm"`) so the renderer can group them.

Future extensions will follow the same shape: an optional field on a fact, populated by a derived pass that runs over the merged fact set.

---

## Stock and Custom

The lens has a second, orthogonal axis on top of `kind`: **stock**, the recognizable-pattern axis.

### Stock pattern

A **stock pattern** is a *common, recognizable building block* of typical SaaS and mobile apps — auth, payment, file storage, email, notifications, user management, settings, health endpoints, and the like. A stock pattern is *recoverable from code with high confidence* because the world converged on conventions: a route at `/api/auth/login` plus a `JWT_SECRET` env var plus a `User` model plus a `next-auth` or `passport` package is almost certainly the auth pattern. The lens matches these conventions and tags the matching facts.

A stock pattern is *not* a problem-domain name. The lens never claims "this is the construction domain" or "this is the billing module" — that naming is destroyed at code-generation time and is not recoverable from code alone.

### Stock tag

A **stock tag** is a value attached to a fact indicating which stock pattern it matches. A fact can carry zero, one, or many stock tags. The tag set is a small, curated vocabulary (e.g. `auth`, `payment`, `file_storage`, `email`, `notifications`, `user_mgmt`, `settings`, `health`).

A fact's stock tags are populated by a derived pass over the merged fact set, the same architectural shape used for integration facts.

### Custom

**Custom** is the residual bucket: any fact that does not match a stock pattern's signature. The lens does *not* positively name what a custom fact is — it simply is not in the stock catalog. This is honesty, not a limitation: positive domain naming requires an intent input (a separate concept, deferred to a later phase).

The renderer shows custom facts in a "Custom to this app" section. The reader understands the section as "these are the parts the lens did not recognize as stock" — a real, actionable signal: a fact the user expected to be stock but isn't is usually a path or naming problem that points to a structural choice in the code.

---

## Evidence tiers

A stock-pattern signature can use different **evidence tiers** to decide whether a fact matches. The tier is a guardrail on how much context a signature is allowed to consume before tagging a fact.

- **Self-evidence** — the fact's own kind and name are unambiguous. Example: an env var named `STRIPE_SECRET_KEY` or a package named `stripe` is unmistakably payment-related; no path or context required. The safe floor.
- **Path-evidence** — the fact's own kind, name, *and* the file path from `evidence` are required for ambiguous names. Example: a model named `User` is ambiguous by itself, but a `User` model in `models/auth/user.py` is unambiguous. Required for names that are overloaded across domains.
- **Context-evidence** — the fact plus its path plus nearby facts (same file, same directory, or whole-repo set) are required. Example: a `User` model in a generic `models/user.py` with no path hint, but a `JWT_SECRET` env var and a `POST /api/auth/login` route in the same subtree. Most expensive, most error-prone. **Deferred** — not part of the initial design.

A signature entry declares which tier it requires, and a fact matches only if the signature's required evidence is available.
