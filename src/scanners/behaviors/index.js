import { findHandlers } from "./handlers.js";
import { traceSignature } from "./signature.js";
import { traceBody } from "./body.js";
import { createResolver } from "./resolver.js";
import { clusterBundles } from "./clustering.js";
import { deriveConstructs } from "./constructs.js";

export function buildFactIndex(facts) {
  const schemaNames = new Set();
  const modelNames = new Set();
  const envNames = new Set();
  for (const f of facts) {
    if (f.kind === "schema") schemaNames.add(f.name);
    else if (f.kind === "db_model") modelNames.add(f.name);
    else if (f.kind === "env_var") envNames.add(f.name);
  }
  return { schemaNames, modelNames, envNames };
}

export async function traceBehaviors(repoPath, files, ctx, facts) {
  const routeFacts = facts.filter((f) => f.kind === "api_route");
  const factIndex = buildFactIndex(facts);
  const resolver = createResolver(files, ctx);
  const handlers = await findHandlers(routeFacts, ctx);

  const behaviors = [];
  for (const h of handlers) {
    const decoratorText = decoratorTextFor(h.handlerNode);
    const sig = traceSignature(h.handlerNode, decoratorText, h.file, factIndex);
    const body = await traceBody(h.handlerNode, h.file, ctx, resolver, factIndex);
    behaviors.push({
      door: h.door,
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
  const bundles = clusterBundles(behaviors);
  for (const bundle of bundles) await deriveConstructs(bundle, ctx, resolver);
  return { behaviors, bundles };
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
