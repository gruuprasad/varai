// Framework-neutral public-surface contract: which observed Elements are
// externally reachable entry points. Analyzers keep emitting ordinary Elements;
// this module is the only place that decides which kinds participate in closed
// surface accounting (ADR 0007).

export const PUBLIC_SURFACE_CAPABILITIES = Object.freeze([
  "api.operation",
  "ui.screen",
  "ui.action",
  "cli.command",
  "webhook.operation",
  "job.entry",
]);

export const PUBLIC_SURFACE_BY_LENS_KIND = Object.freeze({
  api: Object.freeze(["operation"]),
  ui: Object.freeze(["screen", "action"]),
  cli: Object.freeze(["command"]),
  webhook: Object.freeze(["operation", "webhook"]),
  job: Object.freeze(["job", "operation"]),
});

const PUBLIC_CAPABILITY_SET = new Set(PUBLIC_SURFACE_CAPABILITIES);

function lensBySubsystemId(model) {
  return new Map((model.subsystems ?? []).map((subsystem) => [subsystem.id, subsystem.lens]));
}

export function isPublicSurfaceElement(element, { lens } = {}) {
  if (!element) return false;
  if (element.capability && PUBLIC_CAPABILITY_SET.has(element.capability)) return true;
  if (!lens) return false;
  const kinds = PUBLIC_SURFACE_BY_LENS_KIND[lens];
  return Boolean(kinds?.includes(element.kind));
}

export function publicSurfaceElements(model) {
  const lensOf = lensBySubsystemId(model);
  return [...(model.elements ?? [])]
    .filter((element) => isPublicSurfaceElement(element, { lens: lensOf.get(element.subsystemId) }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
