import { SYSTEM_MODEL_ANALYZER_VERSION } from "../version.js";

export const COMPAT_ANALYZER_ID = "compat.analysis-v2";

const EXTRACTOR_CAPABILITIES = Object.freeze({
  "fastapi.routes.v1": [["api", "api.operation"]],
  "sqlalchemy.models.v1": [["data", "data.entity"]],
  "react-vite.ui.v2": [["ui", "ui.screen"], ["ui", "ui.component"], ["ui", "ui.action"], ["ui", "ui.availability"], ["data", "data.state"]],
  "python.schemas.v1": [["data", "data.contract"]],
  "base.runnables.v1": [["cli", "cli.command"], ["service", "service.process"]],
});

const TRACE_CAPABILITIES = Object.freeze({
  api: ["api.input", "api.output", "api.condition", "api.effect", "api.failure"],
  ui: ["ui.action", "ui.availability"],
});

function record(lens, capability, state, detail) {
  return {
    analyzerId: COMPAT_ANALYZER_ID,
    analyzerVersion: SYSTEM_MODEL_ANALYZER_VERSION,
    capability,
    scope: { kind: "subsystem", key: lens },
    state,
    evidence: [],
    details: detail ? [detail] : [],
  };
}

export function projectCoverage(analysis, populatedLenses) {
  const output = [];
  const active = analysis.scanContext?.activeExtractorIds ?? [];
  for (const extractorId of active) {
    for (const [lens, capability] of EXTRACTOR_CAPABILITIES[extractorId] ?? []) {
      if (populatedLenses.has(lens)) output.push(record(lens, capability, "partial", `Projected from ${extractorId}`));
    }
  }

  if (analysis.behaviors.some((item) => item.door?.kind === "ui_action")) {
    for (const capability of TRACE_CAPABILITIES.ui) output.push(record("ui", capability, "partial", "Compatibility projection cannot prove complete UI syntax coverage"));
  }
  if (analysis.behaviors.some((item) => item.door?.kind !== "ui_action")) {
    for (const capability of TRACE_CAPABILITIES.api) output.push(record("api", capability, "partial", "Compatibility projection cannot prove complete behavior coverage"));
  }

  for (const diagnostic of analysis.diagnostics ?? []) {
    const lens = diagnostic.code === "behavior-trace-failed" ? "api"
      : diagnostic.code === "frontend-behavior-trace-failed" ? "ui"
        : null;
    if (!lens || !populatedLenses.has(lens)) continue;
    for (const capability of TRACE_CAPABILITIES[lens]) output.push(record(lens, capability, "failed", diagnostic.message));
  }
  return output;
}
