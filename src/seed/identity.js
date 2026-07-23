import { createHash } from "node:crypto";
import { canonicalStringifySeed, seedSemanticContent } from "./canonicalize.js";
import { COMMITMENT_ID_PATTERN, CONCEPT_ID_PATTERN, CONTEXT_ID_PATTERN, SYSTEM_ID_PATTERN } from "./schema.js";

// Varai owns seed identity mechanics. Concept, commitment, and context IDs are
// explicit stable identifiers: an assistant may propose names, but renaming a
// concept never replaces its ID, and the semantic content hash commits to the
// document excluding ratification metadata.

export function slugify(name) {
  const slug = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  if (!slug || !SYSTEM_ID_PATTERN.test(slug)) {
    throw new Error(`Cannot derive a stable ID slug from ${JSON.stringify(name)}`);
  }
  return slug;
}

export function conceptId(role, name) {
  const id = `${role}.${slugify(name)}`;
  if (!CONCEPT_ID_PATTERN.test(id)) throw new Error(`Invalid concept ID: ${id}`);
  return id;
}

export function commitmentId(name) {
  const id = `commitment.${slugify(name)}`;
  if (!COMMITMENT_ID_PATTERN.test(id)) throw new Error(`Invalid commitment ID: ${id}`);
  return id;
}

export function contextId(name) {
  const id = `context.${slugify(name)}`;
  if (!CONTEXT_ID_PATTERN.test(id)) throw new Error(`Invalid context ID: ${id}`);
  return id;
}

export function seedContentHash(seed) {
  return `sha256:${createHash("sha256").update(canonicalStringifySeed(seedSemanticContent(seed))).digest("hex")}`;
}
