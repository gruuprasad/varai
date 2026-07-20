import path from "node:path";

const LANG_FOR_EXT = { ".js": "javascript", ".jsx": "javascript", ".ts": "tsx", ".tsx": "tsx" };
const MAX_CALL_DEPTH = 8;

export async function traceFrontendInteractions(files, ctx) {
  const trees = new Map();
  const functions = new Map();
  for (const file of files) {
    const lang = LANG_FOR_EXT[path.extname(file)];
    if (!lang) continue;
    const tree = await ctx.tree(file, lang);
    if (!tree) continue;
    trees.set(file, tree);
    indexFunctions(tree.rootNode, file, functions);
  }
  const callbackProps = indexCallbackProps(trees);
  const hookBindings = indexHookBindings(trees);
  const refHookBindings = indexRefHookBindings(trees);
  const callableAliases = indexCallableAliases(trees, functions);

  const grouped = new Map();
  for (const [file, tree] of trees) {
    if (!isComponentScope(file)) continue;
    for (const component of exportedComponents(tree.rootNode)) {
      walk(component.node, (node) => {
        if (!isLifecycleEffect(node)) return;
        const callback = callbackFunction(node.childForFieldName("arguments")?.namedChildren?.[0]);
        if (!callback) return;
        const rootEvidence = { file, line: node.startPosition.row + 1 };
        const invocations = apiInvocations(callback, file, rootEvidence, functions, callbackProps, hookBindings, refHookBindings, callableAliases, component.name);
        if (!invocations.length) return;
        const action = firstCalledIdentifier(callback) ?? "Load";
        const key = JSON.stringify([file, component.name, "lifecycle", action]);
        grouped.set(key, {
          door: {
            kind: "ui_action", source: file, component: component.name,
            event: "lifecycle", action, evidence: [rootEvidence],
          },
          bundle: null, requires: [], takes: [], gives: [], reads: [], writes: [],
          fails: [], untraced: [], guards: [], invokes: invocations, helperCalls: [], trunkCall: null,
        });
      });
      walk(component.node, (node) => {
        if (node.type !== "jsx_opening_element" && node.type !== "jsx_self_closing_element") return;
        const attributes = jsxAttributes(node);
        const binding = interactionBinding(node, attributes);
        if (!binding) return;
        const event = eventHandler(binding.expression, node);
        if (!event) return;
        const key = JSON.stringify([file, component.name, binding.event, event.action]);
        let behavior = grouped.get(key);
        if (!behavior) {
          behavior = {
            door: { kind: "ui_action", source: file, component: component.name, event: binding.event, action: event.action, evidence: [] },
            bundle: null, requires: [], takes: [], gives: [], reads: [], writes: [],
            fails: [], untraced: [], guards: [], invokes: [], helperCalls: [], trunkCall: null,
          };
          grouped.set(key, behavior);
        }
        const rootEvidence = { file, line: event.line };
        behavior.door.evidence.push(rootEvidence);
        for (const condition of visibilityConditions(node, component.node)) {
          let guard = behavior.guards.find((item) => item.kind === "visible_when" && item.condition === condition.text);
          if (!guard) {
            guard = { kind: "visible_when", condition: condition.text, evidence: [], layer: "ast" };
            behavior.guards.push(guard);
          }
          guard.evidence.push({ file, line: condition.line });
        }
        for (const condition of disabledConditions(attributes.get("disabled"))) {
          let guard = behavior.guards.find((item) => item.kind === "disabled_when" && item.condition === condition.text);
          if (!guard) {
            guard = { kind: "disabled_when", condition: condition.text, evidence: [], layer: "ast" };
            behavior.guards.push(guard);
          }
          guard.evidence.push({ file, line: condition.line });
        }
        const handler = localHandler(component.node, event.action) ?? event.node;
        for (const invocation of handler
          ? apiInvocations(handler, file, rootEvidence, functions, callbackProps, hookBindings, refHookBindings, callableAliases, component.name)
          : []) {
          if (!behavior.invokes.some((item) => item.method === invocation.method && item.path === invocation.path)) behavior.invokes.push(invocation);
        }
      });
    }
  }
  return [...grouped.values()].flatMap(expandContextualBehaviors);
}

function expandContextualBehaviors(behavior) {
  const contextual = new Map();
  const unscoped = [];
  for (const invocation of behavior.invokes) {
    const context = (invocation.conditions ?? []).map((condition) => modeContext(condition)).find(Boolean);
    if (!context) { unscoped.push(invocation); continue; }
    const values = contextual.get(context.key) ?? { context, invocations: [] };
    values.invocations.push(invocation);
    contextual.set(context.key, values);
  }
  if (!contextual.size) return [behavior];
  const result = [];
  for (const { context, invocations } of contextual.values()) {
    const evidence = invocations.flatMap((item) => item.conditions ?? [])
      .filter((item) => item.text === context.condition).map((item) => item.evidence);
    result.push({
      ...behavior,
      door: { ...behavior.door, action: `${humanize(context.value)} on canvas` },
      guards: [...behavior.guards, {
        kind: "visible_when", condition: context.condition,
        evidence: evidence.length ? evidence : behavior.door.evidence, layer: "ast",
      }],
      invokes: invocations,
    });
  }
  if (unscoped.length) result.push({ ...behavior, invokes: unscoped });
  return result;
}

function modeContext(condition) {
  const match = condition.text.match(/\b((?:[A-Za-z_$][\w$]*\.)*(?:tool|mode|kind))\s*={2,3}\s*["']([\w-]+)["']/);
  if (!match) return null;
  return { key: `${match[1]}:${match[2]}`, value: match[2], condition: condition.text };
}

function humanize(value) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function interactionBinding(node, attributes) {
  if (attributes.get("onClick")) return { event: "click", expression: attributes.get("onClick") };
  if (jsxTagName(node) === "form" && attributes.get("onSubmit")) {
    return { event: "submit", expression: attributes.get("onSubmit") };
  }
  return null;
}

function jsxTagName(node) {
  return (node.namedChildren ?? []).find((item) =>
    item.type === "identifier" || item.type === "member_expression")?.text ?? "";
}

function indexFunctions(root, file, index) {
  walk(root, (node) => {
    let name = null;
    let value = node;
    if (node.type === "function_declaration") name = node.childForFieldName("name")?.text;
    if (node.type === "variable_declarator") {
      name = node.childForFieldName("name")?.text;
      value = callbackFunction(node.childForFieldName("value"));
      if (!value) name = null;
    }
    if (!name) return;
    const entries = index.get(name) ?? [];
    entries.push({ name, file, node: value, owner: enclosingFunctionName(node) });
    index.set(name, entries);
  });
}

function indexCallbackProps(trees) {
  const result = new Map();
  for (const [file, tree] of trees) {
    walk(tree.rootNode, (node) => {
      if (node.type !== "jsx_opening_element" && node.type !== "jsx_self_closing_element") return;
      const component = jsxTagName(node);
      if (!/^[A-Z]/.test(component)) return;
      for (const [name, expression] of jsxAttributes(node)) {
        if (!/^on[A-Z]/.test(name)) continue;
        const value = expressionValue(expression);
        if (!value) continue;
        const key = `${component}:${name}`;
        const entries = result.get(key) ?? [];
        entries.push({ file, node: value });
        result.set(key, entries);
      }
    });
  }
  for (const [key, entries] of result) {
    const production = entries.filter((entry) => !isTestFile(entry.file));
    if (production.length) result.set(key, production);
  }
  return result;
}

function indexHookBindings(trees) {
  const result = new Map();
  for (const [file, tree] of trees) {
    walk(tree.rootNode, (node) => {
      if (node.type !== "variable_declarator") return;
      const name = node.childForFieldName("name")?.text;
      const value = node.childForFieldName("value");
      if (!name || value?.type !== "call_expression") return;
      const hook = value.childForFieldName("function")?.text;
      if (!/^use[A-Z]/.test(hook ?? "")) return;
      const key = `${file}:${name}`;
      const values = result.get(key) ?? new Set();
      values.add(hook);
      result.set(key, values);
    });
  }
  return result;
}

function indexRefHookBindings(trees) {
  const aliases = new Map();
  for (const [, tree] of trees) {
    walk(tree.rootNode, (node) => {
      if (node.type !== "type_alias_declaration") return;
      const match = node.text.match(/\btype\s+([A-Za-z_$][\w$]*)\s*=\s*ReturnType\s*<\s*typeof\s+(use[A-Z][\w$]*)\s*>/);
      if (!match) return;
      const hooks = aliases.get(match[1]) ?? new Set();
      hooks.add(match[2]);
      aliases.set(match[1], hooks);
    });
  }
  const result = new Map();
  for (const [file, tree] of trees) {
    walk(tree.rootNode, (node) => {
      if (node.type !== "variable_declarator") return;
      const name = node.childForFieldName("name")?.text;
      const value = node.childForFieldName("value");
      if (!name || value?.type !== "call_expression" || value.childForFieldName("function")?.text !== "useRef") return;
      const typeName = value.text.match(/^useRef\s*<\s*([A-Za-z_$][\w$]*)/)?.[1];
      const hooks = aliases.get(typeName);
      if (hooks?.size === 1) result.set(`${file}:${name}`, new Set(hooks));
    });
  }
  return result;
}

function indexCallableAliases(trees, functions) {
  const result = new Map();
  for (const [file, tree] of trees) {
    walk(tree.rootNode, (node) => {
      if (node.type !== "variable_declarator") return;
      const name = node.childForFieldName("name")?.text;
      const value = node.childForFieldName("value");
      if (!name || !value || callbackFunction(value) || value.type === "call_expression") return;
      const targets = new Set();
      walk(value, (candidate) => {
        if (candidate.type !== "identifier" || candidate === value) return;
        if (isMemberProperty(candidate) || candidate.text === name) return;
        if ((functions.get(candidate.text) ?? []).length === 1) targets.add(candidate.text);
      });
      if (!targets.size) return;
      result.set(`${file}:${enclosingFunctionName(node) ?? ""}:${name}`, targets);
    });
  }
  return result;
}

function isMemberProperty(node) {
  return node.parent?.type === "member_expression" && node.parent.childForFieldName("property") === node;
}

function enclosingFunctionName(node) {
  let current = node.parent;
  while (current) {
    if (current.type === "function_declaration") return current.childForFieldName("name")?.text ?? null;
    if (current.type === "variable_declarator") {
      const value = callbackFunction(current.childForFieldName("value"));
      if (value && containsNode(value, node)) return current.childForFieldName("name")?.text ?? null;
    }
    current = current.parent;
  }
  return null;
}

function containsNode(boundary, node) {
  return boundary.startIndex <= node.startIndex && boundary.endIndex >= node.endIndex;
}

function callbackFunction(value) {
  if (["arrow_function", "function_expression"].includes(value?.type)) return value;
  if (value?.type !== "call_expression") return null;
  const name = value.childForFieldName("function")?.text;
  if (name !== "useCallback") return null;
  const candidate = value.childForFieldName("arguments")?.namedChildren?.[0];
  return ["arrow_function", "function_expression"].includes(candidate?.type) ? candidate : null;
}

function isLifecycleEffect(node) {
  return node.type === "call_expression" && node.childForFieldName("function")?.text === "useEffect";
}

function eventHandler(expression, openingNode) {
  const child = expressionValue(expression);
  if (child?.type === "identifier") return { action: child.text, line: expression.startPosition.row + 1, node: child };
  if (!["arrow_function", "function_expression"].includes(child?.type)) return null;
  return {
    action: controlLabel(openingNode) || firstCalledIdentifier(child) || "Action",
    line: expression.startPosition.row + 1,
    node: child,
  };
}

function controlLabel(openingNode) {
  const element = openingNode.type === "jsx_opening_element" ? openingNode.parent : openingNode;
  if (element?.type !== "jsx_element") return "";
  const text = [];
  for (const child of element.children ?? []) if (child.type === "jsx_text") text.push(child.text);
  return text.join(" ").replace(/\s+/g, " ").trim();
}

function firstCalledIdentifier(node) {
  let found = null;
  walk(node, (item) => {
    if (found || item.type !== "call_expression") return;
    const fn = item.childForFieldName("function");
    if (fn?.type === "identifier") found = fn.text;
  });
  return found;
}

function disabledConditions(expression) {
  const value = expressionValue(expression);
  if (!value) return [];
  return splitTopLevelOr(value.text).map((text) => ({ text: normalizeExpression(text), line: expression.startPosition.row + 1 })).filter((item) => item.text);
}

function visibilityConditions(node, boundary) {
  const result = [];
  let current = node.type === "jsx_opening_element" ? node.parent : node;
  while (current?.parent && current !== boundary) {
    const parent = current.parent;
    if (parent.type === "ternary_expression") {
      const condition = parent.childForFieldName("condition");
      const consequence = parent.childForFieldName("consequence");
      const alternative = parent.childForFieldName("alternative");
      if (condition && (current === consequence || current === alternative)) {
        const text = current === consequence ? normalizeExpression(condition.text) : negateExpression(condition.text);
        if (text && !["true", "false"].includes(text)) result.push({ text, line: condition.startPosition.row + 1 });
      }
    }
    current = parent;
  }
  return result;
}

function negateExpression(value) {
  const normalized = normalizeExpression(value);
  if (normalized.startsWith("!")) return normalizeExpression(normalized.slice(1));
  return `!(${normalized})`;
}

function splitTopLevelOr(value) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (quote) {
      if (char === quote && value[i - 1] !== "\\") quote = null;
      continue;
    }
    if (["\"", "'", "`"].includes(char)) { quote = char; continue; }
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && char === "|" && value[i + 1] === "|") {
      parts.push(value.slice(start, i));
      start = i + 2;
      i += 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function normalizeExpression(value) {
  let result = String(value).replace(/\s+/g, " ").trim();
  while (result.startsWith("(") && result.endsWith(")") && enclosesWholeExpression(result)) result = result.slice(1, -1).trim();
  return result;
}

function enclosesWholeExpression(value) {
  let depth = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === "(") depth += 1;
    else if (value[i] === ")") depth -= 1;
    if (depth === 0 && i < value.length - 1) return false;
  }
  return depth === 0;
}

function localHandler(componentNode, name) {
  let found = null;
  walk(componentNode, (node) => {
    if (found) return;
    if (node.type === "function_declaration" && node.childForFieldName("name")?.text === name) found = node;
    if (node.type === "variable_declarator" && node.childForFieldName("name")?.text === name) {
      const value = callbackFunction(node.childForFieldName("value"));
      if (value) found = value;
    }
  });
  return found;
}

function apiInvocations(handler, file, rootEvidence, functions, callbackProps, hookBindings, refHookBindings, callableAliases, componentName) {
  const result = [];
  const visited = new Set();
  function trace(node, currentFile, implementationPath, depth, bindings = new Map(), currentOwner = componentName, pathConditions = []) {
    if (depth > MAX_CALL_DEPTH) return;
    if (node.type === "identifier" && /^on[A-Z]/.test(node.text)) {
      const propBindings = callbackProps.get(`${componentName}:${node.text}`) ?? [];
      if (propBindings.length === 1) {
        const binding = propBindings[0];
        trace(binding.node, binding.file, implementationPath, depth + 1, bindings, componentName, pathConditions);
      }
      return;
    }
    if (node.type === "identifier") {
      const candidates = callableCandidates(functions.get(node.text) ?? [], currentFile);
      if (candidates.length === 1) {
        const target = candidates[0];
        const key = `${target.file}:${target.owner ?? ""}:${target.name}:[]`;
        if (!visited.has(key)) {
          visited.add(key);
          trace(target.node, target.file, implementationPath, depth + 1, bindings, target.owner, pathConditions);
        }
      }
      return;
    }
    walkReachableCalls(node, bindings, (call, conditions) => {
      const fn = call.childForFieldName("function");
      const args = call.childForFieldName("arguments")?.namedChildren ?? [];
      if (!fn) return;
      const evidence = { file: currentFile, line: call.startPosition.row + 1 };
      const transport = transportInvocation(fn, args, bindings);
      if (transport) {
        result.push({ ...transport, evidence, implementationPath: [...implementationPath, evidence], conditions, layer: "ast" });
        return;
      }
      let candidates = [];
      if (fn.type === "identifier") {
        candidates = callableCandidates(functions.get(fn.text) ?? [], currentFile);
        if (candidates.length !== 1) {
          const aliases = callableAliases.get(`${currentFile}:${currentOwner ?? ""}:${fn.text}`) ?? new Set();
          candidates = callableCandidates([...aliases].flatMap((name) => functions.get(name) ?? []), currentFile);
        }
        if (candidates.length !== 1 && /^on[A-Z]/.test(fn.text)) {
          const propBindings = callbackProps.get(`${componentName}:${fn.text}`) ?? [];
          if (propBindings.length === 1) {
            const binding = propBindings[0];
            trace(binding.node, binding.file, [...implementationPath, evidence], depth + 1, bindArguments(binding.node, args, bindings), componentName, conditions);
          }
          return;
        }
      } else if (fn.type === "member_expression") {
        const property = fn.childForFieldName("property")?.text;
        const hook = hookOwner(fn.childForFieldName("object"), currentFile, hookBindings)
          ?? refHookOwner(fn.childForFieldName("object"), currentFile, refHookBindings);
        if (property && hook) candidates = callableCandidates(
          (functions.get(property) ?? []).filter((item) => item.owner === hook), currentFile);
      } else return;
      if (candidates.length !== 1) return;
      const target = candidates[0];
      const nextBindings = bindArguments(target.node, args, bindings);
      const key = `${target.file}:${target.owner ?? ""}:${target.name}:${bindingKey(nextBindings)}`;
      if (visited.has(key)) return;
      visited.add(key);
      trace(target.node, target.file, [...implementationPath, evidence], depth + 1, nextBindings, target.owner, conditions);
    }, pathConditions, currentFile);
  }
  trace(handler, file, [rootEvidence], 0);
  return result;
}

function callableCandidates(entries, currentFile) {
  if (entries.length <= 1) return entries;
  const local = entries.filter((entry) => entry.file === currentFile);
  if (local.length === 1) return local;
  const production = entries.filter((entry) => !isTestFile(entry.file));
  return production.length ? production : entries;
}

function isTestFile(file) {
  return /(?:^|\/)(?:__tests__\/|test\/)|(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(file);
}

function callbackParameters(node) {
  const parameters = node?.childForFieldName("parameters")?.namedChildren;
  if (parameters) return parameters;
  const parameter = node?.childForFieldName("parameter");
  return parameter ? [parameter] : [];
}

function bindArguments(node, args, callerBindings) {
  const result = new Map();
  const parameters = callbackParameters(node);
  for (let index = 0; index < parameters.length; index += 1) {
    const name = parameterName(parameters[index]);
    if (!name) continue;
    const value = staticValue(args[index], callerBindings) ?? defaultParameterValue(parameters[index], callerBindings);
    if (value !== undefined) result.set(name, value);
  }
  return result;
}

function parameterName(node) {
  if (node?.type === "identifier" || node?.type === "required_parameter") return node.text.replace(/\??\s*:\s*[\s\S]*$/, "").trim();
  if (["optional_parameter", "assignment_pattern"].includes(node?.type)) {
    return node.childForFieldName("left")?.text ?? node.childForFieldName("name")?.text ?? node.namedChildren?.[0]?.text ?? null;
  }
  return null;
}

function defaultParameterValue(node, bindings) {
  if (!["optional_parameter", "assignment_pattern"].includes(node?.type)) return undefined;
  return staticValue(node.childForFieldName("right") ?? node.childForFieldName("value") ?? node.namedChildren?.at(-1), bindings);
}

function staticValue(node, bindings) {
  if (!node) return undefined;
  if (node.type === "identifier") return bindings.get(node.text);
  if (["string", "string_fragment"].includes(node.type)) return node.text.replace(/^["']|["']$/g, "");
  if (node.type === "true") return true;
  if (node.type === "false") return false;
  if (node.type === "number") return Number(node.text);
  return undefined;
}

function bindingKey(bindings) {
  return JSON.stringify([...bindings].sort(([left], [right]) => left.localeCompare(right)));
}

function hookOwner(object, file, hookBindings) {
  if (object?.type !== "identifier") return null;
  const values = hookBindings.get(`${file}:${object.text}`);
  return values?.size === 1 ? [...values][0] : null;
}

function refHookOwner(object, file, refHookBindings) {
  if (object?.type !== "member_expression" || object.childForFieldName("property")?.text !== "current") return null;
  const ref = object.childForFieldName("object");
  if (ref?.type !== "identifier") return null;
  const values = refHookBindings.get(`${file}:${ref.text}`);
  return values?.size === 1 ? [...values][0] : null;
}

function transportInvocation(fn, args, bindings) {
  let method = null;
  if (fn.type === "identifier" && (fn.text === "fetch" || /(?:Fetch|Request)$/.test(fn.text))) {
    method = (args[1]?.text.match(/\bmethod\s*:\s*["']([A-Za-z]+)["']/)?.[1] ?? "GET").toUpperCase();
  } else if (fn.type === "member_expression") {
    const property = fn.childForFieldName("property")?.text;
    if (["get", "post", "put", "patch", "delete"].includes(property?.toLowerCase())) method = property.toUpperCase();
  }
  if (!method || !args.length) return null;
  const routePath = routePattern(args[0], bindings);
  return routePath && isHttpPath(routePath) ? { method, path: routePath } : null;
}

function isHttpPath(value) {
  return value.startsWith("/") || value.startsWith("*") || /^https?:\/\//.test(value);
}

function routePattern(node, bindings = new Map()) {
  if (!node || !["string", "string_fragment", "template_string"].includes(node.type)) return null;
  if (node.type !== "template_string") return node.text.replace(/^["'`]|["'`]$/g, "");
  return node.text.replace(/^`|`$/g, "").replace(/\$\{([^}]+)\}/g, (_match, expression) => {
    const name = expression.trim();
    return bindings.has(name) ? String(bindings.get(name)) : "*";
  }).replace(/\/{2,}/g, "/");
}

function walkReachableCalls(node, bindings, visit, conditions = [], currentFile = "") {
  if (node.type === "ternary_expression") {
    const selected = selectedBranch(node.childForFieldName("condition"), bindings);
    if (selected !== null) {
      const branch = node.childForFieldName(selected ? "consequence" : "alternative");
      if (branch) walkReachableCalls(branch, bindings, visit, conditions, currentFile);
      return;
    }
    const condition = node.childForFieldName("condition");
    const consequence = node.childForFieldName("consequence");
    const alternative = node.childForFieldName("alternative");
    if (consequence) walkReachableCalls(consequence, bindings, visit,
      [...conditions, conditionObservation(condition, false, currentFile)], currentFile);
    if (alternative) walkReachableCalls(alternative, bindings, visit,
      [...conditions, conditionObservation(condition, true, currentFile)], currentFile);
    return;
  }
  if (node.type === "if_statement") {
    const selected = selectedBranch(node.childForFieldName("condition"), bindings);
    if (selected !== null) {
      const branch = node.childForFieldName(selected ? "consequence" : "alternative");
      if (branch) walkReachableCalls(branch, bindings, visit, conditions, currentFile);
      return;
    }
    const condition = node.childForFieldName("condition");
    const consequence = node.childForFieldName("consequence");
    const alternative = node.childForFieldName("alternative");
    if (consequence) walkReachableCalls(consequence, bindings, visit,
      [...conditions, conditionObservation(condition, false, currentFile)], currentFile);
    if (alternative) walkReachableCalls(alternative, bindings, visit,
      [...conditions, conditionObservation(condition, true, currentFile)], currentFile);
    return;
  }
  if (node.type === "call_expression") visit(node, conditions);
  for (const child of node.namedChildren ?? []) walkReachableCalls(child, bindings, visit, conditions, currentFile);
}

function conditionObservation(node, negated, file) {
  const text = normalizeExpression(node?.text ?? "unknown condition");
  return {
    text: negated ? negateExpression(text) : text,
    evidence: { file, line: (node?.startPosition.row ?? 0) + 1 },
  };
}

function selectedBranch(condition, bindings) {
  if (!condition) return null;
  if (!["binary_expression", "equality_expression"].includes(condition.type)) return null;
  const operator = condition.children?.find((child) => ["===", "==", "!==", "!="].includes(child.type))?.type;
  if (!operator) return null;
  const left = staticValue(condition.childForFieldName("left"), bindings);
  const right = staticValue(condition.childForFieldName("right"), bindings);
  if (left === undefined || right === undefined) return null;
  const equal = left === right;
  return operator === "===" || operator === "==" ? equal : !equal;
}

function isComponentScope(file) { return /(^|\/)(components|pages)\//.test(file); }

function exportedComponents(root) {
  const result = [];
  walk(root, (node) => {
    if (node.type === "function_declaration" && hasExportAncestor(node)) {
      const name = node.childForFieldName("name")?.text;
      if (isComponentName(name)) result.push({ name, node });
      return;
    }
    if (node.type !== "variable_declarator" || !hasExportAncestor(node)) return;
    const name = node.childForFieldName("name")?.text;
    const value = node.childForFieldName("value");
    if (isComponentName(name) && value?.type === "arrow_function") result.push({ name, node: value });
  });
  return result;
}

function hasExportAncestor(node) {
  let current = node.parent;
  for (let depth = 0; current && depth < 3; depth += 1, current = current.parent) if (current.type === "export_statement") return true;
  return false;
}

function isComponentName(name) { return /^[A-Z][A-Za-z0-9]*$/.test(name ?? ""); }

function jsxAttributes(node) {
  const result = new Map();
  for (const child of node.namedChildren ?? []) {
    if (child.type !== "jsx_attribute") continue;
    const children = child.namedChildren ?? [];
    const name = children.find((item) => item.type === "property_identifier")?.text;
    const value = children.find((item) => item.type === "jsx_expression");
    if (name && value) result.set(name, value);
  }
  return result;
}

function expressionValue(expression) { return (expression?.namedChildren ?? [])[0] ?? null; }

function walk(node, visit) {
  visit(node);
  for (const child of node.namedChildren ?? []) walk(child, visit);
}
