import path from "node:path";
import { createSystemModel } from "../canonicalize.js";
import { validateSystemModel } from "../validate.js";
import { projectCoverage, COMPAT_ANALYZER_ID } from "./coverage.js";

function methodFor(item) {
  const value = item?.observationMethod ?? item?.layer ?? "semantic";
  if (value === "file") return "manifest";
  if (value === "heuristic") return "convention";
  return ["ast", "manifest", "semantic", "convention"].includes(value) ? value : "semantic";
}

function stateFor(item) {
  return item?.claimState ?? (item?.layer === "heuristic" ? "inferred" : "observed");
}

function source(lens, elementKind, key) {
  return { kind: "element", subsystemKey: lens, elementKind, key };
}

function subsystem(key) {
  return { kind: "subsystem", key };
}

function reference(lens, elementKind, key) {
  return { kind: "reference", reference: source(lens, elementKind, key) };
}

function literal(valueType, value) {
  return { kind: "literal", valueType, value: String(value) };
}

function normalizeHttpKey(method, routePath) {
  const normalizedPath = String(routePath ?? "").replace(/\/{2,}/g, "/") || "/";
  return `${String(method ?? "").toUpperCase()} ${normalizedPath}`.trim();
}

function apiParts(name) {
  const match = String(name ?? "").match(/^([A-Za-z]+)\s+(.+)$/);
  return match ? { method: match[1], routePath: match[2] } : null;
}

function actionName(action) {
  if (action === "onClose") return "Dismiss";
  return String(action ?? "Action").replace(/^on(?=[A-Z])/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function inverted(condition) {
  const value = String(condition ?? "unknown").trim();
  return value.startsWith("!") ? value.slice(1).trim() : `not ${value}`;
}

function outcomeValue(clause) {
  if (clause.status != null && clause.reason) return `${clause.status}: ${clause.reason}`;
  return String(clause.status ?? clause.reason ?? "unknown failure");
}

export function projectAnalysisV2(analysis, options = {}) {
  const systemName = options.systemName ?? path.basename(options.repoPath ?? "repository");
  const subsystems = new Map();
  const elements = [];
  const claims = [];
  const diagnostics = (analysis.diagnostics ?? []).map((item) => ({
    ...item,
    analyzerId: item.analyzerId ?? COMPAT_ANALYZER_ID,
    capability: item.capability ?? "analysis.compatibility",
    scopeId: item.scopeId ?? null,
    evidence: item.evidence ?? [],
  }));

  function ensureSubsystem(lens, name, qualifiers = {}) {
    if (!subsystems.has(lens)) subsystems.set(lens, { key: lens, lens, name, qualifiers, evidence: [] });
  }

  function addElement(element) {
    ensureSubsystem(element.subsystemKey, element.subsystemName ?? element.subsystemKey);
    elements.push({
      roles: [], qualifiers: {}, evidence: [], observationMethod: "semantic", claimState: "observed",
      ...element,
    });
  }

  function addClaim(claim) {
    claims.push({ qualifiers: {}, evidence: [], observationMethod: "semantic", claimState: "observed", ...claim });
  }

  function expose(lens, elementKind, key, evidence, capability, relation = "exposes") {
    addClaim({
      source: subsystem(lens), relation, target: reference(lens, elementKind, key),
      slot: `${relation}:${elementKind}:${key}`, evidence, capability,
    });
  }

  const dataElements = new Map();
  function dataKey(kind, name) { return `${kind}:${name}`; }
  function rememberData(kind, name) { dataElements.set(String(name), { kind, key: dataKey(kind, name) }); }

  for (const fact of analysis.facts ?? []) {
    const common = { evidence: fact.evidence, observationMethod: methodFor(fact), claimState: stateFor(fact) };
    if (fact.kind === "schema") {
      const key = dataKey("contract", fact.name);
      addElement({ subsystemKey: "data", subsystemName: "Data", key, kind: "contract", roles: ["resource"], name: fact.name, capability: "data.contract", ...common });
      rememberData("contract", fact.name);
      expose("data", "contract", key, fact.evidence, "data.contract", "contains");
    } else if (fact.kind === "db_model") {
      const key = dataKey("entity", fact.name);
      addElement({ subsystemKey: "data", subsystemName: "Data", key, kind: "entity", roles: ["resource"], name: fact.name, capability: "data.entity", ...common });
      rememberData("entity", fact.name);
      expose("data", "entity", key, fact.evidence, "data.entity", "contains");
    } else if (fact.kind === "state_store") {
      const key = dataKey("state", fact.name);
      addElement({ subsystemKey: "data", subsystemName: "Data", key, kind: "state", roles: ["resource"], name: fact.name, capability: "data.state", ...common });
      rememberData("state", fact.name);
      expose("data", "state", key, fact.evidence, "data.state", "contains");
    } else if (fact.kind === "script") {
      const key = `${fact.runner ?? "command"}:${fact.name}`;
      addElement({ subsystemKey: "cli", subsystemName: "CLI", key, kind: "command", roles: ["interface", "behavior"], name: fact.name, capability: "cli.command", ...common });
      expose("cli", "command", key, fact.evidence, "cli.command");
    } else if (fact.kind === "service") {
      const key = String(fact.name);
      addElement({ subsystemKey: "service", subsystemName: "Services", key, kind: "process", name: fact.name, capability: "service.process", ...common });
      expose("service", "process", key, fact.evidence, "service.process", "contains");
    } else if (fact.kind === "page") {
      const key = String(fact.name);
      addElement({ subsystemKey: "ui", subsystemName: "UI", key, kind: "screen", roles: ["interface"], name: fact.name, capability: "ui.screen", ...common });
      expose("ui", "screen", key, fact.evidence, "ui.screen");
    } else if (fact.kind === "component") {
      const key = String(fact.name);
      addElement({ subsystemKey: "ui", subsystemName: "UI", key, kind: "component", roles: ["interface"], name: fact.name, capability: "ui.component", ...common });
      expose("ui", "component", key, fact.evidence, "ui.component", "contains");
    } else if (fact.kind === "api_route") {
      const parts = apiParts(fact.name);
      if (!parts) continue;
      const key = normalizeHttpKey(parts.method, parts.routePath);
      addElement({ subsystemKey: "api", subsystemName: "API", key, kind: "operation", roles: ["interface", "behavior"], name: key, capability: "api.operation", ...common });
      expose("api", "operation", key, fact.evidence, "api.operation");
    }
  }

  function dataTarget(name, valueType = "resource") {
    const matched = dataElements.get(String(name));
    return matched ? reference("data", matched.kind, matched.key) : literal(valueType, name);
  }

  for (const behavior of analysis.behaviors ?? []) {
    const door = behavior.door ?? {};
    if (door.kind === "ui_action") {
      const componentKey = String(door.component);
      const actionKey = `${componentKey}:${door.event}:${door.action}`;
      const common = { evidence: door.evidence, observationMethod: "ast", claimState: "observed" };
      addElement({ subsystemKey: "ui", subsystemName: "UI", key: componentKey, kind: "component", roles: ["interface"], name: door.component, capability: "ui.component", ...common });
      addElement({ subsystemKey: "ui", subsystemName: "UI", key: actionKey, kind: "action", roles: ["behavior"], name: `${door.component} ${actionName(door.action)}`, capability: "ui.action", ...common });
      expose("ui", "component", componentKey, door.evidence, "ui.component", "contains");
      addClaim({ source: source("ui", "component", componentKey), relation: "offers", target: reference("ui", "action", actionKey), slot: `action:${actionKey}`, evidence: door.evidence, capability: "ui.action", observationMethod: "ast" });
      addClaim({ source: source("ui", "action", actionKey), relation: "triggered_by", target: literal("event", door.event), slot: "trigger", qualifiers: { event: door.event }, evidence: door.evidence, capability: "ui.action", observationMethod: "ast" });
      for (const guard of behavior.guards ?? []) {
        if (guard.kind !== "disabled_when") continue;
        addClaim({ source: source("ui", "action", actionKey), relation: "available_when", target: literal("condition", inverted(guard.condition)), slot: "availability", evidence: guard.evidence, observationMethod: methodFor(guard), claimState: stateFor(guard), capability: "ui.availability" });
      }
      continue;
    }

    const key = normalizeHttpKey(door.method, door.path);
    const behaviorSource = source("api", "operation", key);
    addElement({ subsystemKey: "api", subsystemName: "API", key, kind: "operation", roles: ["interface", "behavior"], name: key, evidence: door.evidence, observationMethod: "semantic", claimState: "observed", capability: "api.operation" });
    expose("api", "operation", key, door.evidence, "api.operation");

    for (const clause of behavior.takes ?? []) {
      const name = clause.schema ?? clause.name ?? "unknown input";
      addClaim({ source: behaviorSource, relation: "accepts", target: dataTarget(name, "contract"), slot: `input:${name}`, evidence: clause.evidence, observationMethod: methodFor(clause), claimState: stateFor(clause), capability: "api.input" });
    }
    for (const clause of behavior.gives ?? []) {
      const name = clause.schema ?? clause.name ?? "unknown output";
      addClaim({ source: behaviorSource, relation: "produces", target: dataTarget(name, "contract"), slot: "response", evidence: clause.evidence, observationMethod: methodFor(clause), claimState: stateFor(clause), capability: "api.output" });
    }
    for (const clause of behavior.requires ?? []) {
      addClaim({ source: behaviorSource, relation: "requires", target: literal("condition", clause.name ?? "unknown requirement"), slot: `requirement:${clause.kind ?? "dependency"}:${clause.name}`, evidence: clause.evidence, observationMethod: methodFor(clause), claimState: stateFor(clause), capability: "api.condition" });
    }
    for (const clause of behavior.reads ?? []) {
      addClaim({ source: behaviorSource, relation: "reads", target: dataTarget(clause.target ?? clause.detail ?? "unknown resource"), slot: `read:${clause.medium ?? "unknown"}:${clause.target ?? clause.detail}`, qualifiers: clause.medium ? { storage: clause.medium } : {}, evidence: clause.evidence, observationMethod: methodFor(clause), claimState: stateFor(clause), capability: "api.effect" });
    }
    for (const clause of behavior.writes ?? []) {
      addClaim({ source: behaviorSource, relation: "changes", target: dataTarget(clause.target ?? clause.detail ?? "unknown resource"), slot: `change:${clause.medium ?? "unknown"}:${clause.target ?? clause.detail}`, qualifiers: clause.medium ? { storage: clause.medium } : {}, evidence: clause.evidence, observationMethod: methodFor(clause), claimState: stateFor(clause), capability: "api.effect" });
    }
    for (const clause of behavior.fails ?? []) {
      addClaim({ source: behaviorSource, relation: "fails_with", target: literal("outcome", outcomeValue(clause)), slot: `failure:${clause.status ?? clause.reason}`, qualifiers: clause.status == null ? {} : { http_status: String(clause.status) }, evidence: clause.evidence, observationMethod: methodFor(clause), claimState: stateFor(clause), capability: "api.failure" });
    }
    for (const clause of behavior.untraced ?? []) {
      diagnostics.push({ code: "untraced-call", severity: "warning", message: `Could not trace ${clause.call ?? "call"}`, analyzerId: COMPAT_ANALYZER_ID, capability: "api.effect", scopeId: null, evidence: clause.evidence ?? [] });
    }
  }

  const populatedLenses = new Set(subsystems.keys());
  const model = createSystemModel({
    systemName,
    subsystems: [...subsystems.values()],
    elements,
    claims,
    coverage: projectCoverage(analysis, populatedLenses),
    diagnostics,
  });
  return validateSystemModel(model);
}
