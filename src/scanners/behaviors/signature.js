const DEPENDS_RE = /Depends\(\s*([A-Za-z_]\w*)/;

// requires: gates (Depends(...)) + config (env-var identifiers referenced in body).
// takes: a parameter whose type annotation matches a known schema name.
// gives: response_model= from the decorator, else a returned *Response constructor.
export function traceSignature(fnNode, decoratorText, file, factIndex) {
  const requires = [];
  const takes = [];
  const gives = [];
  const line = (n) => n.startPosition.row + 1;

  const params = fnNode.childForFieldName("parameters");
  if (params) {
    for (const p of params.namedChildren) {
      const typeNode = p.childForFieldName("type");
      const valueNode = p.childForFieldName("value");
      const typeText = typeNode ? typeNode.text : "";

      if (valueNode && DEPENDS_RE.test(valueNode.text)) {
        requires.push({
          name: valueNode.text.match(DEPENDS_RE)[1],
          kind: "dependency",
          evidence: { file, line: line(p) },
          layer: "ast",
        });
        continue;
      }
      if (typeText && factIndex.schemaNames.has(typeText)) {
        takes.push({ schema: typeText, evidence: { file, line: line(p) }, layer: "ast" });
      }
    }
  }

  const rm = decoratorText ? decoratorText.match(/response_model\s*=\s*([A-Za-z_]\w*)/) : null;
  if (rm && factIndex.schemaNames.has(rm[1])) {
    gives.push({ schema: rm[1], evidence: { file, line: line(fnNode) }, layer: "ast" });
  } else {
    // No response_model: look for a returned constructor (XxxResponse / StreamingResponse).
    const body = fnNode.childForFieldName("body");
    if (body) {
      for (const call of body.descendantsOfType("call")) {
        const callee = call.childForFieldName("function");
        const nm = callee ? callee.text : "";
        if (/Response$/.test(nm) || nm === "StreamingResponse") {
          gives.push({ schema: nm, evidence: { file, line: line(call) }, layer: "heuristic" });
          break;
        }
      }
    }
  }

  // config: env-var identifiers referenced anywhere in the function body.
  // Skip names already emitted as dependency gates to avoid duplicate requires entries.
  const seen = new Set(requires.map((r) => r.name));
  for (const id of fnNode.descendantsOfType("identifier")) {
    if (factIndex.envNames.has(id.text) && !seen.has(id.text)) {
      seen.add(id.text);
      requires.push({ name: id.text, kind: "config", evidence: { file, line: line(id) }, layer: "semantic" });
    }
  }

  return { requires, takes, gives };
}
