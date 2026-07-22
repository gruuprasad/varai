const CLIENT_IDENTS = new Set(["prisma", "db"]);

const WRITE_OPS = new Map([
  ["create", "creates"],
  ["createMany", "creates"],
  ["upsert", "creates"],
  ["update", "changes"],
  ["updateMany", "changes"],
  ["delete", "removes"],
  ["deleteMany", "removes"],
]);

const READ_OPS = new Set([
  "findUnique", "findFirst", "findMany", "findUniqueOrThrow", "findFirstOrThrow",
  "count", "aggregate", "groupBy",
]);

const SKIP_OPS = new Set([
  "$transaction", "$executeRaw", "$executeRawUnsafe", "$queryRaw", "$queryRawUnsafe",
  "$connect", "$disconnect", "$on", "$use", "$extends",
]);

/**
 * Classify Prisma client calls in a TS/JS syntax tree.
 * @param {object} tree tree-sitter tree
 * @param {string} file relative path
 * @param {Map<string, string>} delegateToModel camelCase delegate → PascalCase model
 * @param {{ content?: string }} [options]
 */
export function classifyPrismaEffects(tree, file, delegateToModel, options = {}) {
  const reads = [];
  const writes = [];
  if (!tree?.rootNode || !(delegateToModel instanceof Map) || delegateToModel.size === 0) {
    return { reads, writes };
  }
  const content = options.content ?? "";
  if (content && !looksLikePrismaClientModule(content)) {
    return { reads, writes };
  }

  walk(tree.rootNode, (node) => {
    if (node.type !== "call_expression") return;
    const fn = node.childForFieldName("function");
    if (!fn) return;
    const parsed = parsePrismaCall(fn);
    if (!parsed) return;
    if (SKIP_OPS.has(parsed.op)) return;

    const evidence = {
      file,
      line: node.startPosition.row + 1,
      symbol: `${parsed.client}.${parsed.delegate}.${parsed.op}`,
    };

    if (WRITE_OPS.has(parsed.op)) {
      const model = delegateToModel.get(parsed.delegate);
      if (!model) return;
      writes.push({
        access: "write",
        relation: WRITE_OPS.get(parsed.op),
        target: model,
        kind: "db_model",
        medium: "db",
        via: evidence.symbol,
        observationMethod: "semantic",
        evidence,
        layer: "ast",
      });
      return;
    }

    if (READ_OPS.has(parsed.op)) {
      const model = delegateToModel.get(parsed.delegate);
      if (!model) return;
      reads.push({
        access: "read",
        target: model,
        kind: "db_model",
        medium: "db",
        via: evidence.symbol,
        observationMethod: "semantic",
        evidence,
        layer: "ast",
      });
    }
  });

  return { reads, writes };
}

export function looksLikePrismaClientModule(content) {
  return /@prisma\/client|from\s+['"][^'"]*prisma['"]|require\(\s*['"][^'"]*prisma['"]\s*\)/.test(content);
}

function parsePrismaCall(fnNode) {
  // prisma.dataroom.create  → member(member(prisma, dataroom), create)
  if (fnNode.type !== "member_expression") return null;
  const op = propertyName(fnNode);
  const receiver = fnNode.childForFieldName("object");
  if (!op || !receiver) return null;

  // prisma.$transaction(...) — client-level op, no delegate
  if (SKIP_OPS.has(op) && receiver.type === "identifier" && CLIENT_IDENTS.has(receiver.text)) {
    return { client: receiver.text, delegate: "", op };
  }

  if (receiver.type !== "member_expression") return null;
  const delegate = propertyName(receiver);
  const clientNode = receiver.childForFieldName("object");
  if (!delegate || !clientNode || clientNode.type !== "identifier") return null;
  if (!CLIENT_IDENTS.has(clientNode.text)) return null;
  return { client: clientNode.text, delegate, op };
}

function propertyName(memberNode) {
  const property = memberNode.childForFieldName("property");
  if (!property) return null;
  // property may be property_identifier or private_property_identifier
  return property.text || null;
}

function walk(node, visit) {
  visit(node);
  for (const child of node.namedChildren) walk(child, visit);
}
