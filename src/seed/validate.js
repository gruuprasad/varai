import { seedContentHash } from "./identity.js";
import { validateScenarios } from "./scenarios.js";
import {
  COMMITMENT_FIELDS, COMMITMENT_ID_PATTERN, CONCEPT_FIELDS, CONCEPT_ID_PATTERN, CONCEPT_ROLES,
  CONTEXT_FIELDS, CONTEXT_ID_PATTERN, RATIFICATION_FIELDS, RATIFICATION_STATES, ROOT_FIELDS,
  COMMITMENT_EXPECTATIONS, SEED_RELATIONS, SURFACE_ACCESS, SURFACE_CHANNELS, SURFACE_FIELDS,
  SURFACE_ID_PATTERN, SUPPORTED_SEED_FORMAT_VERSIONS, SYSTEM_FIELDS, SYSTEM_ID_PATTERN,
  FLOW_FIELDS, FLOW_ID_PATTERN, STATE_MODEL_FIELDS, STATE_TRANSITION_FIELDS, STATE_VALUE_PATTERN,
  FIELD_CONTRACT_FIELDS, FIELD_NAME_PATTERN,
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

// Seed v4 (plan §2.1): a resource may declare a state model — initial state,
// state set, and legal transitions keyed by (from, to, via behaviors).
function validateStateModel(concept, conceptById, problems) {
  if (concept.stateModel === undefined) return;
  if (concept.role !== "resource") {
    problems.push({ code: "state-model-on-non-resource", message: `Concept ${concept.id} may declare a stateModel only with role resource` });
    return;
  }
  const model = concept.stateModel;
  if (!isPlainObject(model)) {
    problems.push({ code: "invalid-state-model", message: `Concept ${concept.id} stateModel must be an object` });
    return;
  }
  unknownFields(model, STATE_MODEL_FIELDS, `State model ${concept.id}`, problems);
  const states = Array.isArray(model.states) ? model.states : null;
  if (!states) {
    problems.push({ code: "invalid-state-model", message: `State model ${concept.id} requires a states array` });
    return;
  }
  const stateSet = new Set();
  for (const state of states) {
    if (typeof state !== "string" || !STATE_VALUE_PATTERN.test(state)) {
      problems.push({ code: "invalid-state-value", message: `State model ${concept.id} state ${JSON.stringify(state)} must match ${STATE_VALUE_PATTERN}` });
    } else if (stateSet.has(state)) {
      problems.push({ code: "duplicate-state", message: `State model ${concept.id} declares ${state} twice` });
    }
    if (typeof state === "string") stateSet.add(state);
  }
  if (typeof model.initial !== "string" || !stateSet.has(model.initial)) {
    problems.push({ code: "unknown-initial-state", message: `State model ${concept.id} initial ${JSON.stringify(model.initial)} must name a declared state` });
  }
  const seenTransitions = new Set();
  for (const transition of Array.isArray(model.transitions) ? model.transitions : []) {
    if (!isPlainObject(transition)) {
      problems.push({ code: "invalid-entry", message: `State model ${concept.id} transition entries must be objects` });
      continue;
    }
    unknownFields(transition, STATE_TRANSITION_FIELDS, `Transition in ${concept.id}`, problems);
    const { from, to, via } = transition;
    if (typeof from !== "string" || !stateSet.has(from)) {
      problems.push({ code: "unknown-transition-from", message: `Transition ${concept.id} ${JSON.stringify(from)} -> ${JSON.stringify(to)} has unknown from-state` });
    }
    if (typeof to !== "string" || !stateSet.has(to)) {
      problems.push({ code: "unknown-transition-to", message: `Transition ${concept.id} ${JSON.stringify(from)} -> ${JSON.stringify(to)} has unknown to-state` });
    }
    if (!Array.isArray(via) || via.length === 0) {
      problems.push({ code: "invalid-transition-via", message: `Transition ${concept.id} ${JSON.stringify(from)} -> ${JSON.stringify(to)} requires at least one behavior in via` });
    } else {
      for (const behaviorId of via) {
        if (typeof behaviorId !== "string" || !conceptById.has(behaviorId) || conceptById.get(behaviorId)?.role !== "behavior") {
          problems.push({ code: "dangling-concept-reference", message: `Transition ${concept.id} via ${JSON.stringify(behaviorId)} is not a declared behavior concept` });
        }
      }
      const key = `${from}\0${to}\0${[...via].sort().join(",")}`;
      if (seenTransitions.has(key)) {
        problems.push({ code: "duplicate-transition", message: `State model ${concept.id} declares the ${from} -> ${to} transition twice` });
      }
      seenTransitions.add(key);
    }
  }
}

// Seed v4 (plan §2.2): a resource may declare the data shape it needs.
function validateFieldContract(concept, problems) {
  if (concept.fields === undefined) return;
  if (concept.role !== "resource") {
    problems.push({ code: "fields-on-non-resource", message: `Concept ${concept.id} may declare fields only with role resource` });
    return;
  }
  if (!Array.isArray(concept.fields)) {
    problems.push({ code: "invalid-collection", message: `Concept ${concept.id} fields must be an array` });
    return;
  }
  const seen = new Set();
  for (const field of concept.fields) {
    if (!isPlainObject(field)) {
      problems.push({ code: "invalid-entry", message: `Concept ${concept.id} field entries must be objects` });
      continue;
    }
    unknownFields(field, FIELD_CONTRACT_FIELDS, `Field in ${concept.id}`, problems);
    if (typeof field.name !== "string" || !FIELD_NAME_PATTERN.test(field.name)) {
      problems.push({ code: "invalid-field-name", message: `Field in ${concept.id} name ${JSON.stringify(field.name)} must match ${FIELD_NAME_PATTERN}` });
    } else if (seen.has(field.name)) {
      problems.push({ code: "duplicate-field", message: `Concept ${concept.id} declares field ${field.name} twice` });
    }
    if (typeof field.name === "string") seen.add(field.name);
    if (typeof field.type !== "string" || !field.type) {
      problems.push({ code: "invalid-field-type", message: `Field ${concept.id}.${field.name} requires a type` });
    }
    if (field.required !== undefined && typeof field.required !== "boolean") {
      problems.push({ code: "invalid-field-required", message: `Field ${concept.id}.${field.name} required must be a boolean` });
    }
  }
}

// Seed v4 (plan §2.3): flows group behaviors behind one surface entry.
function validateFlows(seed, conceptById, seenIds, problems) {
  if (seed.formatVersion < 4) {
    if (seed.flows !== undefined) {
      problems.push({ code: "unsupported-field-for-format", message: "Seed flows require seed format version 4" });
    }
    return;
  }
  if (!Array.isArray(seed.flows)) {
    problems.push({ code: "invalid-collection", message: "Seed flows must be an array" });
    return;
  }
  const surfaceIds = new Set((seed.surfaces ?? []).map((surface) => surface.id));
  for (const flow of seed.flows) {
    if (!isPlainObject(flow)) {
      problems.push({ code: "invalid-entry", message: "Flow entries must be objects" });
      continue;
    }
    unknownFields(flow, FLOW_FIELDS, `Flow ${flow.id}`, problems);
    if (typeof flow.id !== "string" || !FLOW_ID_PATTERN.test(flow.id)) {
      problems.push({ code: "invalid-id-format", message: `Flow id ${JSON.stringify(flow.id)} must match ${FLOW_ID_PATTERN}` });
    } else if (seenIds.has(flow.id)) {
      problems.push({ code: "duplicate-id", message: `Duplicate stable ID: ${flow.id}` });
    }
    if (typeof flow.id === "string") seenIds.add(flow.id);
    if (typeof flow.name !== "string" || !flow.name) {
      problems.push({ code: "invalid-flow", message: `Flow ${flow.id} requires a name` });
    }
    if (typeof flow.entry !== "string" || !surfaceIds.has(flow.entry)) {
      problems.push({ code: "dangling-surface-reference", message: `Flow ${flow.id} entry ${JSON.stringify(flow.entry)} is not a declared surface` });
    }
    if (!Array.isArray(flow.members)) {
      problems.push({ code: "invalid-flow-members", message: `Flow ${flow.id} members must be an array` });
    } else {
      for (const member of flow.members) {
        if (typeof member !== "string" || !conceptById.has(member) || conceptById.get(member)?.role !== "behavior") {
          problems.push({ code: "dangling-concept-reference", message: `Flow ${flow.id} member ${JSON.stringify(member)} is not a declared behavior concept` });
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
    validateStateModel(concept, conceptById, problems);
    validateFieldContract(concept, problems);
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
  validateFlows(seed, conceptById, seenIds, problems);

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
