import { seedContentHash } from "./identity.js";
import { RECORDED_ONLY_RELATIONS, SEED_RELATIONS } from "./schema.js";

// Vendor-neutral build packet (ADR 0005): a plain Markdown document the user
// pastes into any coding agent. It carries only ratified seed content — never
// unratified drafts — and it is deterministic for a given seed.

const WITNESS_EXAMPLE = `{
  "formatVersion": 1,
  "seedHash": "<the ratified seed hash above>",
  "bindings": [
    {
      "id": "binding.<name>",
      "concept": "<seed concept id>",
      "artifact": { "lens": "<api|ui|data|...>", "kind": "<element kind>", "key": "<stable public key>" }
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

export function renderBuildPacket({ seed, brief } = {}) {
  if (seed?.ratification?.status !== "ratified") {
    throw new Error("Refusing to render a build packet from an unratified seed; ratify first.");
  }
  const contentHash = seedContentHash(seed);
  if (seed.ratification.contentHash !== contentHash) {
    throw new Error("Seed ratification hash does not match the semantic content; re-ratify before handoff.");
  }

  const lines = [];
  lines.push(`# Build packet — ${seed.system.name}`);
  lines.push("");
  lines.push("You are implementing a software system from a human-ratified seed.");
  lines.push("The seed is the durable intent. Build the simplest complete application that");
  lines.push("makes every commitment below true and verifiable from the code itself.");
  lines.push("");
  lines.push("## Ratified seed hash");
  lines.push("");
  lines.push(`\`${contentHash}\``);
  lines.push("");
  if (seed.context?.length) {
    lines.push("## Human context (not machine-checkable)");
    lines.push("");
    for (const entry of [...seed.context].sort((a, b) => a.id.localeCompare(b.id))) {
      lines.push(`- ${entry.text}`);
    }
    lines.push("");
  }
  lines.push("## Concepts");
  lines.push("");
  for (const concept of [...seed.concepts].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`- \`${concept.id}\` (${concept.role}): ${concept.name}${concept.summary ? ` — ${concept.summary}` : ""}`);
  }
  lines.push("");
  lines.push("## Commitments");
  lines.push("");
  for (const commitment of [...seed.commitments].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`- \`${commitment.id}\`: \`${commitment.source}\` **${commitment.relation}** \`${formatTarget(commitment.target)}\`${commitment.note ? ` — ${commitment.note}` : ""}`);
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
  lines.push("1. A runnable application with tests covering the commitments, in ordinary Git history.");
  lines.push("2. A `varai.realization.json` file at the repository root binding every seed concept");
  lines.push("   to the artifact you created for it. Bind by stable public boundaries (route keys,");
  lines.push("   contract/model names); use source file + symbol only as a fallback. Source lines");
  lines.push("   alone are not accepted as identity.");
  lines.push("3. Claim witnesses naming, per commitment, which binding realizes its source concept.");
  lines.push("");
  lines.push("## Realization witness schema");
  lines.push("");
  lines.push("```json");
  lines.push(WITNESS_EXAMPLE);
  lines.push("```");
  lines.push("");
  lines.push("## Verification warning");
  lines.push("");
  lines.push("Varai independently scans the repository and checks every commitment against its own");
  lines.push("observed model. The witness is testimony that guides where to look; it is never trusted");
  lines.push("as a verdict. Commitments with wrong, missing, or stale bindings report as unverified.");
  return `${lines.join("\n")}\n`;
}
