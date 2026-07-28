import { readGitState } from "../snapshots/git-state.js";
import { normalizeProposal } from "../seed/assistant.js";
import { diffSeeds } from "../seed/diff.js";
import { seedContentHash } from "../seed/identity.js";
import { clearAuthoringSession, readAuthoringSession, writeAuthoringSession } from "../seed/authoring-session.js";
import { SEED_FILE } from "../seed/schema.js";
import { ratifySeed, readSeed } from "../seed/store.js";
import { checkSeed, SeedValidationError } from "../seed/validate.js";

// Seed Studio endpoints (ADR 0005). Mutation rules:
// - the server stays bound to 127.0.0.1 (enforced in index.js);
// - bodies are JSON with a bounded size;
// - unexpected origins are rejected;
// - the only writable file is the fixed seed file, via atomic writes;
// - provider credentials are never sent to the browser;
// - nothing is committed to Git automatically;
// - the approved Seed remains the only durable intent; a local authoring
//   session is merely recoverable, unapproved working state.

const MAX_BODY_BYTES = 256 * 1024;

function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(JSON.stringify(data));
}

export function originOk(req, port) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (curl) send no Origin
  try {
    const url = new URL(origin);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const originPort = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
    const hostPort = Number((req.headers.host ?? "").split(":")[1]) || port;
    return local && originPort === hostPort;
  } catch {
    return false;
  }
}

export function readJsonBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("Request body too large"), { statusCode: 413 }));
        chunks.length = 0;
        req.resume(); // drain the rest so the socket stays usable for the 413
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(Object.assign(new Error("Request body must be JSON"), { statusCode: 400 }));
      }
    });
    req.on("error", reject);
  });
}

export function createSeedHandlers({ repoPath, port, assistant = null, broadcast = () => {} }) {
  function currentSeed() { return readSeed(repoPath)?.seed ?? null; }

  function sessionForCurrentSeed() {
    const session = readAuthoringSession(repoPath);
    if (!session) return null;
    const baseSeedHash = currentSeed() ? seedContentHash(currentSeed()) : null;
    return { ...session, stale: session.baseSeedHash !== baseSeedHash };
  }

  async function seedStatus() {
    let input = null;
    try {
      input = readSeed(repoPath);
    } catch (err) {
      if (!(err instanceof SeedValidationError)) throw err;
      return { file: SEED_FILE, seed: null, invalid: true, problems: err.problems, ratified: false };
    }
    const git = await readGitState(repoPath).catch(() => null);
    return {
      file: SEED_FILE,
      seed: input?.seed ?? null,
      invalid: false,
      problems: [],
      contentHash: input?.contentHash ?? null,
      ratified: input?.ratified ?? false,
      gitDirty: git ? !git.clean : null,
      draft: sessionForCurrentSeed()?.review ?? null,
      authoring: sessionForCurrentSeed(),
      assistant: assistant ? { provider: assistant.provider, model: assistant.model } : null,
    };
  }

  async function draft(req, res, body) {
    const existing = sessionForCurrentSeed();
    if (existing?.stale) {
      send(res, 409, { error: "The approved spec changed since this draft began. Reject or restart the authoring session before continuing.", authoring: existing });
      return;
    }
    let proposal;
    if (body.proposal !== undefined) {
      proposal = normalizeProposal(body.proposal);
    } else if (typeof body.message === "string" && body.message.trim()) {
      if (!assistant) {
        send(res, 409, { error: "No assistant is configured for this server; import a proposal JSON instead." });
        return;
      }
      const conversation = [...(existing?.conversation ?? []), { role: "user", content: body.message.trim() }];
      proposal = await assistant.propose({ conversation, seed: currentSeed(), draft: existing?.review?.draft ?? null });
      body = { ...body, conversation };
    } else {
      send(res, 400, { error: "POST a message for the assistant or a proposal object to import." });
      return;
    }

    const ratified = currentSeed();
    const problems = proposal.draft ? checkSeed({ context: [], ...proposal.draft }).problems : [];
    const review = {
      draft: proposal.draft,
      questions: proposal.questions,
      unsupported: proposal.unsupported,
      problems,
      diff: proposal.draft ? diffSeeds(ratified, proposal.draft) : null,
      contentHash: proposal.draft && !problems.length ? seedContentHash({ context: [], ...proposal.draft }) : null,
      source: body.proposal !== undefined ? "import" : "assistant",
    };
    const conversation = body.conversation ?? (existing?.conversation ?? []);
    const session = writeAuthoringSession(repoPath, {
      baseSeedHash: ratified ? seedContentHash(ratified) : null,
      conversation: [...conversation, { role: "assistant", content: JSON.stringify({ questions: proposal.questions, unsupported: proposal.unsupported }) }],
      review,
    });
    send(res, 200, { ...review, authoring: { ...session, stale: false } });
  }

  async function ratify(req, res, body) {
    if (!body.draft || typeof body.draft !== "object") {
      send(res, 400, { error: "POST the reviewed draft to ratify." });
      return;
    }
    const session = sessionForCurrentSeed();
    if (session?.stale || !session?.review?.draft || JSON.stringify(body.draft) !== JSON.stringify(session.review.draft)) {
      send(res, 409, { error: "The posted draft differs from the draft under review; draft again and review before ratifying." });
      return;
    }
    const check = checkSeed({ context: [], ...body.draft });
    if (!check.valid) {
      send(res, 422, { error: "Draft is not a valid seed", problems: check.problems });
      return;
    }
    const result = ratifySeed(repoPath, body.draft, { ratifiedAt: new Date().toISOString() });
    clearAuthoringSession(repoPath);
    broadcast({ type: "seed" });
    send(res, 200, { contentHash: result.contentHash, path: result.path });
  }

  return {
    async handle(req, res, url) {
      if (req.method === "GET" && url.pathname === "/api/seed") {
        send(res, 200, await seedStatus());
        return true;
      }
      if (req.method === "POST" && (url.pathname === "/api/seed/draft" || url.pathname === "/api/seed/ratify" || url.pathname === "/api/seed/draft/reject")) {
        if (!originOk(req, port)) {
          send(res, 403, { error: "Unexpected origin" });
          return true;
        }
        const body = await readJsonBody(req);
        if (url.pathname === "/api/seed/draft") await draft(req, res, body);
        else if (url.pathname === "/api/seed/ratify") await ratify(req, res, body);
        else {
          clearAuthoringSession(repoPath);
          send(res, 200, { draft: null });
        }
        return true;
      }
      return false;
    },
  };
}
