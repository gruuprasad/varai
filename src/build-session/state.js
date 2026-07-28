// Build-session state vocabulary for the product control room.
// Terminal gate outcomes are the only values persisted on a completed session.

export const BUILD_STATES = Object.freeze({
  DRAFT: "draft",
  APPROVED: "approved",
  BUILDING: "building",
  VERIFYING: "verifying",
  READY: "ready",
  NEEDS_ATTENTION: "needs_attention",
  BUILD_FAILED: "build_failed",
  SUPERSEDED: "superseded",
});

export const GATE_STATES = Object.freeze({
  READY: BUILD_STATES.READY,
  NEEDS_ATTENTION: BUILD_STATES.NEEDS_ATTENTION,
  BUILD_FAILED: BUILD_STATES.BUILD_FAILED,
  SUPERSEDED: BUILD_STATES.SUPERSEDED,
});

export const COVERAGE_TRANSITIONS = Object.freeze({
  UNCHANGED: "unchanged",
  IMPROVED: "improved",
  DEGRADED: "degraded",
  ANALYZER_VERSION_CHANGED: "analyzer_version_changed",
});

const WORSE_THAN_ANALYZED = new Set(["partial", "unsupported", "failed"]);

export function isDegradedCoverageState(state) {
  return WORSE_THAN_ANALYZED.has(state);
}

export function isNonZeroExitGate(state) {
  return state === GATE_STATES.NEEDS_ATTENTION || state === GATE_STATES.BUILD_FAILED;
}
