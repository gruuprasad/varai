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
export function buildBehaviorCoverage(behaviors = [], options = {}) {
  const authVocabulary = Boolean(options.authVocabulary);
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

    // api.authorization: analyzed only when the guard vocabulary is
    // recognizable in the scanned scope AND every dependency gate in this
    // handler classified. Otherwise partial — an unrecognized auth mechanism
    // never becomes a silent absence (plan §4.1).
    const authorizationUnresolved = behavior.authorizationUnresolved ?? [];
    const authorizationState = authorizationUnresolved.length || !authVocabulary ? "partial" : "analyzed";
    const authorizationDetails = authorizationUnresolved.length
      ? [...new Set(authorizationUnresolved.map((item) => item.reason).filter(Boolean))].sort()
      : authVocabulary
        ? ["Authorization guard vocabulary recognized in scanned scope; dependency gates classified"]
        : ["No recognizable authorization guard vocabulary in scanned scope"];
    coverage.push({
      analyzerId: MODEL_BUILDER_ID,
      analyzerVersion: SYSTEM_MODEL_ANALYZER_VERSION,
      capability: "api.authorization",
      scope: { kind: "element", subsystemKey: "api", elementKind: "operation", key },
      state: authorizationState,
      evidence: evidenceFor(behavior),
      details: authorizationDetails,
    });

    // application.state: analyzed only when the whole handler traced AND every
    // state assignment carries recognizable from-state/path evidence. A bare
    // target assignment never proves a legal transition (plan §2.1).
    const stateClauses = behavior.states ?? [];
    const stateState = untraced.length || stateClauses.some((clause) => !clause.guardRecognized)
      ? "partial"
      : "analyzed";
    const stateDetails = stateState === "analyzed"
      ? ["State assignments traced with recognizable from-state/path evidence"]
      : ["State analysis incomplete: unresolved calls or unguarded state assignments"];
    coverage.push({
      analyzerId: MODEL_BUILDER_ID,
      analyzerVersion: SYSTEM_MODEL_ANALYZER_VERSION,
      capability: "application.state",
      scope: { kind: "element", subsystemKey: "api", elementKind: "operation", key },
      state: stateState,
      evidence: evidenceFor(behavior),
      details: stateDetails,
    });
  }
  return coverage;
}
