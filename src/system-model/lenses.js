const BUILTIN_LENSES = Object.freeze([
  { id: "api", label: "API", elementKinds: ["operation"] },
  { id: "ui", label: "UI", elementKinds: ["screen", "surface", "component", "action"] },
  { id: "worker", label: "Workers", elementKinds: ["job", "workflow", "schedule"] },
  { id: "cli", label: "CLI", elementKinds: ["command"] },
  { id: "data", label: "Data", elementKinds: ["contract", "entity", "aggregate", "state", "artifact", "dataset"] },
  { id: "service", label: "Services", elementKinds: ["process", "external_system", "port"] },
  { id: "library", label: "Libraries", elementKinds: ["function", "type"] },
  { id: "application", label: "Application", elementKinds: ["use_case", "workflow", "operation", "decision"] },
]);

export function createLensRegistry(additional = []) {
  const registry = new Map();
  for (const lens of [...BUILTIN_LENSES, ...additional]) {
    if (!lens?.id || !lens?.label || !Array.isArray(lens.elementKinds)) {
      throw new Error("Lens definitions require id, label, and elementKinds");
    }
    if (registry.has(lens.id)) throw new Error(`Duplicate lens ID: ${lens.id}`);
    registry.set(lens.id, Object.freeze({ ...lens, elementKinds: Object.freeze([...lens.elementKinds]) }));
  }
  return registry;
}

export const DEFAULT_LENS_REGISTRY = createLensRegistry();

export function lensLabel(registry, id) {
  return registry.get(id)?.label ?? id;
}
