import { createBuildSessionStore } from "../build-session/store.js";
import { readSeed } from "../seed/store.js";
import { buildVerificationPlan } from "../reconciliation/verification-plan.js";
import { getDevelopmentRole } from "../development-roles/definitions.js";
import { projectDevelopmentRole } from "../development-roles/project.js";
import { normalizeRoleReview } from "../development-roles/review.js";
import { originOk, readJsonBody } from "./seed.js";

function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(JSON.stringify(data));
}

export function createRoleReviewHandlers({ repoPath, port, getModel, reviewer = null, broadcast = () => {} } = {}) {
  return {
    async handle(req, res, url) {
      if (req.method !== "POST" || url.pathname !== "/api/development/review") return false;
      if (!originOk(req, port)) {
        send(res, 403, { error: "Unexpected origin" });
        return true;
      }
      if (!reviewer) {
        send(res, 409, { error: "No local advisory reviewer is configured." });
        return true;
      }
      const body = await readJsonBody(req);
      const roleId = typeof body.roleId === "string" ? body.roleId : "";
      if (!getDevelopmentRole(roleId)) {
        send(res, 400, { error: "roleId must name a built-in development role" });
        return true;
      }

      const input = readSeed(repoPath);
      if (!input?.ratified) {
        send(res, 409, { error: "An approved Seed is required before advisory review." });
        return true;
      }
      const store = createBuildSessionStore(repoPath);
      const sessions = await store.listSessions();
      const session = sessions.find((item) => item.seedHash === input.contentHash
        && item.completedAt && item.completion?.reportHash);
      if (!session) {
        send(res, 409, { error: "Complete a build for the current Seed before asking for a role review." });
        return true;
      }
      const report = await store.getObject(session.completion.reportHash);
      const model = typeof getModel === "function" ? await getModel() : null;
      const verificationPlan = buildVerificationPlan({ seed: input.seed, report });
      const projection = projectDevelopmentRole({
        roleId,
        seed: input.seed,
        model,
        report,
        verificationPlan,
      });
      let raw;
      try {
        raw = await reviewer.review({
          roleId,
          seedHash: input.contentHash,
          treeHash: session.completion.implementationTreeHash,
          sessionId: session.id,
          projection,
          report: {
            summary: report.summary,
            evidence: projection.evidence,
          },
        });
      } catch (err) {
        send(res, 502, { error: `Advisory reviewer failed: ${err.message}` });
        return true;
      }
      const review = normalizeRoleReview(raw, {
        roleId,
        seedHash: input.contentHash,
        treeHash: session.completion.implementationTreeHash,
        sessionId: session.id,
      });
      const hash = await store.putObject(review);
      const updated = await store.putSession({
        ...session,
        roleReviews: { ...(session.roleReviews ?? {}), [roleId]: hash },
      });
      broadcast({ type: "development-review", data: { roleId, sessionId: session.id } });
      send(res, 200, { review, hash, sessionId: updated.id });
      return true;
    },
  };
}
