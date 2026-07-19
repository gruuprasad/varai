import { SYSTEM_MODEL_ANALYZER_VERSION } from "./version.js";

export const MODEL_BUILDER_ID = "system-model.builder";

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
    analyzerId: MODEL_BUILDER_ID,
    analyzerVersion: SYSTEM_MODEL_ANALYZER_VERSION,
    capability,
    scope: { kind: "subsystem", key: lens },
    state,
    evidence: [],
    details: detail ? [detail] : [],
  };
}

export function buildCoverage(observations, populatedLenses) {
  const output = [];
  const active = observations.scanContext?.activeExtractorIds ?? [];
  const behaviors = observations.behaviors ?? [];
  for (const extractorId of active) {
    for (const [lens, capability] of EXTRACTOR_CAPABILITIES[extractorId] ?? []) {
      if (populatedLenses.has(lens)) output.push(record(lens, capability, "partial", `Observed by ${extractorId}`));
    }
  }

  if (behaviors.some((item) => item.door?.kind === "ui_action")) {
    for (const capability of TRACE_CAPABILITIES.ui) output.push(record("ui", capability, "partial", "The current analyzer does not cover every UI syntax shape"));
  }
  if (behaviors.some((item) => item.door?.kind !== "ui_action")) {
    for (const capability of TRACE_CAPABILITIES.api) output.push(record("api", capability, "partial", "The current analyzer does not cover every behavior shape"));
  }

  for (const diagnostic of observations.diagnostics ?? []) {
    const lens = diagnostic.code === "behavior-trace-failed" ? "api"
      : diagnostic.code === "frontend-behavior-trace-failed" ? "ui"
        : null;
    if (!lens || !populatedLenses.has(lens)) continue;
    for (const capability of TRACE_CAPABILITIES[lens]) output.push(record(lens, capability, "failed", diagnostic.message));
  }
  return output;
}
