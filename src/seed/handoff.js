import { seedContentHash } from "./identity.js";
import { diffSeeds } from "./diff.js";
import { RECORDED_ONLY_RELATIONS, SEED_RELATIONS, SURFACE_ACCESS, SURFACE_CHANNELS } from "./schema.js";

// Vendor-neutral build packet (ADR 0005): a plain Markdown document the user
// pastes into any coding agent. It carries only ratified seed content — never
// unratified drafts — and it is deterministic for a given seed.

const WITNESS_EXAMPLE = `{
  "formatVersion": 2,
  "seedHash": "<the ratified seed hash above>",
  "bindings": [
    {
      "id": "binding.<name>",
      "concept": "<seed concept id>",
      "artifact": { "lens": "<api|ui|data|...>", "kind": "<element kind>", "key": "<stable public key>" }
    }
  ],
  "surfaceBindings": [
    {
      "id": "surface-binding.<name>",
      "surface": "<seed surface id>",
      "artifact": { "lens": "<api|ui|...>", "kind": "<element kind>", "key": "<stable public key>" }
    }
  ],
  "witnesses": [
    { "commitment": "<seed commitment id>", "sourceBinding": "binding.<name>", "target": { "concept": "<target concept id>" } }
  ]
}`;

function formatTarget(target) {
  if (target?.concept !== undefined) return target.concept;
  return JSON.stringify(target?.literal);
}

function expectationText(commitment) {
  return commitment.expectation === "absent" ? "must not" : commitment.relation;
}

// Shared ratification guard for every handoff projection: only ratified seed
// content with a matching hash may leave the building.
function assertRatifiedSeed(seed) {
  if (seed?.ratification?.status !== "ratified") {
    throw new Error("This spec is not approved yet; approve it before creating a build packet.");
  }
  const contentHash = seedContentHash(seed);
  if (seed.ratification.contentHash !== contentHash) {
    throw new Error("The spec changed since it was approved; approve it again before creating a build packet.");
  }
  return contentHash;
}

function byId(items) {
  return new Map((items ?? []).map((item) => [item.id, item]));
}

// Carry-forward candidates from the latest prior `ready` session. A mapping is
// a candidate only when the Seed ID it references still exists and its relevant
// Seed definition is unchanged — never an assertion that the mapping is still
// valid. The builder must lint candidates against the current System Model.
export function carryForwardCandidates({ baselineSeed, baselineRealization, currentSeed, changes }) {
  const currentConcepts = byId(currentSeed.concepts);
  const currentCommitments = byId(currentSeed.commitments);
  const currentSurfaces = byId(currentSeed.surfaces);
  const removedConcepts = new Set((changes?.concepts?.removed ?? []).map((item) => item.id));
  const changedConcepts = new Set((changes?.concepts?.changed ?? []).map((item) => item.after?.id));
  const removedCommitments = new Set((changes?.commitments?.removed ?? []).map((item) => item.id));
  const changedCommitments = new Set((changes?.commitments?.changed ?? []).map((item) => item.after?.id));
  const removedSurfaces = new Set((changes?.surfaces?.removed ?? []).map((item) => item.id));
  const changedSurfaces = new Set((changes?.surfaces?.changed ?? []).map((item) => item.after?.id));

  const bindings = (baselineRealization?.bindings ?? [])
    .filter((binding) => currentConcepts.has(binding.concept)
      && !removedConcepts.has(binding.concept) && !changedConcepts.has(binding.concept))
    .map((binding) => ({ id: binding.id, concept: binding.concept, artifact: binding.artifact }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const carriedBindingIds = new Set(bindings.map((binding) => binding.id));
  const surfaceBindings = (baselineRealization?.surfaceBindings ?? [])
    .filter((binding) => currentSurfaces.has(binding.surface)
      && !removedSurfaces.has(binding.surface) && !changedSurfaces.has(binding.surface))
    .map((binding) => ({ id: binding.id, surface: binding.surface, artifact: binding.artifact }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const witnesses = (baselineRealization?.witnesses ?? [])
    .filter((witness) => currentCommitments.has(witness.commitment)
      && !removedCommitments.has(witness.commitment) && !changedCommitments.has(witness.commitment)
      && carriedBindingIds.has(witness.sourceBinding))
    .map((witness) => ({ commitment: witness.commitment, sourceBinding: witness.sourceBinding, target: witness.target }))
    .sort((a, b) => `${a.commitment} ${a.sourceBinding}`.localeCompare(`${b.commitment} ${b.sourceBinding}`));

  return { bindings, surfaceBindings, witnesses };
}

export function renderBuildPacketJson({ seed, brief, baseline } = {}) {
  const contentHash = assertRatifiedSeed(seed);
  const packet = renderBuildPacket({ seed, brief });
  if (!baseline) {
    return {
      formatVersion: 1,
      system: seed.system,
      contentHash,
      packet,
      baseline: { present: false, sessionId: null, seedHash: null },
      changes: null,
      carryForwardCandidates: { present: false, bindings: [], surfaceBindings: [], witnesses: [] },
    };
  }
  const changes = diffSeeds(baseline.seed, seed);
  const candidates = carryForwardCandidates({
    baselineSeed: baseline.seed,
    baselineRealization: baseline.realization ?? null,
    currentSeed: seed,
    changes,
  });
  return {
    formatVersion: 1,
    system: seed.system,
    contentHash,
    packet,
    baseline: { present: true, sessionId: baseline.sessionId, seedHash: seedContentHash(baseline.seed) },
    changes,
    carryForwardCandidates: { present: true, ...candidates },
  };
}

export function renderBuildPacket({ seed, brief } = {}) {
  const contentHash = assertRatifiedSeed(seed);

  const lines = [];
  lines.push(`# Build packet — ${seed.system.name}`);
  lines.push("");
  lines.push("You are building a system from an approved spec.");
  lines.push("The spec is the durable intent. Build the simplest complete application that");
  lines.push("makes every requirement below true and verifiable from the code itself.");
  lines.push("");
  lines.push("## Approved spec fingerprint");
  lines.push("");
  lines.push(`\`${contentHash}\``);
  lines.push("");
  if (seed.context?.length) {
    lines.push("## Notes (not machine-checked)");
    lines.push("");
    for (const entry of [...seed.context].sort((a, b) => a.id.localeCompare(b.id))) {
      lines.push(`- ${entry.text}`);
    }
    lines.push("");
  }
  lines.push("## Things");
  lines.push("");
  for (const concept of [...seed.concepts].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`- \`${concept.id}\` (${concept.role}): ${concept.name}${concept.summary ? ` — ${concept.summary}` : ""}`);
    if (concept.stateModel) {
      const transitions = (concept.stateModel.transitions ?? [])
        .map((transition) => `${transition.from} -> ${transition.to} via ${transition.via.join(", ")}`)
        .join("; ");
      lines.push(`  state model: starts ${concept.stateModel.initial}; ${transitions}`);
    }
    if (Array.isArray(concept.fields) && concept.fields.length) {
      const fields = concept.fields
        .map((field) => `${field.name}: ${field.type}${field.required === false ? " (optional)" : ""}`)
        .join(", ");
      lines.push(`  fields: ${fields}`);
    }
  }
  lines.push("");
  if (Array.isArray(seed.surfaces) && seed.surfaces.length) {
    lines.push("## Expected surfaces");
    lines.push("");
    lines.push(`Channels: ${SURFACE_CHANNELS.join(", ")}. Access: ${SURFACE_ACCESS.join(", ")}.`);
    lines.push("Surfaces name no HTTP path, file, symbol, or framework — bind those in surfaceBindings.");
    lines.push("");
    for (const surface of [...seed.surfaces].sort((a, b) => a.id.localeCompare(b.id))) {
      lines.push(`- \`${surface.id}\`: ${surface.name} — \`${surface.behavior}\` via ${surface.channel} (${surface.access})`);
    }
    lines.push("");
  }
  if (Array.isArray(seed.scenarios) && seed.scenarios.length) {
    lines.push("## Product scenarios (examples, not invariants)");
    lines.push("");
    lines.push("Scenarios are bounded sequential examples: principals bound to actor concepts,");
    lines.push("ordered steps that invoke behaviors, scalar/JSON input (including `$capture.path`");
    lines.push("references), exact HTTP status assertions, and optional partial JSON body assertions.");
    lines.push("Do not invent concurrency, temporal windows, performance checks, arbitrary");
    lines.push("expressions, database inspection, or user-supplied test code — those are out of language.");
    lines.push("A passing scenario proves one concrete interaction; it does not prove a universal rule.");
    lines.push("");
    for (const scenario of [...seed.scenarios].sort((a, b) => a.id.localeCompare(b.id))) {
      const principals = (scenario.principals ?? [])
        .map((principal) => `${principal.as}=${principal.actor}`)
        .join(", ");
      const stepCount = Array.isArray(scenario.steps) ? scenario.steps.length : 0;
      lines.push(`- \`${scenario.id}\`: ${scenario.name} — ${stepCount} step(s); principals: ${principals || "(none)"}`);
    }
    lines.push("");
  }
  if (Array.isArray(seed.flows) && seed.flows.length) {
    lines.push("## Flows");
    lines.push("");
    for (const flow of [...seed.flows].sort((a, b) => a.id.localeCompare(b.id))) {
      lines.push(`- \`${flow.id}\`: ${flow.name} — entry \`${flow.entry}\`; members: ${flow.members.join(", ")}`);
    }
    lines.push("");
  }
  lines.push("## Requirements");
  lines.push("## Requirements");
  lines.push("");
  for (const commitment of [...seed.commitments].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`- \`${commitment.id}\`: \`${commitment.source}\` **${expectationText(commitment)}** \`${formatTarget(commitment.target)}\`${commitment.note ? ` — ${commitment.note}` : ""}`);
  }
  lines.push("");
  const checkable = SEED_RELATIONS.filter((relation) => !RECORDED_ONLY_RELATIONS.includes(relation));
  lines.push(`Checkable relations are limited to: ${checkable.join(", ")}.`);
  if (RECORDED_ONLY_RELATIONS.length) {
    lines.push(`Relations recorded as intent (not machine-checked yet): ${RECORDED_ONLY_RELATIONS.join(", ")}.`);
  }
  lines.push("");
  lines.push("## Build preferences");
  lines.push("");
  lines.push(brief?.trim() ? brief.trim() : "No additional preferences were supplied.");
  lines.push("");
  lines.push("## What you must deliver");
  lines.push("");
  lines.push("1. A runnable application with tests covering the requirements, in ordinary Git history.");
  lines.push("2. A `varai.realization.json` file at the repository root linking every thing named by a checkable requirement");
  lines.push("   to the artifact you created for it. Link by stable public boundaries (route keys,");
  lines.push("   contract/model names); use source file + symbol only as a fallback. Source lines");
  lines.push("   alone are not accepted as identity.");
  lines.push("3. For each expected surface, a `surfaceBindings` entry pointing at the exact public artifact");
  lines.push("   that realizes it. Concept bindings and surface bindings are separate; neither is a verdict.");
  lines.push("4. Optional per-requirement source hints only when one thing maps to several artifacts.");
  lines.push("");
  lines.push("## Builder's map (varai.realization.json)");
  lines.push("");
  lines.push("```json");
  lines.push(WITNESS_EXAMPLE);
  lines.push("```");
  lines.push("");
  lines.push("## Verification warning");
  lines.push("");
  lines.push("Varai independently scans the repository and checks every requirement against what it");
  lines.push("observes in the code. The builder's map guides where to look; it is never trusted as a");
  lines.push("verdict. Requirements with wrong, missing, or out-of-date locations report as unverified.");
  return `${lines.join("\n")}\n`;
}
