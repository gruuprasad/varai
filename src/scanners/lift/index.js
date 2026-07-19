import { buildSystemModel } from "../../system-model/build.js";
import { buildCoverage, MODEL_BUILDER_ID } from "../../system-model/coverage.js";
import { boundaryContractNames } from "./contracts.js";

const CONVERGENCE_MIN_BEHAVIORS = 2;

function subsystem(key) {
  return { kind: "subsystem", key };
}

function source(subsystemKey, elementKind, key) {
  return { kind: "element", subsystemKey, elementKind, key };
}

function reference(subsystemKey, elementKind, key) {
  return { kind: "reference", reference: source(subsystemKey, elementKind, key) };
}

function literal(valueType, value) {
  return { kind: "literal", valueType, value: String(value) };
}

function normalizeHttpKey(method, routePath) {
  const normalizedPath = String(routePath ?? "").replace(/\/{2,}/g, "/") || "/";
  return `${String(method ?? "").toUpperCase()} ${normalizedPath}`.trim();
}

function methodFor(item) {
  const value = item?.observationMethod ?? item?.layer ?? "semantic";
  if (value === "file") return "manifest";
  if (value === "heuristic") return "convention";
  return ["ast", "manifest", "semantic", "convention"].includes(value) ? value : "semantic";
}

function stateFor(item) {
  if (item?.bindingState) return item.bindingState;
  return item?.claimState ?? (item?.layer === "heuristic" ? "inferred" : "observed");
}

function actionName(action) {
  if (action === "onClose") return "Dismiss";
  return String(action ?? "Action").replace(/^on(?=[A-Z])/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function inverted(condition) {
  const value = String(condition ?? "unknown").trim();
  if (value.startsWith("!")) return value.slice(1).trim();
  return /&&|\|\|/.test(value) ? `not (${value})` : `not ${value}`;
}

function readableCondition(value) {
  return String(value ?? "condition")
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function conditionalRequirement(condition) {
  const match = String(condition ?? "").match(/^(.+?)\s*&&\s*!([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)$/);
  if (!match) return null;
  return `${readableCondition(match[2])} when ${readableCondition(match[1])}`;
}

function matchingApiBehavior(invocation, behaviors) {
  const exactKey = normalizeHttpKey(invocation.method, invocation.path);
  const candidates = behaviors.filter((candidate) => candidate.door?.kind !== "ui_action" &&
    String(candidate.door?.method ?? "").toUpperCase() === String(invocation.method ?? "").toUpperCase());
  const exact = candidates.find((candidate) => normalizeHttpKey(candidate.door?.method, candidate.door?.path) === exactKey);
  if (exact) return exact;
  if (!String(invocation.path).includes("*")) return null;
  const staticSegments = String(invocation.path).split("/").filter((segment) => segment && segment !== "*");
  const matches = candidates.filter((candidate) => {
    const routeSegments = String(candidate.door?.path ?? "").split("/").filter(Boolean);
    let cursor = 0;
    for (const segment of staticSegments) {
      const next = routeSegments.indexOf(segment, cursor);
      if (next < 0) return false;
      cursor = next + 1;
    }
    return true;
  });
  return matches.length === 1 ? matches[0] : null;
}

function outcomeValue(clause) {
  if (clause.status != null && clause.reason) return `${clause.status}: ${clause.reason}`;
  return String(clause.status ?? clause.reason ?? "unknown failure");
}

export function liftSystemModel({ observations, behaviors, registry, convergence, containment = [], diagnostics = [], scanContext }, options = {}) {
  const subsystems = new Map();
  const elements = [];
  const claims = [];
  const promoted = new Map();
  const publicContracts = boundaryContractNames(behaviors);

  function ensureSubsystem(key, name) {
    if (!subsystems.has(key)) subsystems.set(key, { key, lens: key, name, qualifiers: {}, evidence: [] });
  }

  function addElement(element) {
    ensureSubsystem(element.subsystemKey, element.subsystemName ?? element.subsystemKey);
    elements.push({
      roles: [], qualifiers: {}, evidence: [], observationMethod: "semantic", claimState: "observed", capability: "model.lift",
      ...element,
    });
  }

  function addClaim(claim) {
    claims.push({ qualifiers: {}, evidence: [], observationMethod: "semantic", claimState: "observed", ...claim });
  }

  function expose(lens, kind, key, evidence, capability, relation = "exposes") {
    addClaim({
      source: subsystem(lens), relation, target: reference(lens, kind, key),
      slot: `${relation}:${kind}:${key}`, evidence, capability,
    });
  }

  const declarationsByName = new Map();
  for (const declaration of registry.values()) {
    const list = declarationsByName.get(declaration.name) ?? [];
    list.push(declaration);
    declarationsByName.set(declaration.name, list);
  }

  function declarationKey(declaration, kind) {
    const collisions = declarationsByName.get(declaration.name)?.length ?? 0;
    return collisions > 1 ? `${kind}:${declaration.name}:${declaration.file}` : `${kind}:${declaration.name}`;
  }

  for (const declaration of registry.values()) {
    const converged = (convergence.get(declaration.id)?.size ?? 0) >= CONVERGENCE_MIN_BEHAVIORS;
    const boundaryContract = declaration.schema && publicContracts.has(declaration.name);
    if (!declaration.persisted && !converged && !boundaryContract) continue;
    const kind = declaration.persisted ? "entity" : boundaryContract ? "contract" : "aggregate";
    const key = declarationKey(declaration, kind);
    promoted.set(declaration.id, { key, kind, declaration });
    addElement({
      subsystemKey: "data",
      subsystemName: "Data",
      key,
      kind,
      roles: ["resource"],
      name: declaration.name,
      evidence: [{ file: declaration.file, line: declaration.line, symbol: declaration.name }],
      observationMethod: declaration.persisted || declaration.schema ? "ast" : "semantic",
      claimState: converged && !declaration.persisted && !boundaryContract ? "inferred" : "observed",
      capability: declaration.persisted ? "data.entity" : boundaryContract ? "data.contract" : "data.aggregate",
    });
    expose("data", kind, key, [{ file: declaration.file, line: declaration.line, symbol: declaration.name }], "model.lift", "contains");

    if (boundaryContract) {
      for (const field of declaration.fields) {
        addClaim({
          source: source("data", kind, key),
          relation: "has_field",
          target: literal("field", field.name),
          slot: `field:${field.name}`,
          qualifiers: field.type ? { type: field.type } : {},
          evidence: [field.evidence],
          capability: "data.contract",
          observationMethod: "ast",
        });
      }
    }
  }

  function targetForClause(clause, valueType = "resource") {
    const resolved = promoted.get(clause.targetDeclarationId);
    if (resolved) return reference("data", resolved.kind, resolved.key);
    const contractCandidates = registry.named(clause.schema ?? clause.target ?? clause.name)
      .filter((item) => promoted.has(item.id));
    if (contractCandidates.length === 1) {
      const target = promoted.get(contractCandidates[0].id);
      return reference("data", target.kind, target.key);
    }
    return literal(valueType, clause.schema ?? clause.target ?? clause.name ?? "unknown");
  }

  for (const item of observations) {
    const common = { evidence: item.evidence, observationMethod: methodFor(item), claimState: stateFor(item) };
    if (item.kind === "script") {
      const key = `${item.runner ?? "command"}:${item.name}`;
      addElement({ subsystemKey: "cli", subsystemName: "CLI", key, kind: "command", roles: ["interface", "behavior"], name: item.name, capability: "cli.command", ...common });
      expose("cli", "command", key, item.evidence, "cli.command");
    } else if (item.kind === "service") {
      const key = String(item.name);
      addElement({ subsystemKey: "service", subsystemName: "Services", key, kind: "process", name: item.name, capability: "service.process", ...common });
      expose("service", "process", key, item.evidence, "service.process", "contains");
    } else if (item.kind === "page") {
      const key = String(item.name);
      addElement({ subsystemKey: "ui", subsystemName: "UI", key, kind: "screen", roles: ["interface"], name: item.name, capability: "ui.screen", ...common });
      expose("ui", "screen", key, item.evidence, "ui.screen");
    } else if (item.kind === "state_store") {
      const key = `state:${item.name}`;
      addElement({ subsystemKey: "data", subsystemName: "Data", key, kind: "state", roles: ["resource"], name: item.name, capability: "data.state", ...common });
      expose("data", "state", key, item.evidence, "data.state", "contains");
    }
  }

  for (const behavior of behaviors) {
    const door = behavior.door ?? {};
    if (door.kind === "ui_action") {
      const surfaceKey = String(door.component);
      const actionKey = `${surfaceKey}:${door.event}:${door.action}`;
      const evidence = [door.evidence].flat();
      addElement({ subsystemKey: "ui", subsystemName: "UI", key: surfaceKey, kind: "surface", roles: ["interface"], name: door.component, capability: "ui.surface", evidence, observationMethod: "ast" });
      addElement({ subsystemKey: "ui", subsystemName: "UI", key: actionKey, kind: "action", roles: ["behavior"], name: `${door.component} ${actionName(door.action)}`, capability: "ui.action", evidence, observationMethod: "ast" });
      expose("ui", "surface", surfaceKey, evidence, "ui.surface");
      addClaim({ source: source("ui", "surface", surfaceKey), relation: "offers", target: reference("ui", "action", actionKey), slot: `action:${actionKey}`, evidence, capability: "ui.action", observationMethod: "ast" });
      addClaim({ source: source("ui", "action", actionKey), relation: "triggered_by", target: literal("event", door.event), slot: "trigger", qualifiers: { event: door.event }, evidence, capability: "ui.action", observationMethod: "ast" });
      for (const guard of behavior.guards ?? []) {
        const requirement = conditionalRequirement(guard.condition);
        addClaim({
          source: source("ui", "action", actionKey),
          relation: requirement ? "requires" : "available_when",
          target: literal("condition", requirement ?? inverted(guard.condition)),
          slot: `${requirement ? "requirement" : "availability"}:${guard.condition}`,
          evidence: guard.evidence,
          implementationPath: guard.implementationPath,
          observationMethod: methodFor(guard),
          claimState: stateFor(guard),
          capability: "ui.availability",
        });
      }
      for (const invocation of behavior.invokes ?? []) {
        const matchedBehavior = matchingApiBehavior(invocation, behaviors);
        const targetKey = matchedBehavior
          ? normalizeHttpKey(matchedBehavior.door?.method, matchedBehavior.door?.path)
          : normalizeHttpKey(invocation.method, invocation.path);
        addClaim({
          source: source("ui", "action", actionKey),
          relation: "invokes",
          target: matchedBehavior ? reference("api", "operation", targetKey) : literal("operation", targetKey),
          slot: `invoke:${targetKey}`,
          evidence: [invocation.evidence].flat(),
          implementationPath: invocation.implementationPath,
          observationMethod: methodFor(invocation),
          claimState: matchedBehavior ? "observed" : "unverified",
          capability: "ui.api-link",
        });
      }
      continue;
    }

    const key = normalizeHttpKey(door.method, door.path);
    const behaviorSource = source("api", "operation", key);
    addElement({
      subsystemKey: "api", subsystemName: "API", key, kind: "operation", roles: ["interface", "behavior"], name: key,
      evidence: [door.evidence].flat(), implementationPath: [door.evidence].flat(), observationMethod: "semantic", claimState: "observed", capability: "api.operation",
    });
    expose("api", "operation", key, [door.evidence].flat(), "api.operation");

    for (const clause of behavior.takes ?? []) addClaim({
      source: behaviorSource, relation: "accepts", target: targetForClause(clause, "contract"), slot: `input:${clause.schema ?? clause.name}`,
      evidence: [clause.evidence].flat(), implementationPath: clause.implementationPath, observationMethod: methodFor(clause), claimState: stateFor(clause), capability: "api.input",
    });
    for (const clause of behavior.gives ?? []) addClaim({
      source: behaviorSource, relation: "produces", target: targetForClause(clause, "contract"), slot: "response",
      evidence: [clause.evidence].flat(), implementationPath: clause.implementationPath, observationMethod: methodFor(clause), claimState: stateFor(clause), capability: "api.output",
    });
    for (const clause of behavior.requires ?? []) addClaim({
      source: behaviorSource, relation: "requires", target: literal("condition", clause.name ?? "unknown requirement"), slot: `requirement:${clause.kind ?? "dependency"}:${clause.name}`,
      evidence: [clause.evidence].flat(), implementationPath: clause.implementationPath, observationMethod: methodFor(clause), claimState: stateFor(clause), capability: "api.condition",
    });
    for (const [collection, relation] of [["reads", "reads"], ["writes", "changes"]]) {
      for (const clause of behavior[collection] ?? []) addClaim({
        source: behaviorSource,
        relation,
        target: targetForClause(clause),
        slot: `${relation}:${clause.targetDeclarationId ?? clause.target ?? "unknown"}`,
        qualifiers: clause.medium ? { storage: clause.medium } : {},
        evidence: [clause.evidence].flat(),
        implementationPath: clause.implementationPath,
        observationMethod: methodFor(clause),
        claimState: stateFor(clause),
        capability: "api.effect",
      });
    }
    for (const clause of behavior.fails ?? []) addClaim({
      source: behaviorSource, relation: "fails_with", target: literal("outcome", outcomeValue(clause)), slot: `failure:${clause.status ?? clause.reason}`,
      qualifiers: clause.status == null ? {} : { http_status: String(clause.status) }, evidence: [clause.evidence].flat(), implementationPath: clause.implementationPath,
      observationMethod: methodFor(clause), claimState: stateFor(clause), capability: "api.failure",
    });
  }

  const surfaceKeys = new Set(behaviors
    .filter((item) => item.door?.kind === "ui_action")
    .map((item) => String(item.door.component)));
  const screenKeys = new Set(observations
    .filter((item) => item.kind === "page")
    .map((item) => String(item.name)));
  for (const entry of containment) {
    if (!surfaceKeys.has(entry.surfaceKey) || !screenKeys.has(entry.screen)) continue;
    addClaim({
      source: source("ui", "screen", entry.screen),
      relation: "contains",
      target: reference("ui", "surface", entry.surfaceKey),
      slot: `contains:surface:${entry.surfaceKey}`,
      evidence: entry.evidence,
      capability: "ui.containment",
      observationMethod: "ast",
    });
  }

  const finalDiagnostics = dedupeDiagnostics(diagnostics.map((item) => ({
    analyzerId: item.analyzerId ?? MODEL_BUILDER_ID,
    capability: item.capability ?? "model.lift",
    scopeId: item.scopeId ?? null,
    evidence: item.evidence ?? [],
    ...item,
  })));
  const populatedLenses = new Set(subsystems.keys());
  const coverage = buildCoverage({ scanContext, behaviors, diagnostics: finalDiagnostics }, populatedLenses);
  return buildSystemModel({
    subsystems: [...subsystems.values()], elements, claims, coverage, diagnostics: finalDiagnostics,
  }, options);
}

function dedupeDiagnostics(items) {
  const result = new Map();
  for (const item of items) {
    const key = JSON.stringify({
      code: item.code,
      message: item.message,
      capability: item.capability,
      claimState: item.claimState,
    });
    const current = result.get(key);
    if (!current) result.set(key, { ...item, evidence: [...(item.evidence ?? [])] });
    else current.evidence = mergeDiagnosticEvidence(current.evidence, item.evidence);
  }
  return [...result.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function mergeDiagnosticEvidence(...values) {
  const merged = new Map();
  for (const item of values.flat(Infinity).filter(Boolean)) merged.set(JSON.stringify(item), item);
  return [...merged.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
