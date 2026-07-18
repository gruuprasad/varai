import { ANALYSIS_SCHEMA_VERSION } from "./version.js";

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
    if (!behavior.door?.method || !behavior.door?.path) throw new Error(`Behavior ${behavior.id} has no door`);
    for (const kind of ["requires", "takes", "gives", "reads", "writes", "fails", "untraced"]) {
      for (const clause of behavior[kind]) {
        if (!CLAIM_STATES.has(clause.claimState)) throw new Error(`Clause ${clause.id} has invalid claim state`);
      }
    }
  }
  return ir;
}
