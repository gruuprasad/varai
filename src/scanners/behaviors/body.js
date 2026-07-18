import { classifyAttributeEffect, classifyNamedEffect, isFileWriteName } from "./effects.js";
const STATUS_RE = /HTTP_(\d{3})\b/;

export async function traceBody(fnNode, file, ctx, resolver, factIndex) {
  const acc = { reads: [], writes: [], fails: [], untraced: [], helperCalls: [], trunkCall: null };
  await walk(fnNode, file, ctx, resolver, factIndex, acc, 0, new Set());
  return acc;
}

async function walk(fnNode, file, ctx, resolver, factIndex, acc, depth, seen) {
  const body = fnNode.childForFieldName("body");
  if (!body) return;

  for (const raise of body.descendantsOfType("raise_statement")) {
    const text = raise.text;
    const line = raise.startPosition.row + 1;
    const named = text.match(STATUS_RE);
    const numeric = text.match(/status_code\s*=\s*(\d{3})/) || text.match(/HTTPException\(\s*(\d{3})/);
    const status = named ? Number(named[1]) : numeric ? Number(numeric[1]) : null;
    if (status && !acc.fails.some((f) => f.status === status)) {
      acc.fails.push({ status, evidence: { file, line }, layer: "ast" });
    }
  }

  for (const call of body.descendantsOfType("call")) {
    const callee = call.childForFieldName("function");
    if (!callee) continue;
    const line = call.startPosition.row + 1;

    if (callee.type === "attribute") {
      const method = callee.childForFieldName("attribute").text;
      const receiver = callee.childForFieldName("object");
      const receiverText = receiver.text;

      const effect = classifyAttributeEffect({ method, receiver, call, firstArgIdent, firstArgModel,
        chainedTarget: extractChainedQueryTarget, modelNames: factIndex.modelNames });
      if (effect) {
        const { access, observationMethod, ...payload } = effect;
        acc[access === "read" ? "reads" : "writes"].push({ ...payload, evidence: { file, line }, layer: observationMethod });
      }
      continue;
    }

    if (callee.type !== "identifier") continue;
    const name = callee.text;

    const namedEffect = classifyNamedEffect(name);
    if (namedEffect) {
      const { observationMethod, access, ...payload } = namedEffect;
      acc.writes.push({ ...payload, evidence: { file, line }, layer: observationMethod });
    }

    const resolved = await resolver.resolveFunction(file, name);
    if (resolved) {
      if (acc.trunkCall === null) acc.trunkCall = name;
      if (!acc.helperCalls.includes(name)) acc.helperCalls.push(name);
      const key = `${resolved.file}::${name}`;
      if (depth < 2 && !seen.has(key)) {
        seen.add(key);
        await walk(resolved.node, resolved.file, ctx, resolver, factIndex, acc, depth + 1, seen);
      }
    } else if (depth === 0 && !isFileWriteName(name) && !KNOWN_NOISE.has(name)
               && !factIndex.schemaNames.has(name) && !/Response$/.test(name)) {
      acc.untraced.push({ call: name, reason: "external package / depth limit", evidence: { file, line } });
    }
  }
}

const KNOWN_NOISE = new Set(["HTTPException", "len", "str", "int", "float", "bool", "dict", "list", "set", "tuple", "print", "range", "enumerate", "zip", "sorted", "min", "max", "sum", "any", "all", "isinstance", "getattr", "setattr", "hasattr"]);

function firstArgIdent(call) {
  const args = call.childForFieldName("arguments");
  if (!args) return null;
  for (const a of args.namedChildren) if (a.type === "identifier") return a.text;
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
    const nm = callee ? callee.text : "";
    if (modelNames.has(nm)) return nm;
  }
  return null;
}

function extractChainedQueryTarget(node, modelNames) {
  // Walk a chained expression like db.query(X).filter(...) to find X.
  if (!node) return null;
  if (node.type === "call") {
    const callee = node.childForFieldName("function");
    if (callee && callee.type === "attribute") {
      const method = callee.childForFieldName("attribute").text;
      if (method === "query") return firstArgIdent(node);
      return extractChainedQueryTarget(callee.childForFieldName("object"), modelNames);
    }
  }
  if (node.type === "attribute") {
    return extractChainedQueryTarget(node.childForFieldName("object"), modelNames);
  }
  return null;
}
