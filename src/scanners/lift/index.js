import { buildSystemModel } from "../../system-model/build.js";
import { buildCoverage, MODEL_BUILDER_ID } from "../../system-model/coverage.js";
import { SYSTEM_MODEL_ANALYZER_VERSION } from "../../system-model/version.js";
import { elementId, subsystemId, systemId } from "../../system-model/identity.js";
import { resolveDependencyEdges, pythonScopedSubsystemKeys } from "./dependency-edges.js";
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

function readableAvailableCondition(value) {
  const normalized = String(value ?? "condition").trim();
  const groupedNegative = normalized.match(/^!\((.*)\)$/);
  if (groupedNegative) return `not ${readableCondition(groupedNegative[1])}`;
  if (normalized.startsWith("!")) return `not ${readableCondition(normalized.slice(1))}`;
  return readableCondition(normalized);
}

function conditionalRequirement(condition) {
  const match = String(condition ?? "").match(/^(.+?)\s*&&\s*!([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)$/);
  if (!match) return null;
  return `${readableCondition(match[2])} when ${readableCondition(match[1])}`;
}

function applicationOperationName(candidate) {
  const subjectTerms = String(candidate.subject ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const boundaryTerms = new Set([...subjectTerms, "model"]);
  let value = String(candidate.name ?? candidate.relation ?? "operation").replace(/^_+/, "");
  const suffix = value.match(/_(?:in|to|from)_([a-z0-9]+)$/i);
  if (suffix && boundaryTerms.has(suffix[1].toLowerCase())) value = value.slice(0, suffix.index);
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function applicationOperationKey(candidate) {
  return `${candidate.relation}:${candidate.subject}:${candidate.resource}:${String(candidate.name).toLowerCase()}`;
}

export function matchingApiBehavior(invocation, behaviors) {
  const exactKey = normalizeHttpKey(invocation.method, invocation.path);
  const candidates = behaviors.filter((candidate) => candidate.door?.kind !== "ui_action" &&
    String(candidate.door?.method ?? "").toUpperCase() === String(invocation.method ?? "").toUpperCase());
  const exact = candidates.find((candidate) => normalizeHttpKey(candidate.door?.method, candidate.door?.path) === exactKey);
  if (exact) return exact;

  const invocationPath = String(invocation.path ?? "");
  // UI wildcard patterns (*/storeys) against concrete or {param} doors.
  if (invocationPath.includes("*")) {
    const matches = candidates.filter((candidate) =>
      pathPatternMatches(invocationPath, candidate.door?.path));
    return matches.length === 1 ? matches[0] : null;
  }

  // Concrete UI paths against patterned doors (Next * or FastAPI {param}).
  const patterned = candidates.filter((candidate) => {
    const doorPath = String(candidate.door?.path ?? "");
    if (!doorPath.includes("*") && !/\{[^}]+\}/.test(doorPath)) return false;
    return pathPatternMatches(doorPathToPattern(doorPath), invocationPath);
  });
  return patterned.length === 1 ? patterned[0] : null;
}

function doorPathToPattern(routePath) {
  return String(routePath ?? "").replace(/\{[^}]+\}/g, "*");
}

function pathPatternMatches(pattern, routePath) {
  const patternSegments = String(pattern ?? "").split("/").filter(Boolean);
  const routeSegments = String(routePath ?? "").split("/").filter(Boolean);
  const leadingRemainder = patternSegments[0] === "*";
  const comparable = leadingRemainder ? patternSegments.slice(1) : patternSegments;
  if (routeSegments.length < comparable.length) return false;
  if (!leadingRemainder && routeSegments.length !== comparable.length) return false;
  const routeTail = leadingRemainder ? routeSegments.slice(-comparable.length) : routeSegments;
  return comparable.every((segment, index) => segment === "*" || segment === routeTail[index]);
}

function outcomeValue(clause) {
  if (clause.status != null && clause.reason) return `${clause.status}: ${clause.reason}`;
  return String(clause.status ?? clause.reason ?? "unknown failure");
}

export function liftSystemModel({ observations, behaviors, registry, convergence, containment = [], diagnostics = [], importEdges = [], scanContext }, options = {}) {
  const subsystems = new Map();
  const elements = [];
  const claims = [];
  const promoted = new Map();
  const publicContracts = boundaryContractNames(behaviors);
  const applicationCalls = behaviors.flatMap((behavior) => behavior.applicationCalls ?? []);
  const applicationSubjectIds = new Set(applicationCalls.map((item) => item.subjectDeclarationId));
  const applicationResourceIds = new Set(applicationCalls.map((item) => item.resourceDeclarationId));

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
    const applicationSubject = applicationSubjectIds.has(declaration.id);
    const containedResource = applicationResourceIds.has(declaration.id);
    if (!declaration.persisted && !converged && !boundaryContract && !applicationSubject && !containedResource) continue;
    const kind = declaration.persisted || containedResource ? "entity" : applicationSubject ? "aggregate" : boundaryContract ? "contract" : "aggregate";
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
      claimState: containedResource || applicationSubject || (converged && !declaration.persisted && !boundaryContract) ? "inferred" : "observed",
      capability: declaration.persisted || containedResource ? "data.entity" : applicationSubject ? "data.aggregate" : boundaryContract ? "data.contract" : "data.aggregate",
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

  const containmentPairs = new Set();
  for (const candidate of applicationCalls) {
    const owner = promoted.get(candidate.subjectDeclarationId);
    const member = promoted.get(candidate.resourceDeclarationId);
    if (!owner || !member || owner.key === member.key) continue;
    const pair = `${owner.declaration.id}:${member.declaration.id}`;
    if (containmentPairs.has(pair)) continue;
    containmentPairs.add(pair);
    addClaim({
      source: source("data", owner.kind, owner.key),
      relation: "contains",
      target: reference("data", member.kind, member.key),
      slot: `contains:${member.kind}:${member.key}`,
      evidence: candidate.containmentEvidence,
      observationMethod: "semantic",
      claimState: "inferred",
      capability: "application.effect",
    });
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

  const emittedApplicationOperations = new Set();
  const emittedArtifacts = new Set();
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
        const visible = guard.kind === "visible_when";
        const requirement = visible ? null : conditionalRequirement(guard.condition);
        addClaim({
          source: source("ui", "action", actionKey),
          relation: requirement ? "requires" : "available_when",
          target: literal("condition", visible ? readableAvailableCondition(guard.condition) : requirement ?? inverted(guard.condition)),
          slot: visible
            ? `visibility:${guard.condition}`
            : `${requirement ? "requirement" : "availability"}:${guard.condition}`,
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
      for (const outcome of behavior.outcomes ?? []) addClaim({
        source: source("ui", "action", actionKey),
        relation: outcome.relation,
        target: literal("location", outcome.target),
        slot: `${outcome.relation}:${outcome.target}`,
        evidence: [outcome.evidence].flat(),
        implementationPath: outcome.implementationPath,
        observationMethod: methodFor(outcome),
        claimState: stateFor(outcome),
        capability: "ui.navigation",
      });
      continue;
    }

    const key = normalizeHttpKey(door.method, door.path);
    const behaviorSource = source("api", "operation", key);
    const doorEvidence = [door.evidence].flat().map((entry) =>
      behavior.handler?.symbol ? { ...entry, symbol: behavior.handler.symbol } : entry);
    addElement({
      subsystemKey: "api", subsystemName: "API", key, kind: "operation", roles: ["interface", "behavior"], name: key,
      evidence: doorEvidence, implementationPath: doorEvidence, observationMethod: "semantic", claimState: "observed", capability: "api.operation",
    });
    expose("api", "operation", key, [door.evidence].flat(), "api.operation");

    for (const artifact of behavior.artifactOutputs ?? []) {
      const artifactKey = `artifact:${artifact.key}`;
      const artifactSource = source("data", "artifact", artifactKey);
      if (!emittedArtifacts.has(artifactKey)) {
        emittedArtifacts.add(artifactKey);
        addElement({
          subsystemKey: "data",
          subsystemName: "Data",
          key: artifactKey,
          kind: "artifact",
          roles: ["resource"],
          name: artifact.name,
          evidence: artifact.evidence,
          implementationPath: artifact.implementationPath,
          observationMethod: "semantic",
          claimState: artifact.bindingState,
          capability: "data.artifact",
        });
        expose("data", "artifact", artifactKey, artifact.evidence, "data.artifact", "contains");
      }
      addClaim({
        source: behaviorSource,
        relation: "produces",
        target: reference("data", "artifact", artifactKey),
        slot: `artifact:${artifactKey}`,
        qualifiers: {
          delivery: artifact.delivery,
          format: artifact.format,
          ...(artifact.mediaType ? { media_type: artifact.mediaType } : {}),
        },
        evidence: artifact.evidence,
        implementationPath: artifact.implementationPath,
        observationMethod: "semantic",
        claimState: artifact.bindingState,
        capability: "api.artifact-output",
      });
    }

    for (const candidate of behavior.applicationCalls ?? []) {
      const aggregate = promoted.get(candidate.subjectDeclarationId);
      const resource = promoted.get(candidate.resourceDeclarationId);
      if (!aggregate || !resource) continue;
      const operationKey = applicationOperationKey(candidate);
      const operationSource = source("application", "operation", operationKey);
      const definitionEvidence = [{ file: candidate.file, line: candidate.line, symbol: candidate.name }];
      if (!emittedApplicationOperations.has(operationKey)) {
        emittedApplicationOperations.add(operationKey);
        addElement({
          subsystemKey: "application",
          subsystemName: "Application",
          key: operationKey,
          kind: "operation",
          roles: ["behavior"],
          name: applicationOperationName(candidate),
          evidence: definitionEvidence,
          implementationPath: candidate.implementationPath,
          observationMethod: "semantic",
          claimState: candidate.bindingState,
          capability: "application.operation",
        });
        expose("application", "operation", operationKey, definitionEvidence, "application.operation", "contains");
        addClaim({
          source: operationSource,
          relation: candidate.relation,
          target: reference("data", resource.kind, resource.key),
          slot: `${candidate.relation}:${resource.key}`,
          evidence: candidate.bindingEvidence,
          implementationPath: candidate.implementationPath,
          observationMethod: "semantic",
          claimState: candidate.bindingState,
          capability: "application.effect",
        });
        if (aggregate.declaration.id !== resource.declaration.id) addClaim({
          source: operationSource,
          relation: "changes",
          target: reference("data", aggregate.kind, aggregate.key),
          slot: `changes:${aggregate.key}`,
          evidence: candidate.bindingEvidence,
          implementationPath: candidate.implementationPath,
          observationMethod: "semantic",
          claimState: candidate.bindingState,
          capability: "application.effect",
        });
      }
      addClaim({
        source: behaviorSource,
        relation: "invokes",
        target: reference("application", "operation", operationKey),
        slot: `invoke:${operationKey}`,
        evidence: [candidate.evidence].flat(),
        implementationPath: candidate.implementationPath,
        observationMethod: "semantic",
        claimState: candidate.bindingState,
        capability: "application.operation",
      });
    }

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
    for (const [collection, defaultRelation] of [["reads", "reads"], ["writes", "changes"]]) {
      for (const clause of behavior[collection] ?? []) {
        // Transaction ceremony (commit/refresh) is implementation evidence in the
        // graph, not a domain effect; it must not surface as `changes unknown`.
        if (clause.mechanism) continue;
        const relation = clause.relation ?? defaultRelation;
        addClaim({
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

  // Resolve raw import edges to Element→Element `depends_on` claims. Element ids
  // are derived here exactly as canonicalize.js will, so the resolver can
  // attribute edges by owning Element before the model is assembled.
  const rootId = systemId(options.systemKey ?? "repository-root");
  const subsystemIdByKey = new Map();
  for (const key of subsystems.keys()) {
    subsystemIdByKey.set(key, subsystemId(rootId, { lens: key, key }));
  }
  const identifiedElements = elements.map((element) => ({
    ...element,
    id: elementId({ subsystemId: subsystemIdByKey.get(element.subsystemKey), kind: element.kind, key: element.key }),
  }));
  const dependencyEdges = resolveDependencyEdges({ importEdges, elements: identifiedElements });
  for (const claim of dependencyEdges.claims) addClaim(claim);
  const dependencyDiagnostics = dependencyEdges.diagnostics;

  const finalDiagnostics = dedupeDiagnostics([...diagnostics, ...dependencyDiagnostics].map((item) => ({
    analyzerId: item.analyzerId ?? MODEL_BUILDER_ID,
    capability: item.capability ?? "model.lift",
    scopeId: item.scopeId ?? null,
    evidence: item.evidence ?? [],
    ...item,
  })));
  const populatedLenses = new Set(subsystems.keys());
  // Only subsystems with .py Element evidence were in scope for Python import analysis.
  const archDependencyCoverage = [...pythonScopedSubsystemKeys(identifiedElements)].sort().map((lens) => ({
    analyzerId: MODEL_BUILDER_ID,
    analyzerVersion: SYSTEM_MODEL_ANALYZER_VERSION,
    capability: "arch.dependency",
    scope: { kind: "subsystem", key: lens },
    state: "analyzed",
    evidence: [],
    details: ["Python static imports resolved to owning Elements"],
  }));
  const coverage = [
    ...buildCoverage({ scanContext, behaviors, diagnostics: finalDiagnostics }, populatedLenses),
    ...archDependencyCoverage,
  ];
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
