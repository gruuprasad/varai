import path from "node:path";
import { createSystemModel } from "./canonicalize.js";
import { validateSystemModel } from "./validate.js";

// Generic assembly seam. Framework-shaped observations must be lifted by an
// analyzer before they reach the System Model package.
export function buildSystemModel(draft = {}, options = {}) {
  const model = createSystemModel({
    systemName: options.systemName ?? draft.systemName ?? path.basename(options.repoPath ?? "repository"),
    systemKey: draft.systemKey ?? "repository-root",
    analyzerVersion: draft.analyzerVersion,
    subsystems: draft.subsystems ?? [],
    elements: draft.elements ?? [],
    claims: draft.claims ?? [],
    coverage: draft.coverage ?? [],
    diagnostics: draft.diagnostics ?? [],
  });
  return validateSystemModel(model);
}
