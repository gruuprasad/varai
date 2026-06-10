import { queryTree } from "../treesitter.js";

const VERB_TOKENS = new Set(["ensure", "get", "load", "fetch", "build", "persist", "persisted", "resolve", "require"]);
const ID_PARAM_RE = /\{(\w*_id|job_id)\}/;

export async function deriveConstructs(bundle, ctx, resolver) {
  deriveJobScoped(bundle);
  await deriveSubject(bundle, ctx, resolver);
  _deriveDerived(bundle);
  _deriveCeremony(bundle);
}

export function _deriveDerived(bundle) {
  if (!bundle.subject) return;
  const names = new Set();
  for (const b of bundle.behaviors) {
    if (b.writes.length > 0) continue;
    for (const g of b.gives) {
      const short = g.schema.replace(/(Response|View)$/i, "").toLowerCase();
      if (short) names.add(short);
    }
  }
  bundle.derived = [...names];
}

function deriveJobScoped(bundle) {
  const counts = new Map();
  for (const b of bundle.behaviors) {
    const m = b.door.path.match(ID_PARAM_RE);
    if (m) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  }
  let idParam = null;
  for (const [p, c] of counts) if (c >= 2) idParam = p;
  bundle.jobScoped = idParam !== null;
  if (idParam) bundle.idParam = idParam;
}

async function deriveSubject(bundle, ctx, resolver) {
  const trunk = bundle.behaviors[0]?.trunkCall;
  if (!trunk || !bundle.behaviors.every((b) => b.trunkCall === trunk)) return;

  const tokens = trunk.replace(/^_+/, "").split("_");
  while (tokens.length && VERB_TOKENS.has(tokens[0].toLowerCase())) tokens.shift();
  let label = tokens.join("-");

  const file = bundle.behaviors[0].door.evidence.file;
  const resolved = await resolver.resolveFunction(file, trunk);
  const returnVar = resolved ? returnIdentifier(resolved.node) : null;
  if (returnVar && !label.includes(returnVar)) label = `${label} ${returnVar}`;

  const mediums = new Set();
  for (const b of bundle.behaviors) for (const w of b.writes) mediums.add(w.medium);
  const medium = mediums.has("file") ? "file" : mediums.has("db") ? "db" : null;

  bundle.subject = { label: label.trim(), medium, perJob: !!bundle.jobScoped };
}

const CEREMONY_LABELS = [
  [/assert.*rev|revision/i, "check revision"],
  [/persist|dump|save|write/i, "persist"],
  [/undo|snapshot/i, "save undo"],
];

function labelFor(helper) {
  for (const [re, label] of CEREMONY_LABELS) if (re.test(helper)) return label;
  return null;
}

export function _deriveCeremony(bundle) {
  const mutating = bundle.behaviors.filter((b) => b.writes.length > 0);
  if (mutating.length < 3) return;

  const labelCounts = new Map();
  const memberLabels = mutating.map((b) => {
    const labels = new Set(b.helperCalls.map(labelFor).filter(Boolean));
    for (const l of labels) labelCounts.set(l, (labelCounts.get(l) || 0) + 1);
    return labels;
  });

  const threshold = mutating.length * 0.6;
  const ORDER = ["check revision", "persist", "save undo"];
  const steps = [...labelCounts.entries()]
    .filter(([, c]) => c >= threshold)
    .map(([l]) => l)
    .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
  if (steps.length === 0) return;

  let followed = 0;
  const deviants = [];
  memberLabels.forEach((labels, i) => {
    if (steps.every((s) => labels.has(s))) followed++;
    else deviants.push(mutating[i].door.path);
  });

  bundle.ceremony = { steps, followed, total: mutating.length, deviants };
}

function returnIdentifier(fnNode) {
  const body = fnNode.childForFieldName("body");
  if (!body) return null;
  for (const ret of body.descendantsOfType("return_statement")) {
    const child = ret.namedChildren[0];
    if (child && child.type === "identifier") return child.text;
  }
  return null;
}
