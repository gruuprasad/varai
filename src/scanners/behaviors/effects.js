const FILE_WRITE_RE = /(?:dump|persist|save|write|snapshot)/i;

export function classifyAttributeEffect({ method, receiver, call, firstArgIdent, firstArgModel, chainedTarget, modelNames }) {
  const receiverText = receiver.text;
  if (method === "query") {
    const arg = firstArgIdent(call);
    return { access: "read", target: arg && modelNames.has(arg) ? arg : receiverText, kind: "db_model", medium: "db", via: `${receiverText}.query`, observationMethod: "semantic" };
  }
  if (method === "delete") {
    const target = receiver.type === "identifier" ? (firstArgIdent(call) || null) : chainedTarget(receiver, modelNames);
    return { access: "write", target, kind: "db_model", medium: "db", via: `${receiverText}.delete`, observationMethod: "semantic" };
  }
  if (["add", "commit", "refresh"].includes(method) && receiver.type === "identifier") {
    const target = method === "add" ? firstArgModel(call, modelNames) : null;
    return { access: "write", target, kind: "db_model", medium: "db", via: `${receiverText}.${method}`, observationMethod: "semantic" };
  }
  return null;
}

export function classifyNamedEffect(name) {
  if (!FILE_WRITE_RE.test(name)) return null;
  return { access: "write", target: "file", kind: "file", medium: "file", detail: name, observationMethod: "heuristic" };
}

export function isFileWriteName(name) { return FILE_WRITE_RE.test(name); }
