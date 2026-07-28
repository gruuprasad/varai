import path from "node:path";
import { readFile } from "node:fs/promises";

export class ConfigError extends Error {
  constructor(field, message) {
    super(`varai.config.json: ${field}: ${message}`);
    this.name = "ConfigError";
    this.field = field;
  }
}

function validateBuilders(builders) {
  if (!builders || typeof builders !== "object" || Array.isArray(builders)) {
    throw new ConfigError("builders", "expected an object of adapter configs");
  }
  const out = {};
  for (const [id, entry] of Object.entries(builders)) {
    if (!id || typeof id !== "string") throw new ConfigError("builders", "adapter id must be a string");
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ConfigError(`builders.${id}`, "expected an object");
    }
    if (typeof entry.executable !== "string" || !entry.executable) {
      throw new ConfigError(`builders.${id}.executable`, "expected a non-empty string");
    }
    if (entry.args !== undefined &&
        (!Array.isArray(entry.args) || entry.args.some((item) => typeof item !== "string"))) {
      throw new ConfigError(`builders.${id}.args`, "expected an array of strings");
    }
    if (entry.envAllowlist !== undefined) {
      if (!Array.isArray(entry.envAllowlist) || entry.envAllowlist.some((item) => typeof item !== "string" || !item)) {
        throw new ConfigError(`builders.${id}.envAllowlist`, "expected an array of non-empty strings (env names only)");
      }
    }
    const unknown = Object.keys(entry).filter((key) => !["executable", "args", "envAllowlist"].includes(key));
    if (unknown.length) throw new ConfigError(`builders.${id}.${unknown[0]}`, "unknown field");
    out[id] = {
      executable: entry.executable,
      ...(entry.args ? { args: [...entry.args] } : { args: [] }),
      ...(entry.envAllowlist ? { envAllowlist: [...entry.envAllowlist] } : {}),
    };
  }
  return out;
}

function validateConfig(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConfigError("root", "expected object");
  }
  if (parsed.include !== undefined &&
      (!Array.isArray(parsed.include) || parsed.include.some((item) => typeof item !== "string"))) {
    throw new ConfigError("include", "expected an array of strings");
  }
  if (parsed.exclude !== undefined &&
      (!Array.isArray(parsed.exclude) || parsed.exclude.some((item) => typeof item !== "string"))) {
    throw new ConfigError("exclude", "expected an array of strings");
  }
  if (parsed.builders !== undefined) validateBuilders(parsed.builders);
  const unknown = Object.keys(parsed).filter((key) => !["include", "exclude", "builders"].includes(key));
  if (unknown.length) throw new ConfigError(unknown[0], "unknown field");
  return {
    ...(parsed.include ? { include: [...parsed.include] } : {}),
    ...(parsed.exclude ? { exclude: [...parsed.exclude] } : {}),
    ...(parsed.builders ? { builders: validateBuilders(parsed.builders) } : {}),
  };
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
  return validateConfig(parsed);
}

export const _internal = { validateConfig };
