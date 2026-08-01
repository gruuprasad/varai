import { implementationPath } from "../lift/provenance.js";

const DEPENDS_RE = /Depends\(\s*([A-Za-z_]\w*)/;

// Authorization guard vocabulary (plan §4.1): dependency factories whose
// names are auth-shaped are classified as authorization gates with an exact
// condition clause — a string-literal role argument when the call carries
// one, "authenticated" for identity factories, else the factory name itself.
// Names are evidence, never a verdict: an unrecognized guard shape becomes
// `partial` coverage, never a silent absence.
const AUTH_FACTORY_RE = /current_user|auth|token|principal|session|login|guard|require_|permission|role|owner|member/i;
const AUTHENTICATED_RE = /current_user|auth|token|principal|session|login/i;
const DEPENDS_ROLE_ARG_RE = /Depends\(\s*[A-Za-z_]\w*\s*\(\s*["']([^"']+)["']/;

export function classifyAuthorizationGate(depsText) {
  const factory = depsText.match(DEPENDS_RE)?.[1] ?? null;
  if (!factory) return { kind: "unresolved", factory: null };
  if (!AUTH_FACTORY_RE.test(factory)) return { kind: "dependency", factory };
  const roleArg = depsText.match(DEPENDS_ROLE_ARG_RE)?.[1] ?? null;
  const condition = roleArg ?? (AUTHENTICATED_RE.test(factory) ? "authenticated" : factory);
  return { kind: "authorization", factory, condition };
}

// requires: gates (Depends(...)) + config (env-var identifiers referenced in body).
// takes: a parameter whose type annotation matches a known schema name.
// gives: response_model= from the decorator, else a returned *Response constructor.
export function traceSignature(fnNode, decoratorText, file, factIndex, options = {}) {
  const requires = [];
  const authorization = [];
  const authorizationUnresolved = [];
  const takes = [];
  const gives = [];
  const line = (n) => n.startPosition.row + 1;

  const params = fnNode.childForFieldName("parameters");
  if (params) {
    for (const p of params.namedChildren) {
      const typeNode = p.childForFieldName("type");
      const valueNode = p.childForFieldName("value");
      const typeText = typeNode ? typeNode.text : "";
      const valueText = valueNode ? valueNode.text : "";

      const depsText = DEPENDS_RE.test(valueText)
        ? valueText
        : DEPENDS_RE.test(typeText) ? typeText : null;

      if (depsText) {
        const classification = classifyAuthorizationGate(depsText);
        if (classification.kind === "authorization") {
          authorization.push({
            name: classification.factory,
            condition: classification.condition,
            evidence: { file, line: line(p) },
            implementationPath: implementationPath(options.rootEvidence, { file, line: line(p) }),
            layer: "ast",
          });
        } else if (classification.kind === "dependency") {
          requires.push({
            name: classification.factory,
            kind: "dependency",
            evidence: { file, line: line(p) },
            implementationPath: implementationPath(options.rootEvidence, { file, line: line(p) }),
            layer: "ast",
          });
        } else {
          authorizationUnresolved.push({
            reason: "unrecognized-guard-shape",
            evidence: { file, line: line(p) },
          });
        }
        continue;
      }
      if (typeText && factIndex.schemaNames.has(typeText)) {
        takes.push({ schema: typeText, evidence: { file, line: line(p) }, implementationPath: implementationPath(options.rootEvidence, { file, line: line(p) }), layer: "ast" });
      }
    }
  }

  const rm = decoratorText ? decoratorText.match(/response_model\s*=\s*([A-Za-z_]\w*)/) : null;
  if (rm && factIndex.schemaNames.has(rm[1])) {
    gives.push({ schema: rm[1], evidence: { file, line: line(fnNode) }, implementationPath: implementationPath(options.rootEvidence, { file, line: line(fnNode) }), layer: "ast" });
  } else {
    // No response_model: look for a returned constructor (XxxResponse / StreamingResponse).
    const body = fnNode.childForFieldName("body");
    if (body) {
      for (const call of body.descendantsOfType("call")) {
        const callee = call.childForFieldName("function");
        const nm = callee ? callee.text : "";
        if (/Response$/.test(nm) || nm === "StreamingResponse") {
          gives.push({ schema: nm, evidence: { file, line: line(call) }, implementationPath: implementationPath(options.rootEvidence, { file, line: line(call) }), layer: "heuristic" });
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
      requires.push({ name: id.text, kind: "config", evidence: { file, line: line(id) }, implementationPath: implementationPath(options.rootEvidence, { file, line: line(id) }), layer: "semantic" });
    }
  }

  return { requires, takes, gives, authorization, authorizationUnresolved };
}
