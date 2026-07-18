import { normalizePath, stableId } from "../ir/identity.js";

export function systemId(key = "repository-root") {
  return stableId("system", key);
}

export function subsystemId(parentSystemId, subsystem) {
  return stableId("subsystem", [parentSystemId, subsystem.lens, subsystem.key]);
}

export function elementId(element) {
  return stableId("element", [element.subsystemId, element.kind, element.key]);
}

export function targetIdentity(target) {
  if (target?.kind === "reference") return ["reference", target.id];
  return ["literal", target?.valueType ?? "string", target?.value];
}

export function claimId(claim) {
  const semanticTarget = claim.slot ? ["slot", claim.slot] : ["target", targetIdentity(claim.target)];
  return stableId("claim", [claim.sourceId, claim.relation, semanticTarget]);
}

export function coverageId(coverage) {
  return stableId("coverage", [coverage.analyzerId, coverage.capability, coverage.scopeId]);
}

export function normalizeEvidencePath(value) {
  return normalizePath(value);
}
