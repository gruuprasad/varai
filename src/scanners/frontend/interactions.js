import path from "node:path";

const LANG_FOR_EXT = { ".js": "javascript", ".jsx": "javascript", ".ts": "tsx", ".tsx": "tsx" };
const MAX_CALL_DEPTH = 6;

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

  const grouped = new Map();
  for (const [file, tree] of trees) {
    if (!isComponentScope(file)) continue;
    for (const component of exportedComponents(tree.rootNode)) {
      walk(component.node, (node) => {
        if (node.type !== "jsx_opening_element" && node.type !== "jsx_self_closing_element") return;
        const attributes = jsxAttributes(node);
        const event = eventHandler(attributes.get("onClick"), node);
        if (!event) return;
        const key = JSON.stringify([file, component.name, "click", event.action]);
        let behavior = grouped.get(key);
        if (!behavior) {
          behavior = {
            door: { kind: "ui_action", source: file, component: component.name, event: "click", action: event.action, evidence: [] },
            bundle: null, requires: [], takes: [], gives: [], reads: [], writes: [],
            fails: [], untraced: [], guards: [], invokes: [], helperCalls: [], trunkCall: null,
          };
          grouped.set(key, behavior);
        }
        const rootEvidence = { file, line: event.line };
        behavior.door.evidence.push(rootEvidence);
        for (const condition of disabledConditions(attributes.get("disabled"))) {
          let guard = behavior.guards.find((item) => item.kind === "disabled_when" && item.condition === condition.text);
          if (!guard) {
            guard = { kind: "disabled_when", condition: condition.text, evidence: [], layer: "ast" };
            behavior.guards.push(guard);
          }
          guard.evidence.push({ file, line: condition.line });
        }
        const handler = event.node ?? localHandler(component.node, event.action);
        for (const invocation of handler ? apiInvocations(handler, file, rootEvidence, functions) : []) {
          if (!behavior.invokes.some((item) => item.method === invocation.method && item.path === invocation.path)) behavior.invokes.push(invocation);
        }
      });
    }
  }
  return [...grouped.values()];
}

function indexFunctions(root, file, index) {
  walk(root, (node) => {
    let name = null;
    let value = node;
    if (node.type === "function_declaration") name = node.childForFieldName("name")?.text;
    if (node.type === "variable_declarator") {
      name = node.childForFieldName("name")?.text;
      value = node.childForFieldName("value");
      if (!["arrow_function", "function_expression"].includes(value?.type)) name = null;
    }
    if (!name) return;
    const entries = index.get(name) ?? [];
    entries.push({ name, file, node: value });
    index.set(name, entries);
  });
}

function eventHandler(expression, openingNode) {
  const child = expressionValue(expression);
  if (child?.type === "identifier") return { action: child.text, line: expression.startPosition.row + 1, node: null };
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
      const value = node.childForFieldName("value");
      if (["arrow_function", "function_expression"].includes(value?.type)) found = value;
    }
  });
  return found;
}

function apiInvocations(handler, file, rootEvidence, functions) {
  const result = [];
  const visited = new Set();
  function trace(node, currentFile, implementationPath, depth) {
    if (depth > MAX_CALL_DEPTH) return;
    walkCalls(node, (call) => {
      const fn = call.childForFieldName("function");
      const args = call.childForFieldName("arguments")?.namedChildren ?? [];
      if (!fn) return;
      const evidence = { file: currentFile, line: call.startPosition.row + 1 };
      const transport = transportInvocation(fn, args);
      if (transport) {
        result.push({ ...transport, evidence, implementationPath: [...implementationPath, evidence], layer: "ast" });
        return;
      }
      if (fn.type !== "identifier") return;
      const candidates = functions.get(fn.text) ?? [];
      if (candidates.length !== 1) return;
      const target = candidates[0];
      const key = `${target.file}:${target.name}`;
      if (visited.has(key)) return;
      visited.add(key);
      trace(target.node, target.file, [...implementationPath, evidence], depth + 1);
    });
  }
  trace(handler, file, [rootEvidence], 0);
  return result;
}

function transportInvocation(fn, args) {
  let method = null;
  if (fn.type === "identifier" && (fn.text === "fetch" || /Fetch$/.test(fn.text))) {
    method = (args[1]?.text.match(/\bmethod\s*:\s*["']([A-Za-z]+)["']/)?.[1] ?? "GET").toUpperCase();
  } else if (fn.type === "member_expression") {
    const property = fn.childForFieldName("property")?.text;
    if (["get", "post", "put", "patch", "delete"].includes(property?.toLowerCase())) method = property.toUpperCase();
  }
  if (!method || !args.length) return null;
  const routePath = routePattern(args[0]);
  return routePath ? { method, path: routePath } : null;
}

function routePattern(node) {
  if (!node || !["string", "string_fragment", "template_string"].includes(node.type)) return null;
  if (node.type !== "template_string") return node.text.replace(/^["'`]|["'`]$/g, "");
  return node.text.replace(/^`|`$/g, "").replace(/\$\{[^}]+\}/g, "*").replace(/\/{2,}/g, "/");
}

function walkCalls(node, visit) {
  if (node.type === "call_expression") visit(node);
  for (const child of node.namedChildren ?? []) walkCalls(child, visit);
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
