// Seed language vocabulary (ADR 0005). A seed is human-ratified source intent,
// not an analyzer model. The checkable relations are deliberately bounded to
// those already represented in the System Model relationship vocabulary.
// Seed v3 (ADR 0007) adds human-owned surfaces and scenarios.

import {
  SCENARIO_EXPECT_FIELDS, SCENARIO_FIELDS, SCENARIO_ID_PATTERN, SCENARIO_PRINCIPAL_AS_PATTERN,
  SCENARIO_PRINCIPAL_FIELDS, SCENARIO_STEP_FIELDS, SCENARIO_STEP_ID_PATTERN,
} from "./scenarios.js";
import { SURFACE_ACCESS, SURFACE_CHANNELS, SURFACE_FIELDS, SURFACE_ID_PATTERN } from "./surfaces.js";

export { SURFACE_ACCESS, SURFACE_CHANNELS, SURFACE_FIELDS, SURFACE_ID_PATTERN };
export {
  SCENARIO_EXPECT_FIELDS, SCENARIO_FIELDS, SCENARIO_ID_PATTERN, SCENARIO_PRINCIPAL_AS_PATTERN,
  SCENARIO_PRINCIPAL_FIELDS, SCENARIO_STEP_FIELDS, SCENARIO_STEP_ID_PATTERN,
};

export const SEED_FORMAT_VERSION = 3;
export const SUPPORTED_SEED_FORMAT_VERSIONS = Object.freeze([1, 2, SEED_FORMAT_VERSION]);

export const CONCEPT_ROLES = Object.freeze(["actor", "behavior", "resource", "condition", "outcome"]);

export const SEED_RELATIONS = Object.freeze([
  "invokes", "accepts", "requires",
  "reads", "changes", "creates", "removes",
  "produces", "fails_with", "emits",
  "depends_on",
  "performs",
]);

// Relations that are valid authored intent but have no checker semantics yet.
// Reconciliation reports these as `not_checkable`, never as a silent absence.
export const RECORDED_ONLY_RELATIONS = Object.freeze(["performs"]);

export const RATIFICATION_STATES = Object.freeze(["draft", "ratified"]);

export const SEED_FILE = "varai.seed.json";

export const ROOT_FIELDS = Object.freeze([
  "formatVersion", "system", "concepts", "commitments", "surfaces", "scenarios", "context", "ratification",
]);
export const SYSTEM_FIELDS = Object.freeze(["id", "name"]);
export const CONCEPT_FIELDS = Object.freeze(["id", "role", "name", "summary"]);
export const COMMITMENT_FIELDS = Object.freeze(["id", "source", "relation", "target", "expectation", "note"]);
export const COMMITMENT_EXPECTATIONS = Object.freeze(["present", "absent"]);
export const CONTEXT_FIELDS = Object.freeze(["id", "text"]);
export const RATIFICATION_FIELDS = Object.freeze(["status", "contentHash", "ratifiedAt"]);

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
export const SYSTEM_ID_PATTERN = new RegExp(`^${SLUG}$`);
export const CONCEPT_ID_PATTERN = new RegExp(`^(?:${CONCEPT_ROLES.join("|")})\\.${SLUG}$`);
export const COMMITMENT_ID_PATTERN = new RegExp(`^commitment\\.${SLUG}$`);
export const CONTEXT_ID_PATTERN = new RegExp(`^context\\.${SLUG}$`);
