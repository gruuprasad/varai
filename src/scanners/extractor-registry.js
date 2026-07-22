import { createHash } from "node:crypto";
import { extract as extractFastapi } from "./extractors/fastapi.js";
import { extract as extractSqlalchemy } from "./extractors/sqlalchemy.js";
import { extract as extractReactVite } from "./extractors/react-vite.js";
import { extract as extractNextjs } from "./extractors/nextjs.js";
import { extract as extractRunnable } from "./extractors/runnable.js";
import { extract as extractSchema } from "./extractors/schema.js";

export const EXTRACTOR_REGISTRY = Object.freeze([
  { id: "fastapi.routes.v1", stack: "fastapi", extract: extractFastapi },
  { id: "sqlalchemy.models.v1", stack: "sqlalchemy", extract: extractSqlalchemy },
  { id: "react-vite.ui.v2", stack: "react-vite", extract: extractReactVite },
  { id: "nextjs.routes.v1", stack: "nextjs", extract: extractNextjs },
  { id: "python.schemas.v1", stack: "python-common", extract: extractSchema },
  { id: "base.runnables.v1", stack: "base", extract: extractRunnable },
]);

const BY_ID = new Map(EXTRACTOR_REGISTRY.map((entry) => [entry.id, entry]));

export function selectExtractors(stacks) {
  const active = stacks instanceof Set ? stacks : new Set(stacks);
  return EXTRACTOR_REGISTRY.filter((entry) => active.has(entry.stack));
}

export function resolveExtractors(ids) {
  return ids.map((id) => {
    const entry = BY_ID.get(id);
    if (!entry) throw new Error(`Unknown extractor ID: ${id}`);
    return entry;
  });
}

export function extractorFingerprint(extractors) {
  const ids = extractors.map((entry) => entry.id).sort();
  return createHash("sha256").update(ids.join("\n")).digest("hex");
}
