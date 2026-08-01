// Published structural JSON Schemas for builder witnesses (realization) and
// runtime maps, emitted by `varai handoff --schema`. Shape rules are generated
// from the same field constants the authoritative JS validators use, so the
// two cannot drift. JSON Schema covers shape; the JS validators in
// src/reconciliation/schema.js and src/runtime/validate.js remain
// authoritative for Seed-aware references, cross-field rules, and security
// checks that JSON Schema does not express.

const DRAFT = "http://json-schema.org/draft-07/schema#";

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const SEED_HASH_PATTERN = "^sha256:[0-9a-f]{64}$";

function stringField(pattern) {
  return { type: "string", ...(pattern ? { pattern } : {}) };
}

function artifactSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      lens: stringField(),
      kind: stringField(),
      key: stringField(),
      source: {
        type: "object",
        additionalProperties: false,
        properties: {
          file: stringField(),
          symbol: stringField(),
          line: { type: "integer", minimum: 1 },
        },
        // Source lines alone are a location, not semantic identity (JS rule
        // `line-only-identity`): a fallback selector needs file + symbol.
        required: ["file", "symbol"],
      },
    },
    anyOf: [
      { required: ["kind", "key"] },
      { required: ["source"] },
    ],
  };
}

function targetSchema() {
  return {
    anyOf: [
      { type: "object", additionalProperties: false, properties: { concept: stringField() }, required: ["concept"] },
      { type: "object", additionalProperties: false, properties: { literal: {} }, required: ["literal"] },
    ],
  };
}

export function realizationJsonSchema() {
  return {
    $schema: DRAFT,
    title: "varai.realization.json — builder witness",
    type: "object",
    additionalProperties: false,
    properties: {
      formatVersion: { type: "integer", enum: [1, 2] },
      seedHash: stringField(SEED_HASH_PATTERN),
      builder: {
        type: "object",
        additionalProperties: false,
        properties: {
          tool: stringField(),
          version: stringField(),
          builtAt: stringField(),
        },
      },
      bindings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: stringField(`^binding\\.${SLUG}$`),
            concept: stringField(),
            artifact: artifactSchema(),
            note: stringField(),
          },
          required: ["id", "concept", "artifact"],
        },
      },
      surfaceBindings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: stringField(`^surface-binding\\.${SLUG}$`),
            surface: stringField(),
            artifact: artifactSchema(),
            note: stringField(),
          },
          required: ["id", "surface", "artifact"],
        },
      },
      witnesses: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            commitment: stringField(),
            sourceBinding: stringField(),
            target: targetSchema(),
          },
          required: ["commitment", "sourceBinding"],
        },
      },
    },
    required: ["formatVersion", "seedHash"],
  };
}

export function runtimeMapJsonSchema() {
  return {
    $schema: DRAFT,
    title: "varai.runtime.json — runtime operation map",
    type: "object",
    additionalProperties: false,
    properties: {
      formatVersion: { type: "integer", enum: [1] },
      seedHash: stringField(SEED_HASH_PATTERN),
      baseUrl: stringField("^https?://"),
      healthPath: stringField("^/"),
      start: {
        type: "object",
        additionalProperties: false,
        properties: {
          executable: stringField(),
          args: { type: "array", items: stringField() },
        },
        required: ["executable", "args"],
      },
      operations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            behavior: stringField(),
            method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] },
            path: stringField("^/"),
          },
          required: ["behavior", "method", "path"],
        },
      },
      personas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: stringField(`^${SLUG}$`),
            actor: stringField(),
            credentialEnv: stringField(),
            headers: { type: "object", additionalProperties: { type: "string" } },
          },
          required: ["id", "actor"],
        },
      },
    },
    required: ["formatVersion", "seedHash"],
  };
}

export function emitHandoffSchemas() {
  return { realization: realizationJsonSchema(), runtimeMap: runtimeMapJsonSchema() };
}

// Compact structural checker over the emitted schemas (draft-07 subset).
// Dependency-free so builder agents can use it too; it is NOT authoritative —
// the JS validators own Seed-aware and cross-field rules.
export function checkJsonSchema(value, schema) {
  const problems = [];
  walk(value, schema, "$", problems);
  return { valid: problems.length === 0, problems };
}

function walk(value, schema, path, problems) {
  if (!schema || typeof schema !== "object") return;
  if (schema.anyOf) {
    const matchesAny = schema.anyOf.some((branch) => {
      const branchProblems = [];
      walk(value, branch, path, branchProblems);
      return branchProblems.length === 0;
    });
    if (!matchesAny) {
      problems.push({ path, message: `does not match any allowed shape` });
    }
    // Continue: branch constraints are additive to the enclosing schema's
    // type/properties/required rules, which still apply below.
  }
  if (schema.type) {
    const ok = schema.type === "array" ? Array.isArray(value)
      : schema.type === "integer" ? Number.isInteger(value)
        : schema.type === "number" ? typeof value === "number"
          : schema.type === "object" ? Boolean(value) && typeof value === "object" && !Array.isArray(value)
            : typeof value === schema.type;
    if (!ok) {
      problems.push({ path, message: `expected ${schema.type}` });
      return;
    }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    problems.push({ path, message: `must be one of ${schema.enum.join(", ")}` });
  }
  if (typeof value === "string" && schema.pattern && !new RegExp(schema.pattern).test(value)) {
    problems.push({ path, message: `does not match pattern ${schema.pattern}` });
  }
  if (Array.isArray(value)) {
    if (schema.items) {
      for (let index = 0; index < value.length; index += 1) {
        walk(value[index], schema.items, `${path}[${index}]`, problems);
      }
    }
    return;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!schema.properties || !schema.properties[key]) {
          problems.push({ path, message: `unknown field ${key}` });
        }
      }
    }
    for (const key of Object.keys(schema.properties ?? {})) {
      if (value[key] !== undefined) walk(value[key], schema.properties[key], `${path}.${key}`, problems);
    }
    for (const key of schema.required ?? []) {
      if (value[key] === undefined) problems.push({ path, message: `missing required field ${key}` });
    }
  }
}

