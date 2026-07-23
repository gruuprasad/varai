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
    throw new Error("This spec is not approved yet; approve it before creating a build packet.");
  }
  const contentHash = seedContentHash(seed);
  if (seed.ratification.contentHash !== contentHash) {
    throw new Error("The spec changed since it was approved; approve it again before creating a build packet.");
  }

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
  }
  lines.push("");
  lines.push("## Requirements");
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
  lines.push("1. A runnable application with tests covering the requirements, in ordinary Git history.");
  lines.push("2. A `varai.realization.json` file at the repository root linking every thing the spec");
  lines.push("   names to the artifact you created for it. Link by stable public boundaries (route keys,");
  lines.push("   contract/model names); use source file + symbol only as a fallback. Source lines");
  lines.push("   alone are not accepted as identity.");
  lines.push("3. Per requirement, name which link realizes its source.");
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
