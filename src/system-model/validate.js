import { SYSTEM_MODEL_SCHEMA_VERSION } from "./version.js";
import { CLAIM_STATES, COVERAGE_STATES, ELEMENT_ROLES, OBSERVATION_METHODS, RELATIONSHIPS } from "./schema.js";
import { DEFAULT_LENS_REGISTRY } from "./lenses.js";
import { DEFAULT_QUALIFIER_REGISTRY } from "./qualifiers.js";

const CLAIM_STATE_SET = new Set(CLAIM_STATES);
const COVERAGE_STATE_SET = new Set(COVERAGE_STATES);
const ROLE_SET = new Set(ELEMENT_ROLES);
const METHOD_SET = new Set(OBSERVATION_METHODS);
const RELATIONSHIP_SET = new Set(RELATIONSHIPS);

function requireId(item, label) {
  if (typeof item?.id !== "string" || !item.id) throw new Error(`${label} requires a stable ID`);
}

function validateEvidence(evidence, label) {
  if (!Array.isArray(evidence)) throw new Error(`${label} evidence must be an array`);
  for (const item of evidence) {
    if (typeof item?.file !== "string" || !item.file) throw new Error(`${label} evidence requires a file`);
    if (item.line != null && (!Number.isInteger(item.line) || item.line < 1)) throw new Error(`${label} evidence line must be a positive integer`);
  }
}

function validateQualifiers(qualifiers, registry, label) {
  if (!qualifiers || typeof qualifiers !== "object" || Array.isArray(qualifiers)) throw new Error(`${label} qualifiers must be an object`);
  for (const [key, value] of Object.entries(qualifiers)) {
    if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new Error(`${label} qualifier ${key} must use lower_snake_case`);
    if (!registry.has(key)) throw new Error(`${label} qualifier ${key} is not registered`);
    const values = Array.isArray(value) ? value : [value];
    if (!values.length || values.some((item) => !["string", "number", "boolean"].includes(typeof item))) {
      throw new Error(`${label} qualifier ${key} must contain scalar values`);
    }
  }
}

export function validateSystemModel(model, options = {}) {
  const lenses = options.lensRegistry ?? DEFAULT_LENS_REGISTRY;
  const qualifiers = options.qualifierRegistry ?? DEFAULT_QUALIFIER_REGISTRY;
  if (!model || typeof model !== "object") throw new Error("System Model must be an object");
  if (model.schemaVersion !== SYSTEM_MODEL_SCHEMA_VERSION) throw new Error(`Unsupported System Model schema version: ${model.schemaVersion}`);
  requireId(model.system, "System");
  for (const field of ["subsystems", "elements", "claims", "coverage", "diagnostics"]) {
    if (!Array.isArray(model[field])) throw new Error(`System Model ${field} must be an array`);
  }

  const ids = new Set([model.system.id]);
  const subsystems = new Map();
  for (const subsystem of model.subsystems) {
    requireId(subsystem, "Subsystem");
    const lens = lenses.get(subsystem.lens);
    if (!lens) throw new Error(`Subsystem ${subsystem.id} uses unknown lens ${subsystem.lens}`);
    validateQualifiers(subsystem.qualifiers, qualifiers, `Subsystem ${subsystem.id}`);
    validateEvidence(subsystem.evidence, `Subsystem ${subsystem.id}`);
    if (ids.has(subsystem.id)) throw new Error(`Duplicate semantic ID: ${subsystem.id}`);
    ids.add(subsystem.id);
    subsystems.set(subsystem.id, lens);
  }

  for (const element of model.elements) {
    requireId(element, "Element");
    const lens = subsystems.get(element.subsystemId);
    if (!lens) throw new Error(`Element ${element.id} references an unknown subsystem`);
    if (!lens.elementKinds.includes(element.kind)) throw new Error(`Element ${element.id} kind ${element.kind} is not valid for ${lens.id}`);
    if (!Array.isArray(element.roles) || element.roles.some((role) => !ROLE_SET.has(role))) throw new Error(`Element ${element.id} has invalid roles`);
    if (!CLAIM_STATE_SET.has(element.claimState)) throw new Error(`Element ${element.id} has invalid claim state`);
    if (!METHOD_SET.has(element.observationMethod)) throw new Error(`Element ${element.id} has invalid observation method`);
    if (typeof element.capability !== "string" || !element.capability) throw new Error(`Element ${element.id} requires a capability`);
    validateQualifiers(element.qualifiers, qualifiers, `Element ${element.id}`);
    validateEvidence(element.evidence, `Element ${element.id}`);
    validateEvidence(element.implementationPath ?? [], `Element ${element.id} implementation path`);
    if (ids.has(element.id)) throw new Error(`Duplicate semantic ID: ${element.id}`);
    ids.add(element.id);
  }

  for (const claim of model.claims) {
    requireId(claim, "Claim");
    if (!ids.has(claim.sourceId)) throw new Error(`Claim ${claim.id} has an unknown source`);
    if (!RELATIONSHIP_SET.has(claim.relation)) throw new Error(`Claim ${claim.id} has invalid relationship ${claim.relation}`);
    if (claim.target?.kind === "reference") {
      if (!ids.has(claim.target.id)) throw new Error(`Claim ${claim.id} has an unknown target`);
    } else if (claim.target?.kind === "literal") {
      if (typeof claim.target.valueType !== "string" || !["string", "number", "boolean"].includes(typeof claim.target.value)) {
        throw new Error(`Claim ${claim.id} has an invalid literal target`);
      }
    } else throw new Error(`Claim ${claim.id} has an invalid target`);
    if (!CLAIM_STATE_SET.has(claim.claimState)) throw new Error(`Claim ${claim.id} has invalid claim state`);
    if (!METHOD_SET.has(claim.observationMethod)) throw new Error(`Claim ${claim.id} has invalid observation method`);
    if (typeof claim.capability !== "string" || !claim.capability) throw new Error(`Claim ${claim.id} requires a capability`);
    validateQualifiers(claim.qualifiers, qualifiers, `Claim ${claim.id}`);
    validateEvidence(claim.evidence, `Claim ${claim.id}`);
    validateEvidence(claim.implementationPath ?? [], `Claim ${claim.id} implementation path`);
    if (ids.has(claim.id)) throw new Error(`Duplicate semantic ID: ${claim.id}`);
    ids.add(claim.id);
  }

  for (const coverage of model.coverage) {
    requireId(coverage, "Coverage");
    if (!ids.has(coverage.scopeId)) throw new Error(`Coverage ${coverage.id} has an unknown scope`);
    if (!COVERAGE_STATE_SET.has(coverage.state)) throw new Error(`Coverage ${coverage.id} has invalid state`);
    if (!coverage.analyzerId || !coverage.analyzerVersion || !coverage.capability) throw new Error(`Coverage ${coverage.id} requires analyzer and capability metadata`);
    validateEvidence(coverage.evidence, `Coverage ${coverage.id}`);
    if (ids.has(coverage.id)) throw new Error(`Duplicate semantic ID: ${coverage.id}`);
    ids.add(coverage.id);
  }
  return model;
}
