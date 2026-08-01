import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runBuildBegin, runBuildClose } from "../../src/build-session/commands.js";
import { reconcile } from "../../src/reconciliation/check.js";
import { lintRealization, lintIsActionable } from "../../src/reconciliation/lint.js";
import { renderBuildPacket, renderBuildPacketJson } from "../../src/seed/handoff.js";
import { readRealization } from "../../src/reconciliation/witness-store.js";
import { readSeed, ratifySeed } from "../../src/seed/store.js";
import { migrateSeedToCurrent } from "../../src/seed/migrate.js";
import { checkSeed } from "../../src/seed/validate.js";
import { seedContentHash } from "../../src/seed/identity.js";
import { scanRepo } from "../../src/scanners/index.js";
import { deriveRuntimeMap } from "../../src/runtime/derive.js";
import { slotkeeperDraft } from "./fixtures.js";

const fixture = path.resolve("test/fixtures/authorization-state-app");

function twoRoleV4Draft() {
  return {
    formatVersion: 4,
    system: { id: "two-role", name: "Two Role Demo" },
    concepts: [
      { id: "actor.employee", role: "actor", name: "Employee" },
      { id: "actor.manager", role: "actor", name: "Manager" },
      { id: "behavior.request-leave", role: "behavior", name: "Request leave" },
      { id: "behavior.approve-leave", role: "behavior", name: "Approve leave" },
      {
        id: "resource.leave-request",
        role: "resource",
        name: "Leave request",
        stateModel: {
          initial: "submitted",
          states: ["submitted", "approved", "rejected"],
          transitions: [
            { from: "submitted", to: "approved", via: ["behavior.approve-leave"] },
            { from: "submitted", to: "rejected", via: ["behavior.approve-leave"] },
          ],
        },
        fields: [
          { name: "employee_id", type: "string", required: true },
          { name: "days", type: "integer", required: true },
        ],
      },
    ],
    commitments: [
      { id: "commitment.request-creates-leave", source: "behavior.request-leave", relation: "creates", target: { concept: "resource.leave-request" }, expectation: "present" },
      { id: "commitment.approve-changes-state", source: "behavior.approve-leave", relation: "changes", target: { literal: "approved" }, expectation: "present" },
    ],
    surfaces: [
      { id: "surface.request-leave-api", name: "Request leave API", behavior: "behavior.request-leave", channel: "api", access: "authenticated" },
      { id: "surface.approve-leave-api", name: "Approve leave API", behavior: "behavior.approve-leave", channel: "api", access: "authenticated" },
    ],
    scenarios: [],
    flows: [
      { id: "flow.leave-cycle", name: "Leave cycle", entry: "surface.request-leave-api", members: ["behavior.request-leave", "behavior.approve-leave"] },
    ],
    context: [],
  };
}

test("journey 1: a two-role v4 workflow can be drafted, reviewed, and left unapproved", () => {
  const draft = twoRoleV4Draft();
  const validation = checkSeed(draft);
  assert.equal(validation.valid, true, validation.problems.map((problem) => problem.message).join("; "));
  assert.notEqual(draft.ratification?.status, "ratified", "drafting never ratifies");
  const resource = draft.concepts.find((concept) => concept.id === "resource.leave-request");
  assert.equal(resource.stateModel.transitions.length, 2);
  assert.equal(resource.fields.length, 2);
  assert.equal(draft.flows.length, 1);
});

test("journey 2: a v3 fixture migrates to an unapproved v4 draft with empty flows", () => {
  const migrated = migrateSeedToCurrent(slotkeeperDraft());
  assert.equal(migrated.formatVersion, 4);
  assert.deepEqual(migrated.flows, []);
  assert.deepEqual(migrated.ratification, { status: "draft" });
  assert.equal(checkSeed(migrated).valid, true);
});


test("journey 3: the ratified v4 fixture flows through handoff, lint, derive, check, and build close", async () => {
  // Fresh git-backed copy so build close can record a session.
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "varai-v4-journey-"));
  fs.cpSync(fixture, repo, { recursive: true });
  execFileSync("git", ["init", "-q", repo]);
  execFileSync("git", ["-C", repo, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", repo, "config", "user.name", "Test"]);
  execFileSync("git", ["-C", repo, "add", "."]);
  execFileSync("git", ["-C", repo, "commit", "-qm", "base"]);
  try {
    const seedInput = readSeed(repo);
    assert.equal(seedInput.ratified, true, "the fixture seed is ratified");

    // Handoff: the packet carries the v4 constructs.
    const packet = renderBuildPacket({ seed: seedInput.seed });
    assert.ok(packet.includes("state model: starts pending"), "packet renders the state model");
    assert.ok(packet.includes("fields: amount: number, description: string"), "packet renders field contracts");
    assert.ok(packet.includes("## Flows"), "packet renders flows");
    const jsonPacket = renderBuildPacketJson({ seed: seedInput.seed });
    assert.equal(jsonPacket.baseline.present, false);
    assert.ok(jsonPacket.packet.includes("## Flows"));

    // Lint: the witness resolves against the current model.
    const model = (await scanRepo(repo, { jobs: 1, cache: false })).model;
    const { realization } = readRealization(repo, { seed: seedInput.seed });
    const lint = lintRealization({ model, seed: seedInput.seed, realization });
    assert.equal(lintIsActionable(lint), true, "the v4 fixture witness lints actionable");

    // Derive: no runtime baseline exists, so it must report unresolved rather
    // than invent configuration.
    const derived = deriveRuntimeMap({ model, seed: seedInput.seed, realization });
    assert.equal(derived.ok, false);
    assert.ok(derived.unresolved.includes("baseUrl"));
    assert.equal(derived.runtime, null);

    // Check: commitments, state models, field contracts, flows all present.
    const report = reconcile({ model, seed: seedInput.seed, realization });
    assert.equal(report.summary.violated, 0);
    assert.equal(report.stateModels.length, 1);
    assert.equal(report.fieldContracts.length, 1);
    assert.equal(report.flows.length, 1);
    assert.ok(report.stateModels[0].transitions.some((t) => t.verdict === "holds"));

    // Build session: begin + close reach the ready gate with zero violations.
    await runBuildBegin({ repo, json: true, cache: false, jobs: 1, quiet: true });
    const closed = await runBuildClose({ repo, mode: "built", json: true, cache: false, jobs: 1, quiet: true });
    assert.equal(closed.session.gate?.state, "ready", JSON.stringify(closed.session.gate?.reasons));
    assert.equal(closed.session.gate.stateModelProblems.length, 0);
    assert.equal(closed.session.gate.fieldContractProblems.length, 0);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("journey 4: programmatic ratification is synthetic setup, never approval of new intent", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "varai-v4-ratify-"));
  try {
    const draft = twoRoleV4Draft();
    fs.writeFileSync(path.join(repo, "varai.seed.json"), JSON.stringify(draft));
    const ratified = ratifySeed(repo, draft, { ratifiedAt: "2026-08-01T00:00:00.000Z" });
    const read = readSeed(repo);
    assert.equal(read.ratified, true);
    assert.equal(read.contentHash, seedContentHash(draft));
    assert.equal(ratified.seed.ratification.status, "ratified");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
