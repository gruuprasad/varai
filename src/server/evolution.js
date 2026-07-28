import { createBuildSessionStore } from "../build-session/store.js";
import { projectProgression } from "../evolution/project.js";

function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(JSON.stringify(data));
}

// Read-only projection endpoint. Sessions contain the audited inputs; this
// endpoint never creates a snapshot, starts a build, or changes a Seed.
export function createEvolutionHandler({ repoPath }) {
  return async function handle(req, res, url) {
    if (req.method !== "GET" || url.pathname !== "/api/progression") return false;
    const sessions = (await createBuildSessionStore(repoPath).listSessions()).filter((session) => session.completion);
    const from = url.searchParams.get("from") ?? sessions[1]?.id ?? null;
    const to = url.searchParams.get("to") ?? sessions[0]?.id ?? null;
    if (!from || !to) {
      send(res, 200, { sessions: sessions.map((session) => ({ id: session.id, completedAt: session.completedAt, mode: session.completion.mode })), progression: null });
      return true;
    }
    const progression = await projectProgression(repoPath, { from, to });
    send(res, 200, { sessions: sessions.map((session) => ({ id: session.id, completedAt: session.completedAt, mode: session.completion.mode })), progression });
    return true;
  };
}
