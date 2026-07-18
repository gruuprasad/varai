import { createHash } from "node:crypto";

export function semanticHash(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

export function stableId(type, identity) {
  return `${type}:${semanticHash(identity).slice(0, 20)}`;
}

export function normalizePath(value) {
  return String(value ?? "").replaceAll("\\", "/").replace(/\/+/g, "/");
}

const GLOBAL_FACT_KINDS = new Set(["env_var", "integration", "package", "script", "service"]);

export function factIdentity(fact) {
  if (fact.kind === "api_route" || fact.kind === "webhook_route") {
    return [fact.kind, String(fact.name).replace(/\s+/g, " ").trim()];
  }
  if (GLOBAL_FACT_KINDS.has(fact.kind)) return [fact.kind, fact.ecosystem ?? "", fact.name];
  const location = fact.semanticLocation ?? fact.evidence?.[0]?.file ?? "";
  return [fact.kind, normalizePath(location), fact.name];
}

export function behaviorIdentity(behavior) {
  return ["http", String(behavior.door?.method ?? "").toUpperCase(), normalizePath(behavior.door?.path)];
}

export function clausePayload(kind, clause) {
  if (kind === "requires") return { kind: clause.kind ?? "dependency", name: clause.name };
  if (kind === "takes" || kind === "gives") return { schema: clause.schema ?? clause.name ?? null };
  if (kind === "reads" || kind === "writes") {
    return { medium: clause.medium ?? clause.kind ?? "unknown", target: clause.target ?? null, detail: clause.detail ?? null };
  }
  if (kind === "fails") return { status: clause.status ?? null, reason: clause.reason ?? null };
  if (kind === "untraced") return { call: clause.call ?? null, reason: clause.reason ?? null };
  return { ...clause, evidence: undefined, id: undefined };
}

export function clauseIdentity(kind, clause) {
  return [kind, clausePayload(kind, clause)];
}

export function stateIdentity(state) {
  return [state.medium ?? "unknown", state.target ?? state.detail ?? "unknown"];
}
