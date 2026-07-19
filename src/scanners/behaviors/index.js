import { findHandlers } from "./handlers.js";
import { traceSignature } from "./signature.js";
import { traceBody } from "./body.js";
import { createResolver } from "./resolver.js";
import { privateNodeId } from "../lift/implementation-graph.js";

export function buildObservationIndex(observations) {
  const schemaNames = new Set();
  const modelNames = new Set();
  const envNames = new Set();
  for (const f of observations) {
    if (f.kind === "schema") schemaNames.add(f.name);
    else if (f.kind === "db_model") modelNames.add(f.name);
    else if (f.kind === "env_var") envNames.add(f.name);
  }
  return { schemaNames, modelNames, envNames };
}

export async function traceBehaviors(repoPath, files, ctx, observations, options = {}) {
  const routeFacts = observations.filter((f) => f.kind === "api_route");
  const factIndex = buildObservationIndex(observations);
  const resolver = options.resolver ?? createResolver(files, ctx);
  const graph = options.graph ?? null;
  const handlers = await findHandlers(routeFacts, ctx);

  const behaviors = [];
  for (const h of handlers) {
    const handler = resolver.describeFunction(h.file, h.handlerNode);
    const interfaceId = privateNodeId("interface", h.file, `${h.door.method} ${h.door.path}`);
    graph?.addNode({ id: interfaceId, kind: "interface", file: h.file, line: h.door.evidence.line, symbol: `${h.door.method} ${h.door.path}` });
    graph?.addNode({ id: handler.id, kind: "function", file: handler.file, line: handler.line, symbol: handler.name });
    graph?.addEdge({ from: interfaceId, to: handler.id, kind: "binds", evidence: [h.door.evidence] });
    const decoratorText = decoratorTextFor(h.handlerNode);
    const sig = traceSignature(h.handlerNode, decoratorText, h.file, factIndex, { rootEvidence: h.door.evidence });
    const body = await traceBody(h.handlerNode, h.file, ctx, resolver, factIndex, { rootEvidence: h.door.evidence, graph });
    behaviors.push({
      door: h.door,
      handler: { id: handler.id, file: handler.file, line: handler.line, symbol: handler.name },
      bundle: null,
      requires: sig.requires,
      takes: sig.takes,
      gives: sig.gives,
      reads: body.reads,
      writes: body.writes,
      fails: body.fails,
      untraced: body.untraced,
      helperCalls: body.helperCalls,
      trunkCall: body.trunkCall,
    });
  }
  return behaviors;
}

function decoratorTextFor(fnNode) {
  const parent = fnNode.parent;
  if (parent && parent.type === "decorated_definition") {
    for (const child of parent.namedChildren) {
      if (child.type === "decorator") return child.text;
    }
  }
  return "";
}
