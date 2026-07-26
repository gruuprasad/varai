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
    // Module grain, deliberately. `subsystem` groups by technology lens
    // (api / data / ui / …), which is not an architectural axis: an import
    // between two API operations is intra-unit there and gets dropped, so the
    // graph is always empty. Module grain is the coarsest grouping at which
    // observed dependency edges survive. The unit key is a deterministic
    // rollup (lexicographically smallest evidence file), not a designated
    // home — see arch-units.js.
    archUnits: archUnits(model, { grain: "module" }),
  };
}
