import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildBuilderEnv } from "../builder/process-adapter.js";
import { getDevelopmentRole } from "./definitions.js";
import { parseJsonTranscript } from "../seed/assistants/openai-compatible.js";

const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_PROMPT_ARGUMENT_BYTES = 64 * 1024;
const RECOMMENDATIONS = new Set(["accept", "investigate", "change"]);
const CERTAINTIES = new Set(["observed", "inferred", "judgment", "unverified"]);

export const ROLE_REVIEW_AUTHORITY = "advisory_only";
export const ROLE_REVIEW_VERDICT_AUTHORITY = "deterministic_verifier_and_human";

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function idFor(index, value) {
  const slug = text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `review-finding-${index + 1}${slug ? `-${slug}` : ""}`;
}

export function normalizeRoleReview(raw, {
  roleId,
  seedHash,
  treeHash,
  sessionId,
  createdAt = new Date().toISOString(),
} = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Role review must be an object");
  const role = getDevelopmentRole(roleId);
  if (!role) throw new Error(`Unknown development role: ${roleId}`);
  const findings = Array.isArray(raw.findings) ? raw.findings.map((item, index) => {
    const source = item && typeof item === "object" ? item : {};
    const statement = text(source.statement ?? source.text ?? source.summary);
    return {
      id: text(source.id) || idFor(index, statement),
      kind: text(source.kind, "observation"),
      statement,
      evidenceIds: Array.isArray(source.evidenceIds) ? source.evidenceIds.map(String).filter(Boolean) : [],
      certainty: CERTAINTIES.has(source.certainty) ? source.certainty : "judgment",
    };
  }).filter((item) => item.statement) : [];
  const recommendation = RECOMMENDATIONS.has(raw.recommendation) ? raw.recommendation : "investigate";
  return {
    formatVersion: 1,
    role: role.id,
    roleLabel: role.label,
    seedHash: text(seedHash) || null,
    treeHash: text(treeHash) || null,
    sessionId: text(sessionId) || null,
    authority: ROLE_REVIEW_AUTHORITY,
    verdictAuthority: ROLE_REVIEW_VERDICT_AUTHORITY,
    summary: text(raw.summary, "The advisory reviewer returned no summary."),
    findings,
    questions: Array.isArray(raw.questions) ? raw.questions.map(String).map((item) => item.trim()).filter(Boolean) : [],
    recommendation,
    proposedChange: text(raw.proposedChange) || null,
    createdAt,
  };
}

export function roleReviewStatus(review, { seedHash = null, treeHash = null, sessionId = null } = {}) {
  if (!review) return null;
  const reasons = [];
  if (seedHash && review.seedHash && seedHash !== review.seedHash) reasons.push("approved Seed changed");
  if (treeHash && review.treeHash && treeHash !== review.treeHash) reasons.push("implementation changed");
  if (sessionId && review.sessionId && sessionId !== review.sessionId) reasons.push("build session changed");
  if (!seedHash || !treeHash) reasons.push("current repository fingerprint unavailable");
  return {
    state: reasons.length ? (reasons.length === 1 && reasons[0].includes("unavailable") ? "unknown" : "stale") : "current",
    reasons,
  };
}

export function buildRoleReviewPrompt({ roleId, seedHash, treeHash, sessionId, projection, report } = {}) {
  const role = getDevelopmentRole(roleId);
  if (!role) throw new Error(`Unknown development role: ${roleId}`);
  return `You are Varai's advisory ${role.label} reviewer. Review only the structured projection below.
Do not read files, run commands, or edit the repository. You cannot change the Seed or set a readiness verdict.
The deterministic verifier and human remain authoritative. Return ONLY JSON:
{"summary":"...","findings":[{"kind":"...","statement":"...","evidenceIds":["..."],"certainty":"observed|inferred|judgment|unverified"}],"questions":["..."],"recommendation":"accept|investigate|change","proposedChange":"..."}
Reference only evidence ids present in the projection/report. Treat quality and architecture judgments as judgment, not proof.

Review metadata: ${JSON.stringify({ roleId, seedHash, treeHash, sessionId })}
Role projection: ${JSON.stringify(projection ?? null)}
Deterministic report summary/evidence: ${JSON.stringify(report ?? null)}`;
}

export function createCommandRoleReviewer({ executable, args = [], envAllowlist = [], sourceEnv = process.env } = {}) {
  if (!executable || typeof executable !== "string") throw new Error("Command role reviewer requires executable");
  const modelIndex = args.indexOf("--model");
  return {
    provider: "local-command",
    model: modelIndex >= 0 ? args[modelIndex + 1] : executable,
    async review(input) {
      const prompt = buildRoleReviewPrompt(input);
      const promptArg = Buffer.byteLength(prompt, "utf8") > MAX_PROMPT_ARGUMENT_BYTES ? "-" : prompt;
      const cwd = await mkdtemp(path.join(os.tmpdir(), "varai-role-review-"));
      try {
        const output = await new Promise((resolve, reject) => {
          const child = spawn(executable, [...args, promptArg], {
            cwd,
            env: buildBuilderEnv(sourceEnv, { envAllowlist }),
            shell: false,
            stdio: [promptArg === "-" ? "pipe" : "ignore", "pipe", "pipe"],
          });
          if (promptArg === "-") child.stdin.end(prompt);
          const stdout = [];
          const stderr = [];
          let size = 0;
          child.stdout.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_OUTPUT_BYTES) child.kill("SIGKILL");
            else stdout.push(chunk);
          });
          child.stderr.on("data", (chunk) => stderr.push(chunk));
          child.once("error", reject);
          child.once("exit", (code) => {
            if (size > MAX_OUTPUT_BYTES) reject(new Error("Role reviewer output exceeded 1 MiB"));
            else if (code !== 0) reject(new Error(`Role reviewer exited ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`));
            else resolve(Buffer.concat(stdout).toString("utf8"));
          });
        });
        return parseJsonTranscript(output, (value) => value && typeof value === "object" &&
          ("summary" in value || "findings" in value || "recommendation" in value));
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    },
  };
}
