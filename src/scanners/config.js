import path from "node:path";
import { readFile } from "node:fs/promises";

export class ConfigError extends Error {
  constructor(field, message) {
    super(`varai.config.json: ${field}: ${message}`);
    this.name = "ConfigError";
    this.field = field;
  }
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
  const unknown = Object.keys(parsed).filter((key) => !["include", "exclude"].includes(key));
  if (unknown.length) throw new ConfigError(unknown[0], "unknown field");
  return {
    ...(parsed.include ? { include: [...parsed.include] } : {}),
    ...(parsed.exclude ? { exclude: [...parsed.exclude] } : {}),
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
