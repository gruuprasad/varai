import { classifyAttributeEffect, classifyNamedEffect, isFileWriteName, operationAccess, returnRepresentsReadTarget } from "./effects.js";
import { implementationPath, evidenceForNode } from "../lift/provenance.js";
import { privateNodeId } from "../lift/implementation-graph.js";

const STATUS_RE = /HTTP_(\d{3})\b/;
const MAX_TRACE_DEPTH = 8;

export async function traceBody(fnNode, file, ctx, resolver, factIndex, options = {}) {
  const acc = { reads: [], writes: [], fails: [], untraced: [], helperCalls: [], trunkCall: null };
  const info = resolver.describeFunction(file, fnNode);
  const rootEvidence = options.rootEvidence ?? evidenceForNode(info);
  await walk(info, ctx, resolver, factIndex, acc, options.graph, 0, new Set(), implementationPath(rootEvidence));
  return acc;
}

async function walk(info, ctx, resolver, factIndex, acc, graph, depth, seen, path) {
  const fnNode = info.node;
  const file = info.file;
  const body = fnNode.childForFieldName("body");
  if (!body) return;

  const currentId = addFunctionNode(graph, info);
  const localTypes = new Map(info.parameters);
  await inferAssignedTypes(body, file, resolver, localTypes);

  for (const raise of body.descendantsOfType("raise_statement")) {
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

  for (const call of body.descendantsOfType("call")) {
    const callee = call.childForFieldName("function");
    if (!callee) continue;
    const line = call.startPosition.row + 1;
    const callEvidence = { file, line };

    if (callee.type === "attribute") {
      const method = callee.childForFieldName("attribute")?.text;
      const receiver = callee.childForFieldName("object");
      if (!method || !receiver) continue;
      const receiverType = receiver.type === "identifier" ? localTypes.get(receiver.text) : null;
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
      if (effect) await recordEffect(effect, callEvidence, path, file, resolver, acc, graph, currentId, depth);
      continue;
    }

    if (callee.type !== "identifier") continue;
    const name = callee.text;
    const resolved = await resolver.resolveFunction(file, name);
    const resolvedInfo = resolved ? resolver.describeFunction(resolved.file, resolved.node) : null;
    const typedTarget = await targetTypeForCall(call, localTypes, resolvedInfo, file, resolver);
    const returnedType = resolvedInfo?.returnType ?? null;
    const access = operationAccess(name);
    const semanticTarget = access
      ? (typedTarget ?? (access === "read" && returnRepresentsReadTarget(name) ? returnedType : null))
      : null;
    const namedEffect = resolvedInfo
      ? (semanticTarget ? classifyNamedEffect(name, semanticTarget) : null)
      : classifyNamedEffect(name);
    if (namedEffect) await recordEffect(namedEffect, callEvidence, path, file, resolver, acc, graph, currentId, depth);

    if (resolvedInfo) {
      if (acc.trunkCall === null) acc.trunkCall = name;
      if (!acc.helperCalls.includes(name)) acc.helperCalls.push(name);
      const childId = addFunctionNode(graph, resolvedInfo);
      graph?.addEdge({ from: currentId, to: childId, kind: "calls", evidence: [callEvidence] });
      const key = resolvedInfo.id;
      if (depth < MAX_TRACE_DEPTH && !seen.has(key)) {
        seen.add(key);
        await walk(
          resolvedInfo,
          ctx,
          resolver,
          factIndex,
          acc,
          graph,
          depth + 1,
          seen,
          implementationPath(path, callEvidence, evidenceForNode(resolvedInfo)),
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

async function inferAssignedTypes(body, file, resolver, localTypes) {
  for (const assignment of body.descendantsOfType("assignment")) {
    const left = assignment.childForFieldName("left");
    const right = assignment.childForFieldName("right");
    if (left?.type !== "identifier" || right?.type !== "call") continue;
    const callee = right.childForFieldName("function");
    if (!callee) continue;
    if (callee.type === "identifier") {
      const resolved = await resolver.resolveFunction(file, callee.text);
      const type = resolved ? resolver.describeFunction(resolved.file, resolved.node).returnType : callee.text;
      const declaration = type ? await resolver.resolveDeclaration(resolved?.file ?? file, type) : null;
      if (declaration) localTypes.set(left.text, declaration.name);
    }
  }
}

async function targetTypeForCall(call, localTypes, resolvedInfo, file, resolver) {
  const args = call.childForFieldName("arguments")?.namedChildren ?? [];
  const parameters = [...(resolvedInfo?.parameters?.entries() ?? [])];
  const candidates = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const localType = arg.type === "identifier" ? localTypes.get(arg.text) : null;
    const [parameterName, parameterType] = parameters[index] ?? [null, null];
    const candidate = localType ?? parameterType ?? null;
    if (!candidate) continue;
    const declaration = await resolver.resolveDeclaration(resolvedInfo?.file ?? file, candidate) ??
      await resolver.resolveDeclaration(file, candidate);
    if (!declaration) continue;
    candidates.push({
      name: declaration.name,
      score: targetCandidateScore(parameterName, arg.type === "identifier" ? arg.text : null, declaration.name),
      index,
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.index - b.index || a.name.localeCompare(b.name));
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
