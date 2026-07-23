import { seedContentHash } from "./identity.js";
import {
  COMMITMENT_FIELDS, COMMITMENT_ID_PATTERN, CONCEPT_FIELDS, CONCEPT_ID_PATTERN, CONCEPT_ROLES,
  CONTEXT_FIELDS, CONTEXT_ID_PATTERN, RATIFICATION_FIELDS, RATIFICATION_STATES, ROOT_FIELDS,
  SEED_FORMAT_VERSION, SEED_RELATIONS, SYSTEM_FIELDS, SYSTEM_ID_PATTERN,
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

// checkSeed collects every problem instead of throwing on the first one, so
// authoring surfaces can show all errors at once.
export function checkSeed(seed) {
  const problems = [];
  if (!isPlainObject(seed)) {
    return { valid: false, problems: [{ code: "invalid-root", message: "Seed must be an object" }], contentHash: null };
  }
  unknownFields(seed, ROOT_FIELDS, "Seed", problems);
  if (seed.formatVersion !== SEED_FORMAT_VERSION) {
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

  const conceptIds = new Set();
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
    if (typeof concept.id === "string") conceptIds.add(concept.id);
  }

  for (const commitment of Array.isArray(seed.commitments) ? seed.commitments : []) {
    if (!isPlainObject(commitment)) continue;
    unknownFields(commitment, COMMITMENT_FIELDS, `Commitment ${commitment.id}`, problems);
    if (typeof commitment.source !== "string" || !conceptIds.has(commitment.source)) {
      problems.push({ code: "dangling-concept-reference", message: `Commitment ${commitment.id} source ${JSON.stringify(commitment.source)} is not a declared concept` });
    }
    if (!SEED_RELATIONS.includes(commitment.relation)) {
      problems.push({ code: "unknown-relation", message: `Commitment ${commitment.id} has unknown relation ${JSON.stringify(commitment.relation)}` });
    }
    const target = commitment.target;
    if (!isPlainObject(target) || (target.concept === undefined) === (target.literal === undefined)) {
      problems.push({ code: "invalid-target", message: `Commitment ${commitment.id} target needs exactly one of concept or literal` });
    } else if (target.concept !== undefined) {
      if (Object.keys(target).length !== 1) problems.push({ code: "invalid-target", message: `Commitment ${commitment.id} target has unknown fields` });
      if (typeof target.concept !== "string" || !conceptIds.has(target.concept)) {
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
