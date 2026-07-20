import { classifyAttributeEffect, classifyNamedEffect, isFileWriteName, operationAccess, operationEffectRelation } from "./effects.js";
import { implementationPath } from "../lift/provenance.js";
import { privateNodeId } from "../lift/implementation-graph.js";
import { createValueFlow, callableTargets, bindingSignature, directDescendants } from "./value-flow.js";

const STATUS_RE = /HTTP_(\d{3})\b/;
const MAX_TRACE_DEPTH = 8;

export async function traceBody(fnNode, file, ctx, resolver, factIndex, options = {}) {
  const acc = { reads: [], writes: [], fails: [], untraced: [], helperCalls: [], trunkCall: null, applicationCalls: [] };
  const info = resolver.describeFunction(file, fnNode);
  // Prefer the scan-wide value-flow (shared memos); reset its per-body work
  // counter so the previous route's spend doesn't starve this one.
  const flow = options.flow ?? createValueFlow({ resolver });
  flow.resetWork?.();
  const rootEvidence = options.rootEvidence ?? { file: info.file, line: info.line, symbol: info.name };
  const env = await flow.seedParams(info, null, null, file);
  await walk(info, env, ctx, resolver, factIndex, acc, flow, options.graph, 0, new Set(), implementationPath(rootEvidence));
  return acc;
}

async function walk(info, env, ctx, resolver, factIndex, acc, flow, graph, depth, seen, path) {
  const fnNode = info.node;
  const file = info.file;
  const body = fnNode.childForFieldName("body");
  if (!body) return;

  const currentId = addFunctionNode(graph, info);
  await flow.buildScopeEnv(info, env);

  for (const raise of directDescendants(fnNode, "raise_statement")) {
    const text = raise.text;
    const line = raise.startPosition.row + 1;
    const named = text.match(STATUS_RE);
    const numeric = text.match(/status_code\s*=\s*(\d{3})/) || text.match(/HTTPException\(\s*(\d{3})/);
    const status = named ? Number(named[1]) : numeric ? Number(numeric[1]) : null;
    if (status && !acc.fails.some((failure) => failure.status === status)) {
      acc.fails.push({
        status,
        evidence: { file, line },
        implementationPath: implementationPath(path, { file, line }),
        layer: "ast",
      });
    }
  }

  for (const call of directDescendants(fnNode, "call")) {
    const callee = call.childForFieldName("function");
    if (!callee) continue;
    const line = call.startPosition.row + 1;
    const callEvidence = { file, line };

    if (callee.type === "attribute") {
      const method = callee.childForFieldName("attribute")?.text;
      const receiver = callee.childForFieldName("object");
      if (!method || !receiver) continue;
      const receiverType = receiver.type === "identifier" ? declName(env.get(receiver.text)) : null;
      const effect = classifyAttributeEffect({
        method,
        receiver,
        call,
        firstArgIdent,
        firstArgModel,
        chainedTarget: extractChainedQueryTarget,
        modelNames: factIndex.modelNames,
        receiverType,
      });
      if (effect) {
        // A db `.add()` whose argument value-flow resolves to a declaration is a
        // real ORM insert, not a local-collection add: bind it and un-suppress.
        if (effect.mechanism && method === "add") {
          const arg0 = call.childForFieldName("arguments")?.namedChildren?.[0];
          const decl = arg0 ? declName(await flow.evalExpr(arg0, env, file)) : null;
          if (decl && !isInfrastructureType(decl)) { effect.target = decl; delete effect.mechanism; }
        }
        await recordEffect(effect, callEvidence, path, file, resolver, acc, graph, currentId, depth);
      }
      continue;
    }

    if (callee.type !== "identifier") continue;
    const name = callee.text;

    // Resolve the callable through the value-flow environment (closures, callable
    // parameters) before falling back to name resolution.
    const callable = await flow.resolveCallable(name, env, file);
    const targets = callableTargets(callable);
    // More than one target, or a known target shadowed by an unknown alternative,
    // is ambiguous: report it and invent no subject rather than pick a branch.
    const ambiguous = targets.length > 1 || (callable.kind === "union" && Boolean(callable.hasUnknown));
    if (ambiguous) {
      acc.untraced.push({
        call: name,
        reason: "ambiguous callable target",
        evidence: callEvidence,
        implementationPath: implementationPath(path, callEvidence),
      });
      continue;
    }
    const resolvedInfo = targets.length === 1 ? targets[0].info : null;
    const capturedEnv = targets.length === 1 ? targets[0].capturedEnv : null;

    const access = operationAccess(resolvedInfo?.name ?? name);
    let semanticTarget = null;
    if (access === "write") {
      semanticTarget = await subjectArg(call, resolvedInfo, env, file, flow);
    } else if (access === "read") {
      const returned = await flow.evalExpr(call, env, file);
      semanticTarget = declName(returned) ?? await subjectArg(call, resolvedInfo, env, file, flow);
    }
    const namedEffect = resolvedInfo
      ? (isInfrastructureType(semanticTarget) ? null : semanticTarget ? classifyNamedEffect(resolvedInfo.name ?? name, semanticTarget) : null)
      : classifyNamedEffect(name);
    // The effect derivation reaches the resolved domain operation; record it in the path.
    const effectPath = resolvedInfo
      ? implementationPath(path, callEvidence, { file: resolvedInfo.file, line: resolvedInfo.line, symbol: resolvedInfo.name })
      : path;
    if (namedEffect) await recordEffect(namedEffect, callEvidence, effectPath, file, resolver, acc, graph, currentId, depth);
    const applicationRelation = resolvedInfo && depth <= 1 && semanticTarget
      ? operationEffectRelation(resolvedInfo.name)
      : null;
    if (applicationRelation && isStableApplicationBoundary(resolvedInfo, semanticTarget)) {
      const candidate = {
        name: resolvedInfo.name,
        file: resolvedInfo.file,
        line: resolvedInfo.line,
        relation: applicationRelation,
        subject: semanticTarget,
        returnTypes: resolvedInfo.returnTypes ?? [],
        evidence: callEvidence,
        implementationPath: effectPath,
        layer: "semantic",
      };
      const key = `${candidate.file}:${candidate.line}:${candidate.subject}:${candidate.relation}`;
      if (!acc.applicationCalls.some((item) => `${item.file}:${item.line}:${item.subject}:${item.relation}` === key)) {
        acc.applicationCalls.push(candidate);
      }
    }

    if (resolvedInfo) {
      if (acc.trunkCall === null) acc.trunkCall = name;
      if (!acc.helperCalls.includes(name)) acc.helperCalls.push(name);
      const childId = addFunctionNode(graph, resolvedInfo);
      graph?.addEdge({ from: currentId, to: childId, kind: "calls", evidence: [callEvidence] });
      const argBindings = await flow.bindArguments(call, resolvedInfo, env, file);
      const seed = await flow.seedParams(resolvedInfo, argBindings, capturedEnv, resolvedInfo.file);
      const key = `${resolvedInfo.id}#${bindingSignature(seed)}`;
      const calleeEvidence = { file: resolvedInfo.file, line: resolvedInfo.line, symbol: resolvedInfo.name };
      if (depth < MAX_TRACE_DEPTH && !seen.has(key)) {
        seen.add(key);
        await walk(
          resolvedInfo,
          seed,
          ctx,
          resolver,
          factIndex,
          acc,
          flow,
          graph,
          depth + 1,
          seen,
          implementationPath(path, callEvidence, calleeEvidence),
        );
      } else if (depth >= MAX_TRACE_DEPTH) {
        acc.untraced.push({
          call: name,
          reason: "trace depth limit",
          evidence: callEvidence,
          implementationPath: implementationPath(path, callEvidence),
        });
      }
    } else if (depth === 0 && !isFileWriteName(name) && !KNOWN_NOISE.has(name)
               && !factIndex.schemaNames.has(name) && !/Response$/.test(name)) {
      acc.untraced.push({
        call: name,
        reason: "unresolved function",
        evidence: callEvidence,
        implementationPath: implementationPath(path, callEvidence),
      });
    }
  }
}

function isStableApplicationBoundary(info, subject) {
  if (!info?.name || info.name.startsWith("_") || !subject) return false;
  const operation = info.name.replace(/_in_model$|_to_model$|_from_model$|_model$/g, "");
  if (!/^(?:add|apply|archive|create|delete|discard|edit|insert|merge|move|remove|replace|reset|set|update)_\w+/i.test(operation)) return false;
  return [...info.parameters.values()].includes(subject);
}

function declName(value) {
  return value?.kind === "declaration" ? value.name : null;
}

// Execution contexts, sessions, and connections are mechanism, not domain subjects.
function isInfrastructureType(name) {
  return /(?:Context|Session|Connection|Client)$/.test(name ?? "");
}

// Choose the aggregate a mutation acts on: the declaration-valued argument whose
// parameter/argument names read as a subject, never an execution context.
async function subjectArg(callNode, calleeInfo, env, file, flow) {
  const args = callNode.childForFieldName("arguments")?.namedChildren ?? [];
  const params = calleeInfo ? [...calleeInfo.parameters.keys()] : [];
  const candidates = [];
  let positional = 0;
  for (const arg of args) {
    let parameterName = null;
    let value = null;
    if (arg.type === "keyword_argument") {
      parameterName = arg.childForFieldName("name")?.text ?? null;
      value = await flow.evalExpr(arg.childForFieldName("value"), env, file);
    } else {
      parameterName = params[positional] ?? null;
      positional += 1;
      value = await flow.evalExpr(arg, env, file);
    }
    const name = declName(value);
    if (!name) continue;
    candidates.push({ name, score: targetCandidateScore(parameterName, arg.type === "identifier" ? arg.text : null, name) });
  }
  candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return candidates[0]?.name ?? null;
}

function targetCandidateScore(parameterName, argumentName, typeName) {
  const subject = /(?:document|model|entity|record|resource|state|project|artifact)/i;
  const infrastructure = /(?:Context|Session|Connection|Client)$/;
  let score = 0;
  if (subject.test(parameterName ?? "")) score += 4;
  if (subject.test(argumentName ?? "")) score += 2;
  if (infrastructure.test(typeName)) score -= 4;
  return score;
}

async function recordEffect(effect, evidence, path, file, resolver, acc, graph, currentId, traceDepth) {
  let declaration = effect.target ? await resolver.resolveDeclaration(file, effect.target) : null;
  if (!declaration && effect.target) {
    const candidates = await resolver.findDeclarationsByName(effect.target);
    if (candidates.length === 1) declaration = candidates[0];
  }
  const clause = {
    ...effect,
    ...(declaration ? { target: declaration.name, targetDeclarationId: declaration.id } : {}),
    evidence,
    implementationPath: implementationPath(path, evidence),
    traceDepth,
    layer: effect.observationMethod,
  };
  delete clause.access;
  delete clause.observationMethod;
  const bucket = effect.access === "read" ? acc.reads : acc.writes;
  const existing = bucket.find((item) =>
    item.targetDeclarationId === clause.targetDeclarationId && item.target === clause.target && item.medium === clause.medium &&
    (clause.target != null || item.via === clause.via));
  if (existing) {
    existing.implementationPath = shorterPath(existing.implementationPath, clause.implementationPath);
  } else {
    bucket.push(clause);
  }

  if (graph && currentId) {
    const effectId = privateNodeId("effect", evidence.file, `${evidence.line}:${effect.access}:${effect.target ?? "unknown"}`);
    graph.addNode({ id: effectId, kind: "effect", file: evidence.file, line: evidence.line, symbol: effect.via ?? effect.detail ?? effect.target });
    graph.addEdge({ from: currentId, to: effectId, kind: "targets", evidence: [evidence] });
  }
}

function shorterPath(a = [], b = []) {
  if (!a.length) return b;
  if (!b.length) return a;
  return b.length < a.length ? b : a;
}

function addFunctionNode(graph, info) {
  if (!graph) return info.id;
  graph.addNode({ id: info.id, kind: "function", file: info.file, line: info.line, symbol: info.name });
  return info.id;
}

const KNOWN_NOISE = new Set([
  "HTTPException", "len", "str", "int", "float", "bool", "dict", "list", "set", "tuple", "print",
  "range", "enumerate", "zip", "sorted", "min", "max", "sum", "any", "all", "isinstance", "getattr",
  "setattr", "hasattr",
]);

function firstArgIdent(call) {
  const args = call.childForFieldName("arguments");
  if (!args) return null;
  for (const arg of args.namedChildren) if (arg.type === "identifier") return arg.text;
  return null;
}

function firstArgModel(callNode, modelNames) {
  const args = callNode.childForFieldName("arguments");
  if (!args) return null;
  const first = args.namedChildren[0];
  if (!first) return null;
  if (first.type === "identifier" && modelNames.has(first.text)) return first.text;
  if (first.type === "call") {
    const callee = first.childForFieldName("function");
    const name = callee ? callee.text : "";
    if (modelNames.has(name)) return name;
  }
  return null;
}

function extractChainedQueryTarget(node) {
  if (!node) return null;
  if (node.type === "call") {
    const callee = node.childForFieldName("function");
    if (callee?.type === "attribute") {
      const method = callee.childForFieldName("attribute")?.text;
      if (method === "query") return firstArgIdent(node);
      return extractChainedQueryTarget(callee.childForFieldName("object"));
    }
  }
  if (node.type === "attribute") return extractChainedQueryTarget(node.childForFieldName("object"));
  return null;
}
