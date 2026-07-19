const INTERACTIONS = ["reads", "writes"];
const CONVERGENCE_MAX_TRACE_DEPTH = 3;

export function bindBehaviorReferents(behaviors, registry) {
  const diagnostics = [];
  const convergence = new Map();
  const bound = behaviors.map((behavior) => {
    const result = { ...behavior };
    const behaviorKey = doorKey(behavior.door);
    for (const collection of INTERACTIONS) {
      result[collection] = (behavior[collection] ?? []).map((clause) => {
        let declaration = clause.targetDeclarationId ? registry.get(clause.targetDeclarationId) : null;
        const candidates = declaration ? [declaration] : registry.named(clause.target);
        if (!declaration && candidates.length === 1) declaration = candidates[0];
        if (declaration) {
          if ((clause.traceDepth ?? 0) <= CONVERGENCE_MAX_TRACE_DEPTH) {
            const users = convergence.get(declaration.id) ?? new Set();
            users.add(behaviorKey);
            convergence.set(declaration.id, users);
          }
          return { ...clause, target: declaration.name, targetDeclarationId: declaration.id, bindingState: clause.layer === "ast" ? "observed" : "inferred" };
        }
        if (candidates.length > 1) {
          diagnostics.push({
            code: "ambiguous-effect-target",
            severity: "warning",
            message: `Effect target ${clause.target} matches multiple declarations`,
            claimState: "ambiguous",
            capability: "api.effect",
            evidence: [clause.evidence].flat().filter(Boolean),
          });
          return { ...clause, bindingState: "ambiguous", targetCandidates: candidates.map((item) => item.id) };
        }
        diagnostics.push({
          code: "unresolved-effect-target",
          severity: "warning",
          message: `Could not resolve effect target ${clause.target ?? "unknown"} to a declaration`,
          claimState: "unverified",
          capability: "api.effect",
          evidence: [clause.evidence].flat().filter(Boolean),
        });
        return { ...clause, bindingState: "unverified" };
      });
    }
    return result;
  });
  return { behaviors: bound, convergence, diagnostics };
}

export function doorKey(door = {}) {
  if (door.kind === "ui_action") return `ui:${door.source}:${door.component}:${door.event}:${door.action}`;
  return `api:${String(door.method ?? "").toUpperCase()}:${door.path ?? ""}`;
}
