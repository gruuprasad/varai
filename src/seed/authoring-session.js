import fs from "node:fs";
import path from "node:path";

// Authoring state is deliberately separate from the approved Seed. It makes a
// drafting conversation recoverable across dashboard restarts without ever
// making an assistant proposal executable intent.
const SESSION_FILE = path.join(".varai", "authoring-v1", "session.json");

export function authoringSessionPath(repoPath) {
  const root = path.resolve(repoPath);
  const target = path.resolve(root, SESSION_FILE);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Authoring session path escapes repository root");
  return target;
}

function atomicWrite(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try { fs.renameSync(temporary, target); }
  catch (error) { try { fs.unlinkSync(temporary); } catch { /* best effort */ } throw error; }
}

export function readAuthoringSession(repoPath) {
  const target = authoringSessionPath(repoPath);
  if (!fs.existsSync(target)) return null;
  const value = JSON.parse(fs.readFileSync(target, "utf8"));
  if (value?.formatVersion !== 1 || !Array.isArray(value.conversation)) {
    throw new Error(`Invalid authoring session at ${target}`);
  }
  return value;
}

export function writeAuthoringSession(repoPath, session) {
  const value = { formatVersion: 1, ...session, updatedAt: new Date().toISOString() };
  if (!Array.isArray(value.conversation)) throw new Error("Authoring session conversation must be an array");
  atomicWrite(authoringSessionPath(repoPath), value);
  return value;
}

export function clearAuthoringSession(repoPath) {
  try { fs.unlinkSync(authoringSessionPath(repoPath)); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
