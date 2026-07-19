import { validateSystemModel } from "../validate.js";
import { behaviorFrames } from "./behavior-frames.js";
import { indexModel } from "./shared.js";

const MAX_PATH_DEPTH = 32;

export function systemPaths(model) {
  validateSystemModel(model);
  const index = indexModel(model);
  const frames = behaviorFrames(model).frames;
  const frameByBehavior = new Map(frames.map((item) => [item.behaviorId, item]));
  const incomingInvokes = new Set(model.claims
    .filter((claim) => claim.relation === "invokes" && claim.target.kind === "reference")
    .map((claim) => claim.target.id));
  const roots = frames.filter((frame) => referenceInvocations(frame, model).length && !incomingInvokes.has(frame.behaviorId));
  const paths = [];
  const diagnostics = [];

  for (const root of roots) {
    walk(root.behaviorId, [{ behaviorId: root.behaviorId, viaClaimId: null }], new Set([root.behaviorId]));
  }

  function walk(behaviorId, steps, seen) {
    if (steps.length > MAX_PATH_DEPTH) {
      diagnostics.push({ code: "system-path-depth-exhausted", elementId: behaviorId });
      emit(steps);
      return;
    }
    const outgoing = (index.outgoing.get(behaviorId) ?? [])
      .filter((claim) => claim.relation === "invokes" && claim.target.kind === "reference")
      .filter((claim) => frameByBehavior.has(claim.target.id));
    if (!outgoing.length) {
      if (steps.length > 1) emit(steps);
      return;
    }
    for (const claim of outgoing) {
      if (seen.has(claim.target.id)) {
        diagnostics.push({ code: "system-path-cycle", elementId: claim.target.id, claimId: claim.id });
        emit(steps);
        continue;
      }
      walk(claim.target.id, [...steps, { behaviorId: claim.target.id, viaClaimId: claim.id }], new Set([...seen, claim.target.id]));
    }
  }

  function emit(steps) {
    const pathFrames = steps.map((step) => frameByBehavior.get(step.behaviorId)).filter(Boolean);
    paths.push({
      id: `path:${steps.map((step) => step.behaviorId).join(">")}`,
      name: pathFrames[0]?.name ?? index.elements.get(steps[0].behaviorId)?.name ?? "Observed path",
      entryBehaviorId: steps[0].behaviorId,
      terminalBehaviorId: steps.at(-1).behaviorId,
      steps,
      interfaceIds: [...new Set(pathFrames.flatMap((frame) => frame.interfaceIds))].sort(),
      subjectIds: [...new Set(pathFrames.flatMap((frame) => frame.subjectIds))].sort(),
      claimIds: [...new Set(pathFrames.flatMap((frame) => frame.claimIds))].sort(),
    });
  }

  paths.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return {
    kind: "system-paths",
    paths: dedupePaths(paths),
    diagnostics: diagnostics.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
}

function referenceInvocations(frame, model) {
  const ids = new Set(frame.invocationClaimIds);
  return model.claims.filter((claim) => ids.has(claim.id) && claim.target.kind === "reference");
}

function dedupePaths(paths) {
  const byId = new Map();
  for (const item of paths) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()];
}
