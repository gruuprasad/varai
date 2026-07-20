import {
  behaviorFrames,
  behavioralEnvelopes,
  browseByCapability,
  browseByThing,
  observedAreas,
  semanticRegionCandidates,
  systemPaths,
} from "../system-model/projections/index.js";

// Server serializes core projections only. No semantic structure is derived here.
export function serializeProjections(model) {
  return {
    things: browseByThing(model),
    capabilities: browseByCapability(model),
    frames: behaviorFrames(model),
    paths: systemPaths(model),
    envelopes: behavioralEnvelopes(model),
    regionCandidates: semanticRegionCandidates(model),
    observedAreas: observedAreas(model),
  };
}
