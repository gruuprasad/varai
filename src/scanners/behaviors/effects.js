const FILE_WRITE_RE = /(?:dump|persist|save|write|snapshot)/i;
const MUTATION_RE = /^(?:add|append|apply|archive|assign|attach|bind|clear|create|delete|detach|discard|edit|import|insert|merge|move|mutate|patch|persist|pop|push|remove|rename|replace|reset|save|set|update|write)(?:_|$)/i;
const READ_RE = /^(?:build|calculate|compute|derive|ensure|export|fetch|find|get|load|open|project|read|render|resolve|select|serialize|validate)(?:_|$)/i;
const LOAD_RETURN_RE = /^(?:ensure|fetch|find|get|load|open|read|select)(?:_|$)/i;

export function classifyAttributeEffect({ method, receiver, call, firstArgIdent, firstArgModel, chainedTarget, modelNames, receiverType = null }) {
  const receiverText = receiver.text;
  if (method === "query") {
    const arg = firstArgIdent(call);
    return { access: "read", target: arg && modelNames.has(arg) ? arg : receiverText, kind: "db_model", medium: "db", via: `${receiverText}.query`, observationMethod: "semantic" };
  }
  if (method === "delete") {
    const target = receiver.type === "identifier" ? (firstArgIdent(call) || null) : chainedTarget(receiver, modelNames);
    return { access: "write", relation: "removes", target, kind: "db_model", medium: "db", via: `${receiverText}.delete`, observationMethod: "semantic" };
  }
  if (["add", "commit", "refresh"].includes(method) && receiver.type === "identifier") {
    const target = method === "add" ? firstArgModel(call, modelNames) : null;
    // A db write that names no subject is ceremony: commit/refresh are the
    // transaction flush, and an `.add()` whose argument is not a known model is
    // almost always a local set/dict add. Keep it as implementation evidence but
    // flag it so the model does not surface `changes unknown`.
    const mechanism = !target;
    return { access: "write", relation: method === "add" ? "creates" : "changes", target, kind: "db_model", medium: "db", via: `${receiverText}.${method}`, observationMethod: "semantic", ...(mechanism ? { mechanism: true } : {}) };
  }
  if (/^(?:write_bytes|write_text)$/.test(method) ||
      (receiverType === "Path" && /^(?:touch|rename|replace|unlink)$/.test(method))) {
    return { access: "write", target: "file", kind: "file", medium: "file", via: `${receiverText}.${method}`, observationMethod: "semantic" };
  }
  if (receiverType && MUTATION_RE.test(method)) {
    return { access: "write", target: receiverType, kind: "aggregate", medium: "memory", via: `${receiverText}.${method}`, observationMethod: "semantic" };
  }
  if (receiverType && READ_RE.test(method)) {
    return { access: "read", target: receiverType, kind: "aggregate", medium: "memory", via: `${receiverText}.${method}`, observationMethod: "semantic" };
  }
  return null;
}

export function classifyNamedEffect(name, target = null) {
  const semanticName = normalizeOperationName(name);
  if (target && MUTATION_RE.test(semanticName)) {
    // A named in-memory operation proves that the aggregate changes. Its verb
    // alone does not prove aggregate creation/removal; member lifecycle is
    // lifted separately from typed containment, and persistence helpers carry
    // their own stronger create/remove evidence.
    return { access: "write", relation: "changes", target, kind: "aggregate", medium: "memory", detail: name, observationMethod: "semantic" };
  }
  if (target && READ_RE.test(semanticName)) {
    return { access: "read", target, kind: "aggregate", medium: "memory", detail: name, observationMethod: "semantic" };
  }
  if (!FILE_WRITE_RE.test(name)) return null;
  return { access: "write", target: "file", kind: "file", medium: "file", detail: name, observationMethod: "heuristic" };
}

export function isFileWriteName(name) { return FILE_WRITE_RE.test(name); }
export function operationAccess(name) {
  const semanticName = normalizeOperationName(name);
  if (MUTATION_RE.test(semanticName)) return "write";
  if (READ_RE.test(semanticName)) return "read";
  return null;
}
export function operationEffectRelation(name) {
  const semanticName = normalizeOperationName(name);
  if (/^(?:add|create|insert)(?:_|$)/i.test(semanticName)) return "creates";
  if (/^(?:delete|discard|remove)(?:_|$)/i.test(semanticName)) return "removes";
  if (MUTATION_RE.test(semanticName)) return "changes";
  return null;
}
export function returnRepresentsReadTarget(name) { return LOAD_RETURN_RE.test(name); }

function normalizeOperationName(name) { return String(name ?? "").replace(/^_+/, ""); }
