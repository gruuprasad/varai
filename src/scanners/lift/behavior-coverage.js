import { SYSTEM_MODEL_ANALYZER_VERSION } from "../../system-model/version.js";
import { MODEL_BUILDER_ID } from "../../system-model/coverage.js";

function operationKey(door = {}) {
  const path = String(door.path ?? "/").replace(/\/{2,}/g, "/") || "/";
  return `${String(door.method ?? "").toUpperCase()} ${path}`.trim();
}

function evidenceFor(behavior) {
  return behavior?.door?.evidence ? [behavior.door.evidence] : [];
}

// Private trace completion becomes canonical element-scoped coverage only for
// the deliberately narrow FastAPI body slice. A clean bounded trace can prove
// that no supported effect/failure was skipped; every other API capability
// remains broad partial coverage until it gains its own completeness contract.
export function buildBehaviorCoverage(behaviors = []) {
  const coverage = [];
  for (const behavior of behaviors) {
    if (!behavior?.handler || behavior.door?.kind === "ui_action") continue;
    const key = operationKey(behavior.door);
    if (!key) continue;
    const untraced = behavior.untraced ?? [];
    const state = untraced.length ? "partial" : "analyzed";
    const details = untraced.length
      ? [...new Set(untraced.map((item) => item.reason).filter(Boolean))].sort()
      : ["Bounded FastAPI handler body trace completed without unresolved calls"];
    for (const capability of ["api.effect", "api.failure"]) {
      coverage.push({
        analyzerId: MODEL_BUILDER_ID,
        analyzerVersion: SYSTEM_MODEL_ANALYZER_VERSION,
        capability,
        scope: { kind: "element", subsystemKey: "api", elementKind: "operation", key },
        state,
        evidence: evidenceFor(behavior),
        details,
      });
    }
  }
  return coverage;
}
