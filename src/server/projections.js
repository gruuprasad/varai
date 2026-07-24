import {
  archUnits,
  behaviorFrames,
  behavioralEnvelopes,
  browseByCapability,
  browseByThing,
  systemPaths,
} from "../system-model/projections/index.js";

// Server serializes core projections only. No semantic structure is derived here.
// Subject-axis convergence (regionCandidates / observedAreas) is demoted from the
// default product surface. Those modules remain importable; they may later return
// as a witness that checks injected bindings against observed structure
// (witness-not-judge), not as a default judge of architecture.
export function serializeProjections(model) {
  return {
    things: browseByThing(model),
    capabilities: browseByCapability(model),
    frames: behaviorFrames(model),
    paths: systemPaths(model),
    envelopes: behavioralEnvelopes(model),
    archUnits: archUnits(model),
  };
}
