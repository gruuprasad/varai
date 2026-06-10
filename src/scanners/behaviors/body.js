const FILE_WRITE_RE = /(?:dump|persist|save|write|snapshot)/i;
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
      const receiver = callee.childForFieldName("object").text;
      if (method === "query" || method === "delete") {
        const arg = firstArgIdent(call);
        const target = arg && factIndex.modelNames.has(arg) ? arg : receiver;
        const bucket = method === "delete" ? acc.writes : acc.reads;
        bucket.push({ target, kind: "db_model", medium: "db", via: `${receiver}.${method}`, evidence: { file, line }, layer: "semantic" });
      } else if (method === "add" || method === "commit" || method === "refresh") {
        acc.writes.push({ target: receiver, kind: "db_model", medium: "db", via: `${receiver}.${method}`, evidence: { file, line }, layer: "semantic" });
      }
      continue;
    }

    if (callee.type !== "identifier") continue;
    const name = callee.text;

    if (FILE_WRITE_RE.test(name)) {
      acc.writes.push({ target: "file", kind: "file", medium: "file", detail: name, evidence: { file, line }, layer: "heuristic" });
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
    } else if (depth === 0 && !FILE_WRITE_RE.test(name) && !KNOWN_NOISE.has(name)
               && !factIndex.schemaNames.has(name) && !/Response$/.test(name)) {
      acc.untraced.push({ call: name, reason: "external package / depth limit", evidence: { file, line } });
    }
  }
}

const KNOWN_NOISE = new Set(["HTTPException", "len", "str", "int", "dict", "list", "print"]);

function firstArgIdent(call) {
  const args = call.childForFieldName("arguments");
  if (!args) return null;
  for (const a of args.namedChildren) if (a.type === "identifier") return a.text;
  return null;
}
