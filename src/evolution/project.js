import path from "node:path";
import { createBuildSessionStore } from "../build-session/store.js";
import { diffSeeds } from "../seed/diff.js";
import {
  classifyRequirementCoverage,
  classifyVerdictKind,
  isRequirementRegression,
} from "./report.js";

function byId(items = []) { return new Map(items.map((item) => [item.id, item])); }
function state(before, after) {
  if (!before && after) return "added";
  if (before && !after) return "removed";
  return JSON.stringify(before) === JSON.stringify(after) ? "unchanged" : "changed";
}
function bindingState(item) {
  if (!item) return null;
  return (item.bindings ?? []).map((binding) => `${binding.id}:${binding.state}`).sort().join("|");
}
function evidenceState(before, after) {
  const oldIds = (before?.claimIds ?? []).join("|");
  const newIds = (after?.claimIds ?? []).join("|");
  if (oldIds === newIds) return "unchanged";
  if (!oldIds) return "added";
  if (!newIds) return "removed";
  return "moved";
}

export async function projectProgression(repoPath, { from, to } = {}) {
  const root = path.resolve(repoPath);
  const store = createBuildSessionStore(root);
  const sessions = (await store.listSessions()).filter((session) => session.completion);
  const beforeSession = sessions.find((session) => session.id === from || session.id.startsWith(from ?? ""));
  const afterSession = sessions.find((session) => session.id === to || session.id.startsWith(to ?? ""));
  if (!beforeSession) throw new Error(`No completed build session matches "${from}"`);
  if (!afterSession) throw new Error(`No completed build session matches "${to}"`);
  const [beforeSeed, afterSeed, beforeReport, afterReport] = await Promise.all([
    store.getObject(beforeSession.seedObjectHash), store.getObject(afterSession.seedObjectHash),
    store.getObject(beforeSession.completion.reportHash), store.getObject(afterSession.completion.reportHash),
  ]);
  const seedDiff = diffSeeds(beforeSeed, afterSeed);
  const beforeCommitments = byId(beforeSeed.commitments);
  const afterCommitments = byId(afterSeed.commitments);
  const beforeResults = byId(beforeReport.commitments);
  const afterResults = byId(afterReport.commitments);
  const ids = [...new Set([...beforeCommitments.keys(), ...afterCommitments.keys()])].sort();
  return {
    formatVersion: 1,
    from: { id: beforeSession.id, completedAt: beforeSession.completedAt, mode: beforeSession.completion.mode, gate: beforeSession.gate ?? null },
    to: { id: afterSession.id, completedAt: afterSession.completedAt, mode: afterSession.completion.mode, gate: afterSession.gate ?? null },
    seedDiff,
    requirements: ids.map((id) => {
      const before = beforeCommitments.get(id);
      const after = afterCommitments.get(id);
      const oldResult = beforeResults.get(id);
      const newResult = afterResults.get(id);
      const oldBinding = bindingState(oldResult);
      const newBinding = bindingState(newResult);
      const verdictFrom = oldResult?.verdict ?? null;
      const verdictTo = newResult?.verdict ?? null;
      const verdictKind = classifyVerdictKind(verdictFrom, verdictTo);
      return {
        id,
        seed: state(before, after),
        implementation: evidenceState(oldResult, newResult),
        binding: oldBinding === newBinding ? "unchanged" : !oldBinding ? "added" : !newBinding ? "removed" : "retargeted",
        coverage: classifyRequirementCoverage(oldResult?.coverage ?? [], newResult?.coverage ?? []),
        verdict: { from: verdictFrom, to: verdictTo },
        verdictKind,
        requirementRegression: isRequirementRegression(verdictKind),
      };
    }),
  };
}
