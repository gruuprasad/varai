export const CLAUSE_KINDS = Object.freeze([
  "requires", "takes", "gives", "reads", "writes", "fails", "untraced", "guards",
]);

export function doorLabel(door) {
  if (door?.kind === "ui_action") {
    const action = door.action === "onClose" ? "dismissal" : door.action;
    return `${door.component} ${action}`;
  }
  return `${door?.method ?? ""} ${door?.path ?? ""}`.trim();
}

export function clauseLabel(kind, clause) {
  if (kind === "requires") return `needs ${clause.name}`;
  if (kind === "takes" || kind === "gives") return `${kind} ${clause.schema ?? clause.name ?? "unknown"}`;
  if (kind === "reads" || kind === "writes") return `${kind} ${clause.medium}:${clause.target ?? clause.detail ?? "unknown"}`;
  if (kind === "fails") return `fails ${clause.status ?? clause.reason ?? "unknown"}`;
  if (kind === "untraced") return `untraced ${clause.call}`;
  if (kind === "guards" && clause.kind === "disabled_when") return `disabled when ${clause.condition}`;
  return kind;
}
