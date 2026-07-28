import { createBuilderStore } from "../builder/store.js";
import {
  recordBuildIntervention,
  runBuildMessage,
  runBuildRun,
  runBuildStop,
} from "../builder/commands.js";
import { getLiveBuilderRun } from "../builder/runtime.js";
import { runBuildStatus } from "../build-session/commands.js";
import { createBuildSessionStore } from "../build-session/store.js";
import { originOk, readJsonBody } from "./seed.js";

// Builder control-room API. Never accepts an arbitrary executable from the
// browser — only a configured adapter id and product-level messages/logs.

const MAX_BODY_BYTES = 64 * 1024;

function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(JSON.stringify(data));
}

function rejectExecutablePayload(body) {
  if (!body || typeof body !== "object") return;
  for (const key of ["executable", "command", "cmd", "shell", "argv0"]) {
    if (body[key] !== undefined) {
      const err = new Error("Browser requests may not supply a builder executable");
      err.statusCode = 400;
      throw err;
    }
  }
  if (body.args !== undefined || body.env !== undefined) {
    const err = new Error("Browser requests may not supply builder process arguments or environment");
    err.statusCode = 400;
    throw err;
  }
}

export function createBuilderHandlers({ repoPath, port, broadcast = () => {} }) {
  return {
    async handle(req, res, url) {
      if (!url.pathname.startsWith("/api/build")) return false;

      if (req.method === "GET" && url.pathname === "/api/build") {
        const status = await runBuildStatus({ repo: repoPath, json: true, quiet: true });
        const live = getLiveBuilderRun(repoPath);
        send(res, 200, {
          ...status,
          live: live ? { sessionId: live.sessionId, running: true } : { running: false },
        });
        return true;
      }

      if (req.method === "GET" && url.pathname === "/api/build/logs") {
        const store = createBuildSessionStore(repoPath);
        const active = await store.getActive();
        const sessionId = url.searchParams.get("session") ?? active?.id;
        if (!sessionId) {
          send(res, 200, { sessionId: null, events: [] });
          return true;
        }
        const events = await createBuilderStore(repoPath).listEvents(sessionId);
        send(res, 200, { sessionId, events });
        return true;
      }

      if (req.method === "POST" && (
        url.pathname === "/api/build/run" ||
        url.pathname === "/api/build/message" ||
        url.pathname === "/api/build/stop"
      )) {
        if (!originOk(req, port)) {
          send(res, 403, { error: "Unexpected origin" });
          return true;
        }
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        rejectExecutablePayload(body);

        if (url.pathname === "/api/build/run") {
          if (!body.adapter || typeof body.adapter !== "string") {
            send(res, 400, { error: "adapter id is required" });
            return true;
          }
          // Fire-and-forget long runs would block HTTP; await completion for the PoC.
          const result = await runBuildRun({
            repo: repoPath,
            adapter: body.adapter,
            json: true,
            quiet: true,
            cache: false,
          });
          broadcast({ type: "build", data: { sessionId: result.session?.id, state: result.session?.lifecycleState } });
          send(res, 200, {
            session: result.session,
            exitCode: result.exitCode ?? 0,
            report: result.report ?? null,
          });
          return true;
        }

        if (url.pathname === "/api/build/message") {
          if (typeof body.message !== "string" || !body.message.trim()) {
            send(res, 400, { error: "message is required" });
            return true;
          }
          try {
            const result = await runBuildMessage({
              repo: repoPath,
              message: body.message,
              json: true,
              quiet: true,
            });
            // Quiet path still writes; silence by catching return only.
            send(res, 200, result);
          } catch (err) {
            send(res, err.statusCode ?? 409, { error: err.message });
          }
          return true;
        }

        const result = await runBuildStop({ repo: repoPath, json: true, quiet: true });
        send(res, 200, result);
        return true;
      }

      return false;
    },
    recordIntervention: (relPath) => recordBuildIntervention(repoPath, { path: relPath }),
  };
}
