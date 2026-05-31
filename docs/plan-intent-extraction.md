# Plan: Semantic Intent Extraction

Status: Tier A implemented; Tier B not started  
Prerequisites: fixes #2 and #3 — **done**  
Canonical context: [spec.md](spec.md)

## Problem

Varai's first pipeline stage is the weakest link. `extractRequirements()` in `intent.js` splits intent on newlines, strips bullets, and treats each non-empty line as one requirement.

That works for hand-written golden scenarios. It fails on real input:

- **Preamble and fragments** become requirements ("ok so i want to build a task app...", "flip it on the client...")
- **Multi-sentence lines** bundle unrelated intent into one requirement
- **Prose never reaches capability profiles** when vocabulary doesn't substring-match (`notified` vs `notify`)
- **Manual `intent.md` is an adoption tax** — the richest intent source is already the chat/prompt history with the coding agent

When extraction is wrong, every downstream layer inherits the error. Check packs and evidence matching cannot fix bad requirements.

## Goal

Turn messy builder intent into a small set of **atomic, auditable requirements** — one intent unit per requirement — without requiring a maintained `intent.md` file.

Success looks like:

```text
Messy paste or chat excerpt
  -> 4–8 clean requirements
  -> same findings quality as today's golden bullet intents
```

## Non-Goals (this plan)

- Replacing the deterministic matcher with an LLM at runtime
- Full transcript ingestion in v1 (start with pasted excerpts)
- Perfect NLP for all languages

## Recommended Approach: Two-Tier Extraction

### Tier A — Deterministic normalizer (default, always on)

No dependencies. Runs locally on every audit.

**Input:** raw text (file, stdin, or pasted block)  
**Output:** `{ requirements: [{ id, text, keywords, source? }] }`

Steps:

1. **Source detection** — accept markdown bullets, numbered lists, or plain prose paragraphs
2. **Segmentation** — split prose into candidate units using:
   - explicit list markers (`-`, `*`, `1.`)
   - sentence boundaries (`.`, `;`, em-dash) when no list structure
   - discourse cues (`also`, `oh and`, `eventually`, `but first`) as soft segment hints
3. **Filtering** — drop units that are clearly not requirements:
   - too short (< ~20 chars after trim)
   - preamble-only ("ok so", "i want to build", "keep it simple")
   - pure implementation notes with no user-facing outcome ("use next-auth is fine")
4. **Normalization** — rewrite each unit to a requirement-shaped sentence where possible:
   - lead with actor + capability ("Users can...", "Admins can...", "The system should...")
   - strip filler ("oh and", "for now", "maybe later") into optional metadata, not the requirement text
5. **Keyword extraction** — keep existing `keywordsFor()` but run on normalized text; add light stemming for activation (`notified` -> `notif`)

Tier A alone should fix most golden-vs-messy regression without any model.

### Tier B — Optional LLM extractor (explicit flag, off by default)

`varai audit --intent ./paste.md --extract llm` or env `VARAI_EXTRACT=llm`

**Role:** propose structured requirements from messy prose. **Not** runtime matching.

Contract:

- Input: raw intent text
- Output: JSON array of `{ text, keywords?, confidence? }`
- Must be inspectable (`--json` shows extracted requirements before match)
- Fail closed: if LLM unavailable or output invalid, fall back to Tier A

Hard rules (prompt + validation):

- Do not invent requirements not grounded in the source text
- One capability per requirement when possible
- Return fewer requirements rather than noisy fragments
- Reject outputs that fail schema validation

Tier B is for adoption (chat paste → clean requirements), not for oracle claims. Findings still come only from deterministic facts + check packs.

## Intent Sources (phased)

| Phase | Source | How |
|-------|--------|-----|
| 1 | `--intent file.md` | Tier A normalizer on file contents |
| 2 | `--intent -` / stdin | Paste at audit time; no file to maintain |
| 3 | `--intent ./session.md` | Export last N messages from agent to a file (user or hook) |
| 4 | MCP / agent hook | Agent calls `varai audit` between passes with transcript slice |

Phase 1–2 deliver most of the value. Phase 4 is distribution, not a different extractor.

## Integration With Existing Pipeline

```text
Raw intent text
  -> extractRequirements()     [Tier A, optional Tier B]
  -> requirements[]

requirements + scan.facts
  -> evaluateCapabilityRequirement()   [unchanged contract]
  -> matchByKeywords()                 [after #2 fix: conservative]
  -> findings

findings
  -> report + Next Prompt              [unchanged]
```

No change to fact model, finding shape, or report contract. Extraction is a drop-in replacement inside `intent.js`.

## Prerequisites (fixes #2 and #3)

Before or in parallel with Tier A, ship matcher hardening so extraction improvements are not undermined:

### #2 Keyword fallback bias

When no capability profile matches, keyword overlap must **not** emit `partial` unless overlap hits capability-relevant facts (e.g. `code_hint`, matching component/route/model names tied to requirement keywords). Incidental overlap on generic facts (`Task`, `/tasks`) → `unverified`.

### #3 Capability collision

Replace first-match-wins in `evaluateCapabilityRequirement()` with scoring across all matching capabilities + profiles. Prefer:

- more specific term hits (admin + approve > auth alone)
- profile specificity (webhook_confirmation > billing)
- requirement keyword overlap with capability domain

Document chosen capability when multiple could apply; never silently assign wrong profile.

## Testing Strategy

### Golden scenarios (unchanged)

Existing `examples/golden/*/intent.md` bullet intents must keep passing.

### Messy-intent fixtures (new)

Add `examples/messy/` or extend golden with `intent-messy.md` per scenario:

- `todo-partial/intent-messy.md` — prose paste version of the same intent
- Expected findings: **same statuses and missing links** as clean intent (within tolerance for extra dropped preamble lines)

### Unit tests for extraction

- splits multi-sentence prose into atomic requirements
- drops preamble fragments
- normalizes "get notified when..." → activates notifications profile
- "admin approves signups" → admin profile, not auth

### Regression tests for matcher (#2, #3)

- notification requirement + task-only facts → `unverified`, not `partial`
- admin-approve line → `admin` profile, not `auth`

## Acceptance Criteria

Tier A is done when:

- [x] Messy prose intent for `todo-partial` produces ≥4 meaningful requirements (preamble dropped)
- [x] R4-equivalent ("get notified...") activates notifications capability and returns `unverified` on todo-partial app
- [x] R5-equivalent ("admin approves signups") uses admin profile
- [x] Golden scenarios still pass with clean `intent.md`
- [x] `npm test` includes messy-intent fixture(s)

Tier B is done when:

- [ ] `--extract llm` flag documented and off by default
- [ ] Invalid/unavailable LLM falls back to Tier A with stderr notice
- [ ] Extracted JSON visible in `--json` output

## LLM-as-pack-author (related, separate track)

Do not conflate with intent extraction. Same principle applies:

- LLM **proposes** declarative check packs + golden scenario
- Deterministic engine **runs** them
- Human or CI **accepts** only if golden test passes

Intent extraction Tier B and pack authoring share "LLM proposes, engine proves" — different outputs, same trust boundary.

## Suggested Implementation Order

1. **#2 + #3** — matcher hardening (small, test-backed, restores oracle)
2. **Tier A segmentation + filtering** — `intent.js` refactor, messy fixtures
3. **Tier A normalization + stem-aware keywords** — activation fixes for `notified`, etc.
4. **stdin / paste path** — `--intent -` for no-file workflow
5. **Tier B** — optional LLM extract behind flag
6. **Agent hook / MCP** — call site, not new logic

## Open Questions

- **Requirement merging:** if Tier A over-splits, should adjacent units with same capability merge? Start without merging; add if fixtures show over-splitting.
- **Evolving intent:** one paste = one snapshot. Intent ledger (roadmap Phase 2) accumulates snapshots; extraction plan does not replace ledger, it feeds it.
- **Confidence field:** Tier B may attach `confidence: low` for borderline units; report could skip or flag them. Defer until Tier A baseline is stable.

## One-Line Summary

Replace line-splitting with a deterministic intent normalizer (and optional LLM propose step), so Varai reads how builders actually talk — while every audit claim stays evidence-backed.
