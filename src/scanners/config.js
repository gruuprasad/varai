import path from "node:path";
import { readFile } from "node:fs/promises";

export class ConfigError extends Error {
  constructor(field, message) {
    super(`varai.config.json: ${field}: ${message}`);
    this.name = "ConfigError";
    this.field = field;
  }
}

function compileRegex(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigError(field, "expected { pattern: string, flags?: string }");
  }
  if (typeof value.pattern !== "string") {
    throw new ConfigError(`${field}.pattern`, "expected string");
  }
  if (value.flags !== undefined && typeof value.flags !== "string") {
    throw new ConfigError(`${field}.flags`, "expected string");
  }
  try {
    return new RegExp(value.pattern, value.flags ?? "");
  } catch (err) {
    throw new ConfigError(field, `invalid regular expression (${err.message})`);
  }
}

function compileConfig(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConfigError("root", "expected object");
  }
  if (parsed.include !== undefined &&
      (!Array.isArray(parsed.include) || parsed.include.some((item) => typeof item !== "string"))) {
    throw new ConfigError("include", "expected an array of strings");
  }
  const stock = parsed.stock;
  if (stock === undefined) return parsed;
  if (!stock || typeof stock !== "object" || Array.isArray(stock)) {
    throw new ConfigError("stock", "expected object");
  }
  if (stock.disabled !== undefined &&
      (!Array.isArray(stock.disabled) || stock.disabled.some((item) => typeof item !== "string"))) {
    throw new ConfigError("stock.disabled", "expected an array of strings");
  }
  if (stock.additional !== undefined && !Array.isArray(stock.additional)) {
    throw new ConfigError("stock.additional", "expected an array");
  }

  const additional = (stock.additional ?? []).map((pattern, patternIndex) => {
    const base = `stock.additional[${patternIndex}]`;
    if (!pattern || typeof pattern !== "object" || Array.isArray(pattern)) {
      throw new ConfigError(base, "expected object");
    }
    if (typeof pattern.name !== "string" || pattern.name.length === 0) {
      throw new ConfigError(`${base}.name`, "expected non-empty string");
    }
    if (!Array.isArray(pattern.signatures) || pattern.signatures.length === 0) {
      throw new ConfigError(`${base}.signatures`, "expected a non-empty array");
    }
    const signatures = pattern.signatures.map((signature, signatureIndex) => {
      const sigBase = `${base}.signatures[${signatureIndex}]`;
      if (!signature || typeof signature !== "object" || Array.isArray(signature)) {
        throw new ConfigError(sigBase, "expected object");
      }
      if (typeof signature.kind !== "string") throw new ConfigError(`${sigBase}.kind`, "expected string");
      if (typeof signature.role !== "string") throw new ConfigError(`${sigBase}.role`, "expected string");
      return {
        ...signature,
        nameRegex: compileRegex(signature.nameRegex, `${sigBase}.nameRegex`),
        ...(signature.pathRegex === undefined
          ? {}
          : { pathRegex: compileRegex(signature.pathRegex, `${sigBase}.pathRegex`) }),
      };
    });
    return { ...pattern, signatures };
  });
  return { ...parsed, stock: { ...stock, additional } };
}

export async function loadRepoConfig(repoPath) {
  const configPath = path.join(repoPath, "varai.config.json");
  let raw;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw new ConfigError("root", `cannot read file (${err.message})`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError("root", `invalid JSON (${err.message})`);
  }
  return compileConfig(parsed);
}

export const _internal = { compileRegex, compileConfig };
