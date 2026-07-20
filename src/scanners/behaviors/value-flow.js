// Bounded abstract value-flow for the Python behavior tracer.
//
// It recovers *which declaration* a value refers to and *which callable* an
// identifier is bound to, across unannotated wrappers, callable-valued
// arguments, and nested closures. It is deliberately small: the abstract
// domain is declaration references, callable references, unions of those, and
// `unknown` (with a reason). It performs no general Python evaluation.

const RETURN_DEPTH_BUDGET = 6;

export const unknownV = (reason) => ({ kind: "unknown", reason: reason ?? "unknown" });
export const declarationV = (name, decl) => ({ kind: "declaration", name, decl });
export const callableV = (name, info, capturedEnv) => ({ kind: "callable", name, info, capturedEnv: capturedEnv ?? null });

export function unionV(values) {
  const flat = [];
  let hasUnknown = false;
  for (const value of values.flat()) {
    if (!value) continue;
    if (value.kind === "unknown") { hasUnknown = true; continue; }
    if (value.kind === "union") { hasUnknown = hasUnknown || Boolean(value.hasUnknown); flat.push(...value.values); }
    else flat.push(value);
  }
  const unique = dedupeValues(flat);
  if (unique.length === 0) return unknownV("no-resolved-branch");
  // A single known branch is only certain when no branch was unknown; an
  // unknown alternative must survive so downstream resolution stays honest.
  if (unique.length === 1 && !hasUnknown) return unique[0];
  return { kind: "union", values: unique, hasUnknown };
}

function dedupeValues(values) {
  const seen = new Map();
  for (const value of values) seen.set(valueKey(value), value);
  return [...seen.values()];
}

export function valueKey(value) {
  if (!value) return "unknown";
  if (value.kind === "declaration") return `declaration:${value.name}`;
  if (value.kind === "callable") return `callable:${value.name}:${value.info?.file ?? ""}:${value.info?.line ?? ""}:${captureKey(value.capturedEnv)}`;
  if (value.kind === "union") return `union:${value.values.map(valueKey).sort().join("|")}${value.hasUnknown ? ":?" : ""}`;
  return "unknown";
}

// A bounded, non-recursive signature of the domain-relevant captured bindings
// (declarations and callables). Two closures that share a definition but capture
// different operations or subjects must get distinct identities, or they collide
// in the shared return/seen memos. Nested captures are summarized by identity
// only (no recursion), which also makes self-referential closures safe.
function captureKey(env) {
  if (!env) return "";
  const parts = [];
  for (const [name, value] of env) {
    if (value.kind === "declaration") parts.push(`${name}=d:${value.name}`);
    else if (value.kind === "callable") parts.push(`${name}=c:${value.name}:${value.info?.file ?? ""}:${value.info?.line ?? ""}`);
  }
  return parts.sort().join(";");
}

export function bindingSignature(env) {
  const parts = [];
  for (const [name, value] of env) parts.push(`${name}=${valueKey(value)}`);
  return parts.sort().join(",");
}

export function callableTargets(value) {
  if (!value) return [];
  if (value.kind === "callable") return [value];
  if (value.kind === "union") return value.values.filter((item) => item.kind === "callable");
  return [];
}

// The nearest enclosing function_definition of a node (a node's own scope).
export function nearestFunction(node) {
  let parent = node.parent;
  while (parent) {
    if (parent.type === "function_definition") return parent;
    parent = parent.parent;
  }
  return null;
}

// Descendant nodes of a type that belong directly to fnNode's scope — i.e. not
// nested inside a deeper function_definition.
export function directDescendants(fnNode, type) {
  // Native tree-sitter preserves wrapper identity while web-tree-sitter may
  // return a fresh JS wrapper when walking through `parent`. Compare syntax
  // coordinates as the backend-neutral node identity.
  return fnNode.descendantsOfType(type).filter((node) => sameSyntaxNode(nearestFunction(node), fnNode));
}

function sameSyntaxNode(left, right) {
  if (left === right) return true;
  if (!left || !right || left.type !== right.type) return false;
  return left.startPosition.row === right.startPosition.row &&
    left.startPosition.column === right.startPosition.column &&
    left.endPosition.row === right.endPosition.row &&
    left.endPosition.column === right.endPosition.column;
}

export function createValueFlow({ resolver, budget = 6000 } = {}) {
  let work = 0;
  const returnMemo = new Map();
  const classMemo = new Map();
  const callableMemo = new Map();

  async function classFor(file, name) {
    if (!name || work++ > budget) return null;
    const key = `${file}:${name}`;
    if (classMemo.has(key)) return classMemo.get(key);
    const declaration = await resolver.resolveDeclaration(file, name);
    const value = declaration ? declarationV(declaration.name, declaration) : null;
    classMemo.set(key, value);
    return value;
  }

  // Resolve a free identifier (not env-bound) to a callable abstract value.
  async function resolveFreeCallable(name, file) {
    const key = `${file}:${name}`;
    if (callableMemo.has(key)) return callableMemo.get(key);
    const resolved = await resolver.resolveFunction(file, name);
    const value = resolved
      ? callableV(resolver.describeFunction(resolved.file, resolved.node).name, resolver.describeFunction(resolved.file, resolved.node), null)
      : unknownV("unresolved-function");
    callableMemo.set(key, value);
    return value;
  }

  // Resolve an identifier used in call position to a callable abstract value.
  async function resolveCallable(name, env, file) {
    const bound = env.get(name);
    if (bound && (bound.kind === "callable" || bound.kind === "union")) {
      const targets = callableTargets(bound);
      // An unknown alternative alongside a known target keeps the call ambiguous,
      // so a lone known branch is only certain when nothing unknown accompanied it.
      const uncertain = bound.kind === "union" && Boolean(bound.hasUnknown);
      if (targets.length === 1 && !uncertain) return targets[0];
      if (targets.length >= 1) return { kind: "union", values: targets, hasUnknown: uncertain };
      return unknownV("bound-non-callable");
    }
    return resolveFreeCallable(name, file);
  }

  async function evalExpr(node, env, file) {
    if (!node) return unknownV("missing-expression");
    // Environment bindings were already resolved while the scope was built.
    // Reading one is constant work and must remain available after a costly
    // earlier sibling branch spends the recursive resolution budget.
    if (node.type === "identifier" && env.has(node.text)) return env.get(node.text);
    if (work++ > budget) return unknownV("budget");
    switch (node.type) {
      case "identifier": {
        const asClass = await classFor(file, node.text);
        if (asClass) return asClass;
        const asCallable = await resolveFreeCallable(node.text, file);
        if (asCallable.kind === "callable") return asCallable;
        return unknownV("free-identifier");
      }
      case "parenthesized_expression":
        return evalExpr(node.namedChildren[0], env, file);
      case "conditional_expression": {
        const [consequence, , alternative] = node.namedChildren;
        return unionV([await evalExpr(consequence, env, file), await evalExpr(alternative, env, file)]);
      }
      case "call":
        return evalCall(node, env, file);
      default:
        return unknownV(node.type);
    }
  }

  async function evalCall(callNode, env, file) {
    const callee = callNode.childForFieldName("function");
    if (!callee) return unknownV("missing-callee");
    if (callee.type === "attribute") {
      // ORM query chains retain the declaration selected at their root:
      // query(Entity).filter(...).first() still denotes an Entity value. The
      // chain is private analyzer evidence; only the resolved entity effect is
      // promoted into the System Model.
      const queryTarget = queryDeclarationName(callNode);
      if (queryTarget) return await classFor(file, queryTarget) ?? unknownV("unresolved-query-target");
      return unknownV("attribute-callee");
    }
    if (callee.type !== "identifier") return unknownV("non-identifier-callee");
    const asClass = await classFor(file, callee.text);
    if (asClass) return asClass; // constructor call yields its declaration
    const callable = await resolveCallable(callee.text, env, file);
    if (callable.kind !== "callable" || !callable.info) return unknownV("unresolved-call");
    const argBindings = await bindArguments(callNode, callable.info, env, file);
    return returnValueOf(callable, argBindings, file, 0);
  }

  // Map a call's positional/keyword arguments to the callee's parameters.
  async function bindArguments(callNode, calleeInfo, env, file) {
    const args = callNode.childForFieldName("arguments")?.namedChildren ?? [];
    const params = [...calleeInfo.parameters.keys()];
    const bindings = new Map();
    let positional = 0;
    for (const arg of args) {
      if (arg.type === "keyword_argument") {
        const name = arg.childForFieldName("name")?.text;
        const value = arg.childForFieldName("value");
        if (name && value) bindings.set(name, await evalExpr(value, env, file));
        continue;
      }
      const param = params[positional++];
      if (param) bindings.set(param, await evalExpr(arg, env, file));
    }
    return bindings;
  }

  // Seed a callee environment from argument bindings and parameter annotations.
  async function seedParams(info, argBindings, capturedEnv, file) {
    const env = new Map(capturedEnv ?? []);
    for (const [name, type] of info.parameters) {
      if (argBindings?.has(name)) { env.set(name, argBindings.get(name)); continue; }
      const annotated = type ? await classFor(info.file, type) : null;
      env.set(name, annotated ?? unknownV("unannotated-parameter"));
    }
    return env;
  }

  // Build the full scope environment of a function body: parameters, nested
  // function definitions (as closures capturing this env), and local
  // assignments, evaluated in source order.
  async function buildScopeEnv(info, seedEnv) {
    const env = seedEnv;
    const body = info.node.childForFieldName("body");
    if (!body) return env;
    for (const def of directDescendants(info.node, "function_definition")) {
      if (def === info.node) continue;
      const name = def.childForFieldName("name")?.text;
      if (name) env.set(name, callableV(name, resolver.describeFunction(info.file, def), env));
    }
    for (const assignment of directDescendants(info.node, "assignment")) {
      const left = assignment.childForFieldName("left");
      const right = assignment.childForFieldName("right");
      if (left?.type !== "identifier" || !right) continue;
      env.set(left.text, await evalExpr(right, env, info.file));
    }
    return env;
  }

  // The abstract value a callable returns under the given argument bindings.
  async function returnValueOf(callable, argBindings, file, depth) {
    const info = callable.info;
    if (!info || depth > RETURN_DEPTH_BUDGET || work++ > budget) return unknownV("budget");
    const seed = await seedParams(info, argBindings, callable.capturedEnv, info.file);
    const key = `${info.file}:${info.line}:${bindingSignature(seed)}`;
    if (returnMemo.has(key)) return returnMemo.get(key);
    returnMemo.set(key, unknownV("recursion"));
    const env = await buildScopeEnv(info, seed);
    const returns = directDescendants(info.node, "return_statement");
    const values = [];
    for (const statement of returns) {
      const expr = statement.namedChildren[0];
      if (expr) values.push(await evalExpr(expr, env, info.file));
    }
    let result = values.length ? unionV(values) : unknownV("no-return");
    if (result.kind === "unknown" && info.returnType) {
      const annotated = await classFor(info.file, info.returnType);
      if (annotated) result = annotated;
    }
    returnMemo.set(key, result);
    return result;
  }

  return {
    classFor,
    resolveCallable,
    evalExpr,
    bindArguments,
    seedParams,
    buildScopeEnv,
    returnValueOf,
    // Resolution memos persist across the whole scan; the per-body work counter
    // resets so one shared instance amortizes shared-helper resolution without
    // one route's budget starving the next.
    resetWork: () => { work = 0; },
    stats: () => ({ work, budget, exhausted: work > budget }),
  };
}

function queryDeclarationName(node) {
  if (!node) return null;
  if (node.type === "call") {
    const callee = node.childForFieldName("function");
    if (callee?.type === "attribute") {
      const method = callee.childForFieldName("attribute")?.text;
      if (method === "query") {
        const first = node.childForFieldName("arguments")?.namedChildren?.[0];
        return first?.type === "identifier" ? first.text : null;
      }
      return queryDeclarationName(callee.childForFieldName("object"));
    }
  }
  if (node.type === "attribute") return queryDeclarationName(node.childForFieldName("object"));
  return null;
}
