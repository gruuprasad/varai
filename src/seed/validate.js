import { seedContentHash } from "./identity.js";
import {
  COMMITMENT_FIELDS, COMMITMENT_ID_PATTERN, CONCEPT_FIELDS, CONCEPT_ID_PATTERN, CONCEPT_ROLES,
  CONTEXT_FIELDS, CONTEXT_ID_PATTERN, RATIFICATION_FIELDS, RATIFICATION_STATES, ROOT_FIELDS,
  COMMITMENT_EXPECTATIONS, SCENARIO_EXPECT_FIELDS, SCENARIO_FIELDS, SCENARIO_ID_PATTERN,
  SCENARIO_PRINCIPAL_AS_PATTERN, SCENARIO_PRINCIPAL_FIELDS, SCENARIO_STEP_FIELDS,
  SCENARIO_STEP_ID_PATTERN, SEED_RELATIONS, SURFACE_ACCESS, SURFACE_CHANNELS, SURFACE_FIELDS,
  SURFACE_ID_PATTERN, SUPPORTED_SEED_FORMAT_VERSIONS, SYSTEM_FIELDS, SYSTEM_ID_PATTERN,
} from "./schema.js";

export class SeedValidationError extends Error {
  constructor(problems) {
    super(`Invalid seed: ${problems.map((problem) => problem.message).join("; ")}`);
    this.name = "SeedValidationError";
    this.problems = problems;
  }
}

function unknownFields(value, allowed, label, problems) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) problems.push({ code: "unknown-field", message: `${label} has unknown field ${key}` });
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateSurfaces(seed, conceptById, seenIds, problems) {
  if (seed.formatVersion < 3) {
    if (seed.surfaces !== undefined) {
      problems.push({ code: "unsupported-field-for-format", message: "Seed surfaces require seed format version 3" });
    }
    return;
  }
  if (!Array.isArray(seed.surfaces)) {
    problems.push({ code: "invalid-collection", message: "Seed surfaces must be an array" });
    return;
  }
  for (const surface of seed.surfaces) {
    if (!isPlainObject(surface)) {
      problems.push({ code: "invalid-entry", message: "Surface entries must be objects" });
      continue;
    }
    unknownFields(surface, SURFACE_FIELDS, `Surface ${surface.id}`, problems);
    if (typeof surface.id !== "string" || !SURFACE_ID_PATTERN.test(surface.id)) {
      problems.push({ code: "invalid-id-format", message: `Surface id ${JSON.stringify(surface.id)} must match ${SURFACE_ID_PATTERN}` });
    } else if (seenIds.has(surface.id)) {
      problems.push({ code: "duplicate-id", message: `Duplicate stable ID: ${surface.id}` });
    }
    if (typeof surface.id === "string") seenIds.add(surface.id);
    if (typeof surface.name !== "string" || !surface.name) {
      problems.push({ code: "invalid-surface", message: `Surface ${surface.id} requires a name` });
    }
    if (!SURFACE_CHANNELS.includes(surface.channel)) {
      problems.push({ code: "unknown-surface-channel", message: `Surface ${surface.id} has unknown channel ${JSON.stringify(surface.channel)}` });
    }
    if (!SURFACE_ACCESS.includes(surface.access)) {
      problems.push({ code: "unknown-surface-access", message: `Surface ${surface.id} has unknown access ${JSON.stringify(surface.access)}` });
    }
    if (typeof surface.behavior !== "string") {
      problems.push({ code: "invalid-surface", message: `Surface ${surface.id} requires a behavior` });
    } else if (!conceptById.has(surface.behavior)) {
      problems.push({ code: "dangling-concept-reference", message: `Surface ${surface.id} behavior ${JSON.stringify(surface.behavior)} is not a declared concept` });
    } else if (conceptById.get(surface.behavior)?.role !== "behavior") {
      problems.push({ code: "invalid-surface-behavior", message: `Surface ${surface.id} behavior ${JSON.stringify(surface.behavior)} must reference a behavior concept` });
    }
  }
}

function validateScenarios(seed, conceptById, seenIds, problems) {
  if (seed.formatVersion < 3) {
    if (seed.scenarios !== undefined) {
      problems.push({ code: "unsupported-field-for-format", message: "Seed scenarios require seed format version 3" });
    }
    return;
  }
  if (!Array.isArray(seed.scenarios)) {
    problems.push({ code: "invalid-collection", message: "Seed scenarios must be an array" });
    return;
  }
  for (const scenario of seed.scenarios) {
    if (!isPlainObject(scenario)) {
      problems.push({ code: "invalid-entry", message: "Scenario entries must be objects" });
      continue;
    }
    unknownFields(scenario, SCENARIO_FIELDS, `Scenario ${scenario.id}`, problems);
    if (typeof scenario.id !== "string" || !SCENARIO_ID_PATTERN.test(scenario.id)) {
      problems.push({ code: "invalid-id-format", message: `Scenario id ${JSON.stringify(scenario.id)} must match ${SCENARIO_ID_PATTERN}` });
    } else if (seenIds.has(scenario.id)) {
      problems.push({ code: "duplicate-id", message: `Duplicate stable ID: ${scenario.id}` });
    }
    if (typeof scenario.id === "string") seenIds.add(scenario.id);
    if (typeof scenario.name !== "string" || !scenario.name) {
      problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} requires a name` });
    }

    const principalAliases = new Set();
    if (!Array.isArray(scenario.principals)) {
      problems.push({ code: "invalid-collection", message: `Scenario ${scenario.id} principals must be an array` });
    } else {
      for (const principal of scenario.principals) {
        if (!isPlainObject(principal)) {
          problems.push({ code: "invalid-entry", message: `Scenario ${scenario.id} principals must be objects` });
          continue;
        }
        unknownFields(principal, SCENARIO_PRINCIPAL_FIELDS, `Scenario ${scenario.id} principal`, problems);
        if (typeof principal.as !== "string" || !SCENARIO_PRINCIPAL_AS_PATTERN.test(principal.as)) {
          problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} principal alias ${JSON.stringify(principal.as)} must be a lower-kebab slug` });
        } else if (principalAliases.has(principal.as)) {
          problems.push({ code: "duplicate-id", message: `Scenario ${scenario.id} has duplicate principal alias ${principal.as}` });
        } else {
          principalAliases.add(principal.as);
        }
        if (typeof principal.actor !== "string" || !conceptById.has(principal.actor)) {
          problems.push({ code: "dangling-concept-reference", message: `Scenario ${scenario.id} principal actor ${JSON.stringify(principal.actor)} is not a declared concept` });
        } else if (conceptById.get(principal.actor)?.role !== "actor") {
          problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} principal actor ${JSON.stringify(principal.actor)} must reference an actor concept` });
        }
      }
    }

    const stepIds = new Set();
    if (!Array.isArray(scenario.steps)) {
      problems.push({ code: "invalid-collection", message: `Scenario ${scenario.id} steps must be an array` });
    } else {
      for (const step of scenario.steps) {
        if (!isPlainObject(step)) {
          problems.push({ code: "invalid-entry", message: `Scenario ${scenario.id} steps must be objects` });
          continue;
        }
        unknownFields(step, SCENARIO_STEP_FIELDS, `Scenario ${scenario.id} step ${step.id}`, problems);
        if (typeof step.id !== "string" || !SCENARIO_STEP_ID_PATTERN.test(step.id)) {
          problems.push({ code: "invalid-id-format", message: `Scenario ${scenario.id} step id ${JSON.stringify(step.id)} must be a lower-kebab slug` });
        } else if (stepIds.has(step.id)) {
          problems.push({ code: "duplicate-id", message: `Scenario ${scenario.id} has duplicate step id ${step.id}` });
        } else {
          stepIds.add(step.id);
        }
        if (typeof step.as !== "string" || !principalAliases.has(step.as)) {
          problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} step ${step.id} as ${JSON.stringify(step.as)} is not a declared principal` });
        }
        if (typeof step.invoke !== "string" || !conceptById.has(step.invoke)) {
          problems.push({ code: "dangling-concept-reference", message: `Scenario ${scenario.id} step ${step.id} invoke ${JSON.stringify(step.invoke)} is not a declared concept` });
        } else if (conceptById.get(step.invoke)?.role !== "behavior") {
          problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} step ${step.id} invoke must reference a behavior concept` });
        }
        if (step.input !== undefined && !isPlainObject(step.input) && !["string", "number", "boolean"].includes(typeof step.input)) {
          problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} step ${step.id} input must be a scalar or object` });
        }
        if (step.capture !== undefined && (typeof step.capture !== "string" || !step.capture)) {
          problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} step ${step.id} capture must be a non-empty string` });
        }
        if (!isPlainObject(step.expect)) {
          problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} step ${step.id} requires an expect object` });
        } else {
          unknownFields(step.expect, SCENARIO_EXPECT_FIELDS, `Scenario ${scenario.id} step ${step.id} expect`, problems);
          if (typeof step.expect.status !== "number" || !Number.isInteger(step.expect.status)) {
            problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} step ${step.id} expect.status must be an integer` });
          }
          if (step.expect.body !== undefined && !isPlainObject(step.expect.body)) {
            problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} step ${step.id} expect.body must be an object` });
          }
        }
      }
    }
  }
}

// checkSeed collects every problem instead of throwing on the first one, so
// authoring surfaces can show all errors at once.
export function checkSeed(seed) {
  const problems = [];
  if (!isPlainObject(seed)) {
    return { valid: false, problems: [{ code: "invalid-root", message: "Seed must be an object" }], contentHash: null };
  }
  unknownFields(seed, ROOT_FIELDS, "Seed", problems);
  if (!SUPPORTED_SEED_FORMAT_VERSIONS.includes(seed.formatVersion)) {
    problems.push({ code: "unsupported-format-version", message: `Unsupported seed format version: ${seed.formatVersion}` });
  }

  if (!isPlainObject(seed.system)) {
    problems.push({ code: "invalid-system", message: "Seed system must be an object" });
  } else {
    unknownFields(seed.system, SYSTEM_FIELDS, "Seed system", problems);
    if (typeof seed.system.id !== "string" || !SYSTEM_ID_PATTERN.test(seed.system.id)) {
      problems.push({ code: "invalid-id-format", message: `Seed system id ${JSON.stringify(seed.system.id)} must be a lower-kebab slug` });
    }
    if (typeof seed.system.name !== "string" || !seed.system.name) {
      problems.push({ code: "invalid-system", message: "Seed system requires a name" });
    }
  }

  const conceptById = new Map();
  const seenIds = new Set();
  for (const [field, pattern, label] of [
    ["concepts", CONCEPT_ID_PATTERN, "Concept"],
    ["commitments", COMMITMENT_ID_PATTERN, "Commitment"],
    ["context", CONTEXT_ID_PATTERN, "Context entry"],
  ]) {
    const items = seed[field];
    if (field === "context" && items === undefined) continue;
    if (!Array.isArray(items)) {
      problems.push({ code: "invalid-collection", message: `Seed ${field} must be an array` });
      continue;
    }
    for (const item of items) {
      if (!isPlainObject(item)) {
        problems.push({ code: "invalid-entry", message: `${label} entries must be objects` });
        continue;
      }
      if (typeof item.id !== "string" || !pattern.test(item.id)) {
        problems.push({ code: "invalid-id-format", message: `${label} id ${JSON.stringify(item.id)} must match ${pattern}` });
      } else if (seenIds.has(item.id)) {
        problems.push({ code: "duplicate-id", message: `Duplicate stable ID: ${item.id}` });
      }
      if (typeof item.id === "string") seenIds.add(item.id);
    }
  }

  for (const concept of Array.isArray(seed.concepts) ? seed.concepts : []) {
    if (!isPlainObject(concept)) continue;
    unknownFields(concept, CONCEPT_FIELDS, `Concept ${concept.id}`, problems);
    if (!CONCEPT_ROLES.includes(concept.role)) {
      problems.push({ code: "unknown-concept-role", message: `Concept ${concept.id} has unknown role ${JSON.stringify(concept.role)}` });
    } else if (typeof concept.id === "string" && CONCEPT_ID_PATTERN.test(concept.id) && !concept.id.startsWith(`${concept.role}.`)) {
      problems.push({ code: "concept-role-mismatch", message: `Concept ${concept.id} must use the ${concept.role}. prefix` });
    }
    if (typeof concept.name !== "string" || !concept.name) {
      problems.push({ code: "invalid-concept", message: `Concept ${concept.id} requires a name` });
    }
    if (concept.summary !== undefined && typeof concept.summary !== "string") {
      problems.push({ code: "invalid-concept", message: `Concept ${concept.id} summary must be a string` });
    }
    if (typeof concept.id === "string") conceptById.set(concept.id, concept);
  }

  for (const commitment of Array.isArray(seed.commitments) ? seed.commitments : []) {
    if (!isPlainObject(commitment)) continue;
    unknownFields(commitment, COMMITMENT_FIELDS, `Commitment ${commitment.id}`, problems);
    if (typeof commitment.source !== "string" || !conceptById.has(commitment.source)) {
      problems.push({ code: "dangling-concept-reference", message: `Commitment ${commitment.id} source ${JSON.stringify(commitment.source)} is not a declared concept` });
    }
    if (!SEED_RELATIONS.includes(commitment.relation)) {
      problems.push({ code: "unknown-relation", message: `Commitment ${commitment.id} has unknown relation ${JSON.stringify(commitment.relation)}` });
    }
    if (seed.formatVersion >= 2 && !COMMITMENT_EXPECTATIONS.includes(commitment.expectation)) {
      problems.push({ code: "invalid-expectation", message: `Commitment ${commitment.id} expectation must be "present" or "absent"` });
    }
    if (seed.formatVersion === 1 && commitment.expectation !== undefined) {
      problems.push({ code: "unsupported-field-for-format", message: `Commitment ${commitment.id} expectation requires seed format version 2` });
    }
    const target = commitment.target;
    if (!isPlainObject(target) || (target.concept === undefined) === (target.literal === undefined)) {
      problems.push({ code: "invalid-target", message: `Commitment ${commitment.id} target needs exactly one of concept or literal` });
    } else if (target.concept !== undefined) {
      if (Object.keys(target).length !== 1) problems.push({ code: "invalid-target", message: `Commitment ${commitment.id} target has unknown fields` });
      if (typeof target.concept !== "string" || !conceptById.has(target.concept)) {
        problems.push({ code: "dangling-concept-reference", message: `Commitment ${commitment.id} target ${JSON.stringify(target.concept)} is not a declared concept` });
      }
    } else {
      if (Object.keys(target).length !== 1) problems.push({ code: "invalid-target", message: `Commitment ${commitment.id} target has unknown fields` });
      if (!["string", "number", "boolean"].includes(typeof target.literal)) {
        problems.push({ code: "invalid-target", message: `Commitment ${commitment.id} literal target must be a scalar` });
      }
    }
    if (commitment.note !== undefined && typeof commitment.note !== "string") {
      problems.push({ code: "invalid-commitment", message: `Commitment ${commitment.id} note must be a string` });
    }
  }

  validateSurfaces(seed, conceptById, seenIds, problems);
  validateScenarios(seed, conceptById, seenIds, problems);

  for (const entry of Array.isArray(seed.context) ? seed.context : []) {
    if (!isPlainObject(entry)) continue;
    unknownFields(entry, CONTEXT_FIELDS, `Context entry ${entry.id}`, problems);
    if (typeof entry.text !== "string" || !entry.text) {
      problems.push({ code: "invalid-context", message: `Context entry ${entry.id} requires text` });
    }
  }

  const contentHash = problems.some((problem) => ["invalid-root", "invalid-collection", "invalid-entry"].includes(problem.code))
    ? null
    : seedContentHash({ ...seed, context: seed.context ?? [] });

  if (seed.ratification !== undefined) {
    const ratification = seed.ratification;
    if (!isPlainObject(ratification)) {
      problems.push({ code: "invalid-ratification", message: "Seed ratification must be an object" });
    } else {
      unknownFields(ratification, RATIFICATION_FIELDS, "Seed ratification", problems);
      if (!RATIFICATION_STATES.includes(ratification.status)) {
        problems.push({ code: "unknown-ratification-status", message: `Unknown ratification status ${JSON.stringify(ratification.status)}` });
      }
      if (ratification.ratifiedAt !== undefined && typeof ratification.ratifiedAt !== "string") {
        problems.push({ code: "invalid-ratification", message: "Seed ratification ratifiedAt must be a string" });
      }
      if (ratification.contentHash !== undefined) {
        if (typeof ratification.contentHash !== "string") {
          problems.push({ code: "invalid-ratification", message: "Seed ratification contentHash must be a string" });
        } else if (contentHash && ratification.contentHash !== contentHash) {
          problems.push({ code: "ratification-hash-mismatch", message: "Ratification content hash does not match the semantic content; re-ratify the changed seed" });
        }
      } else if (ratification.status === "ratified") {
        problems.push({ code: "missing-content-hash", message: "A ratified seed requires a content hash" });
      }
    }
  }

  return { valid: problems.length === 0, problems, contentHash };
}

export function validateSeed(seed) {
  const result = checkSeed(seed);
  if (!result.valid) throw new SeedValidationError(result.problems);
  return result;
}
