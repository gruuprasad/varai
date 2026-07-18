import path from "node:path";

const LANG_FOR_EXT = { ".js": "javascript", ".jsx": "javascript", ".ts": "tsx", ".tsx": "tsx" };

export async function traceFrontendInteractions(files, ctx) {
  const grouped = new Map();
  for (const file of files) {
    const lang = LANG_FOR_EXT[path.extname(file)];
    if (!lang || !isComponentScope(file)) continue;
    const tree = await ctx.tree(file, lang);
    if (!tree) continue;
    for (const component of exportedComponents(tree.rootNode)) {
      walk(component.node, (node) => {
        if (node.type !== "jsx_opening_element" && node.type !== "jsx_self_closing_element") return;
        const attributes = jsxAttributes(node);
        const event = directIdentifier(attributes.get("onClick"));
        if (!event) return;
        const key = JSON.stringify([file, component.name, "click", event.name]);
        let behavior = grouped.get(key);
        if (!behavior) {
          behavior = {
            door: {
              kind: "ui_action", source: file, component: component.name,
              event: "click", action: event.name, evidence: [],
            },
            bundle: null, requires: [], takes: [], gives: [], reads: [], writes: [],
            fails: [], untraced: [], guards: [], helperCalls: [], trunkCall: null,
          };
          grouped.set(key, behavior);
        }
        behavior.door.evidence.push({ file, line: event.line });
        const disabled = directIdentifier(attributes.get("disabled"));
        if (disabled) {
          let guard = behavior.guards.find((item) => item.kind === "disabled_when" && item.condition === disabled.name);
          if (!guard) {
            guard = { kind: "disabled_when", condition: disabled.name, evidence: [], layer: "ast" };
            behavior.guards.push(guard);
          }
          guard.evidence.push({ file, line: disabled.line });
        }
      });
    }
  }
  return [...grouped.values()];
}

function isComponentScope(file) {
  return /(^|\/)(components|pages)\//.test(file);
}

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
  for (let depth = 0; current && depth < 3; depth += 1, current = current.parent) {
    if (current.type === "export_statement") return true;
  }
  return false;
}

function isComponentName(name) {
  return /^[A-Z][A-Za-z0-9]*$/.test(name ?? "");
}

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

function directIdentifier(expression) {
  const child = (expression?.namedChildren ?? [])[0];
  if (child?.type !== "identifier") return null;
  return { name: child.text, line: expression.startPosition.row + 1 };
}

function walk(node, visit) {
  visit(node);
  for (const child of node.namedChildren ?? []) walk(child, visit);
}
