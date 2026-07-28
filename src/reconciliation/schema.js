// Realization witness vocabulary (ADR 0005). A realization file is builder
// testimony: it names the exact seed hash it was built against and binds seed
// concepts to observed artifact boundaries. It is untrusted provenance, never
// a verdict, and it never enters a System Model snapshot.
// Realization v2 adds surfaceBindings for expected product surfaces (ADR 0007).

export const REALIZATION_FORMAT_VERSION = 2;
export const SUPPORTED_REALIZATION_FORMAT_VERSIONS = Object.freeze([1, REALIZATION_FORMAT_VERSION]);
export const REALIZATION_FILE = "varai.realization.json";

export const BINDING_STATES = Object.freeze(["unbound", "resolved", "ambiguous", "stale"]);
export const VERDICTS = Object.freeze(["holds", "violated", "cannot_verify", "not_checkable"]);

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
export const BINDING_ID_PATTERN = new RegExp(`^binding\\.${SLUG}$`);
export const SURFACE_BINDING_ID_PATTERN = new RegExp(`^surface-binding\\.${SLUG}$`);

export const ROOT_FIELDS = Object.freeze([
  "formatVersion", "seedHash", "builder", "bindings", "surfaceBindings", "witnesses",
]);
export const BUILDER_FIELDS = Object.freeze(["tool", "version", "builtAt"]);
export const BINDING_FIELDS = Object.freeze(["id", "concept", "artifact", "note"]);
export const SURFACE_BINDING_FIELDS = Object.freeze(["id", "surface", "artifact", "note"]);
export const ARTIFACT_FIELDS = Object.freeze(["lens", "kind", "key", "source"]);
export const ARTIFACT_SOURCE_FIELDS = Object.freeze(["file", "symbol", "line"]);
export const WITNESS_FIELDS = Object.freeze(["commitment", "sourceBinding", "target"]);
export const SEED_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

// Re-export for existing consumers. Relation semantics live in relations.js so
// matching, absence coverage, and checkability cannot drift apart.
export { RELATION_CAPABILITIES } from "./relations.js";

export class RealizationValidationError extends Error {
  constructor(problems) {
    super(`Invalid realization witness: ${problems.map((problem) => problem.message).join("; ")}`);
    this.name = "RealizationValidationError";
    this.problems = problems;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownFields(value, allowed, label, problems) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) problems.push({ code: "unknown-field", message: `${label} has unknown field ${key}` });
  }
}

function validateArtifact(artifact, label, problems) {
  if (!isPlainObject(artifact)) {
    problems.push({ code: "invalid-artifact", message: `${label} requires an artifact selector` });
    return;
  }
  unknownFields(artifact, ARTIFACT_FIELDS, `${label} artifact`, problems);
  for (const field of ["lens", "kind", "key"]) {
    if (artifact[field] !== undefined && (typeof artifact[field] !== "string" || !artifact[field])) {
      problems.push({ code: "invalid-artifact", message: `${label} artifact ${field} must be a non-empty string` });
    }
  }
  const hasKey = typeof artifact.key === "string" && artifact.key;
  if (hasKey && typeof artifact.kind !== "string") {
    problems.push({ code: "invalid-artifact", message: `${label} artifact key selector requires a kind` });
  }
  if (!hasKey) {
    const source = artifact.source;
    if (!isPlainObject(source) || typeof source.file !== "string" || !source.file) {
      problems.push({ code: "invalid-artifact", message: `${label} artifact needs a lens/kind/key selector or a source file fallback` });
    } else if (source.symbol === undefined) {
      // A source line (or a bare file) is a location, not a semantic identity.
      problems.push({ code: "line-only-identity", message: `${label} source fallback requires a symbol; source lines alone are not semantic identity` });
    }
  }
  if (artifact.source !== undefined) {
    if (!isPlainObject(artifact.source)) {
      problems.push({ code: "invalid-artifact", message: `${label} artifact source must be an object` });
    } else {
      unknownFields(artifact.source, ARTIFACT_SOURCE_FIELDS, `${label} artifact source`, problems);
    }
  }
}

// checkRealization collects every structural problem. Referential checks
// (unknown concepts/commitments/bindings) run only when the seed is supplied.
// The seed-hash comparison is deliberately NOT here: a mismatched hash is a
// reconciliation result (stale), not a schema error.
export function checkRealization(realization, { seed } = {}) {
  const problems = [];
  if (!isPlainObject(realization)) {
    return { valid: false, problems: [{ code: "invalid-root", message: "Realization witness must be an object" }] };
  }
  unknownFields(realization, ROOT_FIELDS, "Realization witness", problems);
  if (!SUPPORTED_REALIZATION_FORMAT_VERSIONS.includes(realization.formatVersion)) {
    problems.push({ code: "unsupported-format-version", message: `Unsupported realization format version: ${realization.formatVersion}` });
  }
  if (typeof realization.seedHash !== "string" || !SEED_HASH_PATTERN.test(realization.seedHash)) {
    problems.push({ code: "invalid-seed-hash", message: "Realization witness requires a seedHash of the form sha256:<64 hex>" });
  }
  if (realization.builder !== undefined) {
    if (!isPlainObject(realization.builder)) {
      problems.push({ code: "invalid-builder", message: "Realization builder metadata must be an object" });
    } else {
      unknownFields(realization.builder, BUILDER_FIELDS, "Realization builder", problems);
    }
  }

  const conceptIds = new Set((seed?.concepts ?? []).map((concept) => concept.id));
  const surfaceIds = new Set((seed?.surfaces ?? []).map((surface) => surface.id));
  const commitmentById = new Map((seed?.commitments ?? []).map((commitment) => [commitment.id, commitment]));
  const bindingIds = new Set();

  if (!Array.isArray(realization.bindings)) {
    problems.push({ code: "invalid-collection", message: "Realization bindings must be an array" });
  }
  for (const binding of Array.isArray(realization.bindings) ? realization.bindings : []) {
    if (!isPlainObject(binding)) {
      problems.push({ code: "invalid-entry", message: "Binding entries must be objects" });
      continue;
    }
    unknownFields(binding, BINDING_FIELDS, `Binding ${binding.id}`, problems);
    if (typeof binding.id !== "string" || !BINDING_ID_PATTERN.test(binding.id)) {
      problems.push({ code: "invalid-id-format", message: `Binding id ${JSON.stringify(binding.id)} must match ${BINDING_ID_PATTERN}` });
    } else if (bindingIds.has(binding.id)) {
      problems.push({ code: "duplicate-id", message: `Duplicate binding id: ${binding.id}` });
    }
    if (typeof binding.id === "string") bindingIds.add(binding.id);
    if (typeof binding.concept !== "string") {
      problems.push({ code: "invalid-binding", message: `Binding ${binding.id} requires a concept` });
    } else if (seed && !conceptIds.has(binding.concept)) {
      problems.push({ code: "unknown-concept", message: `Binding ${binding.id} references unknown seed concept ${JSON.stringify(binding.concept)}` });
    }

    validateArtifact(binding.artifact, `Binding ${binding.id}`, problems);
  }

  if (realization.formatVersion === 1 && realization.surfaceBindings !== undefined) {
    problems.push({ code: "unsupported-field-for-format", message: "Realization surfaceBindings require format version 2" });
  } else if (realization.formatVersion >= 2) {
    if (!Array.isArray(realization.surfaceBindings)) {
      problems.push({ code: "invalid-collection", message: "Realization surfaceBindings must be an array" });
    }
    const surfaceBindingIds = new Set();
    for (const binding of Array.isArray(realization.surfaceBindings) ? realization.surfaceBindings : []) {
      if (!isPlainObject(binding)) {
        problems.push({ code: "invalid-entry", message: "Surface binding entries must be objects" });
        continue;
      }
      unknownFields(binding, SURFACE_BINDING_FIELDS, `Surface binding ${binding.id}`, problems);
      if (typeof binding.id !== "string" || !SURFACE_BINDING_ID_PATTERN.test(binding.id)) {
        problems.push({ code: "invalid-id-format", message: `Surface binding id ${JSON.stringify(binding.id)} must match ${SURFACE_BINDING_ID_PATTERN}` });
      } else if (surfaceBindingIds.has(binding.id)) {
        problems.push({ code: "duplicate-id", message: `Duplicate surface binding id: ${binding.id}` });
      }
      if (typeof binding.id === "string") surfaceBindingIds.add(binding.id);
      if (typeof binding.surface !== "string") {
        problems.push({ code: "invalid-binding", message: `Surface binding ${binding.id} requires a surface` });
      } else if (seed && !surfaceIds.has(binding.surface)) {
        problems.push({ code: "unknown-surface", message: `Surface binding ${binding.id} references unknown seed surface ${JSON.stringify(binding.surface)}` });
      }
      validateArtifact(binding.artifact, `Surface binding ${binding.id}`, problems);
    }
  }

  if (realization.witnesses !== undefined && !Array.isArray(realization.witnesses)) {
    problems.push({ code: "invalid-collection", message: "Realization witnesses must be an array" });
  }
  for (const witness of Array.isArray(realization.witnesses) ? realization.witnesses : []) {
    if (!isPlainObject(witness)) {
      problems.push({ code: "invalid-entry", message: "Witness entries must be objects" });
      continue;
    }
    unknownFields(witness, WITNESS_FIELDS, `Witness ${witness.commitment}`, problems);
    const commitment = seed ? commitmentById.get(witness.commitment) : undefined;
    if (typeof witness.commitment !== "string") {
      problems.push({ code: "invalid-witness", message: "Witness entries require a commitment id" });
    } else if (seed && !commitment) {
      problems.push({ code: "unknown-commitment", message: `Witness references unknown seed commitment ${JSON.stringify(witness.commitment)}` });
    }
    if (typeof witness.sourceBinding !== "string" || !bindingIds.has(witness.sourceBinding)) {
      problems.push({ code: "unknown-binding", message: `Witness ${witness.commitment} references undeclared binding ${JSON.stringify(witness.sourceBinding)}` });
    }
    if (seed && commitment && typeof witness.sourceBinding === "string") {
      const sourceBinding = (realization.bindings ?? []).find((b) => b?.id === witness.sourceBinding);
      if (sourceBinding && typeof sourceBinding.concept === "string" && sourceBinding.concept !== commitment.source) {
        problems.push({ code: "witness-source-mismatch", message: `Witness ${witness.commitment} source binding ${JSON.stringify(witness.sourceBinding)} binds ${JSON.stringify(sourceBinding.concept)}, not the commitment source ${JSON.stringify(commitment.source)}` });
      }
    }
    if (witness.target !== undefined) {
      const target = witness.target;
      if (!isPlainObject(target) || (target.concept === undefined) === (target.literal === undefined)) {
        problems.push({ code: "invalid-target", message: `Witness ${witness.commitment} target needs exactly one of concept or literal` });
      } else if (target.concept !== undefined) {
        if (Object.keys(target).length !== 1) problems.push({ code: "invalid-target", message: `Witness ${witness.commitment} target has unknown fields` });
        if (seed && !conceptIds.has(target.concept)) {
          problems.push({ code: "unknown-concept", message: `Witness ${witness.commitment} target ${JSON.stringify(target.concept)} is not a declared concept` });
        } else if (commitment && commitment.target?.concept !== target.concept) {
          problems.push({ code: "witness-target-mismatch", message: `Witness ${witness.commitment} target concept does not match the seed commitment target` });
        }
      } else {
        if (Object.keys(target).length !== 1) problems.push({ code: "invalid-target", message: `Witness ${witness.commitment} target has unknown fields` });
        if (!["string", "number", "boolean"].includes(typeof target.literal)) {
          problems.push({ code: "invalid-target", message: `Witness ${witness.commitment} literal target must be a scalar` });
        } else if (commitment && commitment.target?.literal !== target.literal) {
          problems.push({ code: "witness-target-mismatch", message: `Witness ${witness.commitment} literal target does not match the seed commitment target` });
        }
      }
    }
  }

  return { valid: problems.length === 0, problems };
}

export function validateRealization(realization, options = {}) {
  const result = checkRealization(realization, options);
  if (!result.valid) throw new RealizationValidationError(result.problems);
  return result;
}
