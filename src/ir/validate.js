import { ANALYSIS_SCHEMA_VERSION } from "./version.js";
import { CLAUSE_KINDS } from "./behavior-schema.js";

const CLAIM_STATES = new Set(["observed", "inferred", "unverified", "ambiguous"]);

export function validateAnalysisIR(ir) {
  if (!ir || typeof ir !== "object") throw new Error("Analysis IR must be an object");
  if (ir.schemaVersion !== ANALYSIS_SCHEMA_VERSION) {
    throw new Error(`Unsupported Analysis IR schema version: ${ir.schemaVersion}`);
  }
  for (const field of ["facts", "patternInstances", "behaviors", "stateLocations", "bundleViews", "diagnostics", "intentArtifacts"]) {
    if (!Array.isArray(ir[field])) throw new Error(`Analysis IR ${field} must be an array`);
  }
  for (const item of [...ir.facts, ...ir.behaviors, ...ir.stateLocations]) {
    if (typeof item.id !== "string") throw new Error("Analysis IR semantic objects require stable IDs");
  }
  for (const behavior of ir.behaviors) {
    const door = behavior.door;
    const validHttp = !door?.kind && door?.method && door?.path;
    const validUi = door?.kind === "ui_action" && door.source && door.component && door.event && door.action;
    if (!validHttp && !validUi) throw new Error(`Behavior ${behavior.id} has no valid door`);
    for (const kind of CLAUSE_KINDS) {
      if (!Array.isArray(behavior[kind])) throw new Error(`Behavior ${behavior.id} ${kind} must be an array`);
      for (const clause of behavior[kind]) {
        if (!CLAIM_STATES.has(clause.claimState)) throw new Error(`Clause ${clause.id} has invalid claim state`);
      }
    }
  }
  return ir;
}
