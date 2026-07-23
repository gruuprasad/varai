import { behavioralEnvelopes } from "../system-model/projections/index.js";
import { reconcile } from "../reconciliation/check.js";
import { readRealization } from "../reconciliation/witness-store.js";
import { readSeed } from "../seed/store.js";

// The domain review projection: a serialization of already-derived
// reconciliation data (report + canonical model + envelopes) shaped for the
// dashboard review loop. Nothing here re-decides verdicts; builder testimony
// stays visibly separate from independently observed evidence.

function evidenceKey(entry) {
  return `${entry.file}:${entry.line ?? ""}:${entry.symbol ?? ""}`;
}

function readingOrderFor(item, matchedClaims, elementById) {
  const steps = [];
  const seen = new Set();
  const push = (entry, why) => {
    if (!entry?.file) return;
    const key = `${evidenceKey(entry)}:${why}`;
    const locationKey = evidenceKey(entry);
    if (seen.has(locationKey)) return;
    seen.add(locationKey);
    steps.push({
      file: entry.file,
      ...(entry.line == null ? {} : { line: entry.line }),
      ...(entry.symbol == null ? {} : { symbol: entry.symbol }),
      why,
    });
  };
  // Begin at the resolved public behavior (interface boundary)…
  for (const binding of item.bindings ?? []) {
    for (const id of binding.elementIds ?? []) {
      const element = elementById.get(id);
      if (element && (element.roles ?? []).includes("interface")) {
        push(element.evidence?.[0], "interface");
      }
    }
  }
  // …then follow the observed implementation path to effects and outcomes…
  for (const claim of matchedClaims) {
    for (const entry of claim.implementationPath ?? []) push(entry, "path");
  }
  // …and end at the source evidence behind the verdict.
  for (const claim of matchedClaims) {
    for (const entry of claim.evidence ?? []) push(entry, "evidence");
  }
  return steps;
}

export function buildReviewProjection({ report, model, seed }) {
  if (!report || !model) return null;
  const elementById = new Map((model.elements ?? []).map((element) => [element.id, element]));
  const claimById = new Map((model.claims ?? []).map((claim) => [claim.id, claim]));
  const envelopes = behavioralEnvelopes(model).envelopes ?? [];

  // Plain names for concepts, so no surface has to render raw ids.
  const conceptName = new Map((seed?.concepts ?? []).map((concept) => [concept.id, concept.name]));
  const nameOf = (id) => conceptName.get(id) ?? id;
  const targetLabel = (target) => target?.concept !== undefined ? nameOf(target.concept) : String(target?.literal);

  const cards = (report.commitments ?? []).map((item) => {
    const matchedClaims = (item.claimIds ?? []).map((id) => claimById.get(id)).filter(Boolean);
    const bindings = (item.bindings ?? []).map((binding) => ({
      id: binding.id,
      concept: binding.concept,
      state: binding.state,
      reason: binding.reason,
      elements: (binding.elementIds ?? []).map((id) => {
        const element = elementById.get(id);
        return element ? { id, name: element.name, kind: element.kind } : { id, name: id, kind: null };
      }),
    }));
    const elementIds = bindings.flatMap((binding) => binding.elements.map((element) => element.id));
    const envelope = envelopes.find((candidate) =>
      elementIds.some((id) => candidate.behaviorIds?.includes(id)));
    return {
      id: item.id,
      source: item.source,
      relation: item.relation,
      target: item.target,
      sourceName: nameOf(item.source),
      targetName: targetLabel(item.target),
      bindingState: item.bindingState,
      verdict: item.verdict,
      reasons: item.reasons,
      bindings,
      claims: matchedClaims.map((claim) => ({
        id: claim.id,
        relation: claim.relation,
        claimState: claim.claimState,
        targetName: claim.target?.kind === "reference"
          ? elementById.get(claim.target.id)?.name ?? claim.target.id
          : String(claim.target?.value),
        evidence: claim.evidence ?? [],
        implementationPath: claim.implementationPath ?? [],
      })),
      coverage: item.coverage ?? [],
      envelope: envelope ? { id: envelope.id, name: envelope.name, completeness: envelope.completeness } : null,
      readingOrder: readingOrderFor(item, matchedClaims, elementById),
    };
  });

  const groupsByConcept = new Map();
  for (const card of cards) {
    const list = groupsByConcept.get(card.source) ?? [];
    list.push(card);
    groupsByConcept.set(card.source, list);
  }
  // not_checkable commitments can never be confirmed, so counting them in the
  // denominator reads as failure when nothing failed. They are reported apart.
  const groups = [...groupsByConcept.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([concept, items]) => {
      const checkableCards = items.filter((card) => card.verdict !== "not_checkable");
      return {
        concept,
        conceptName: nameOf(concept),
        cards: items.sort((a, b) => a.id.localeCompare(b.id)),
        holds: items.filter((card) => card.verdict === "holds").length,
        checkable: checkableCards.length,
        notCheckable: items.length - checkableCards.length,
        total: items.length,
      };
    });

  return {
    // The review is about the spec, so it carries the spec's name for the
    // system. report.system is the scanned repo's name, which is often the
    // directory — showing it here disagrees with the Spec page one click away.
    system: seed?.system ?? report.system,
    seedHash: report.seedHash,
    ratified: report.ratified,
    realization: report.realization,
    summary: report.summary,
    context: report.context ?? [],
    groups,
    coverageLimitations: cards
      .filter((card) => card.verdict === "cannot_verify")
      .map((card) => ({ id: card.id, reasons: card.reasons, coverage: card.coverage })),
  };
}

function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(JSON.stringify(data));
}

export function createReconciliationHandler({ repoPath, getModel }) {
  return {
    async handle(req, res, url) {
      if (req.method !== "GET" || url.pathname !== "/api/reconciliation") return false;
      const input = readSeed(repoPath);
      if (!input) {
        send(res, 200, { seed: null, report: null, review: null });
        return true;
      }
      let realization = null;
      let realizationProblems = [];
      try {
        realization = readRealization(repoPath, { seed: input.seed })?.realization ?? null;
      } catch (err) {
        realizationProblems = err.problems ?? [{ code: "invalid-realization", message: err.message }];
      }
      const model = await getModel();
      const report = model ? reconcile({ model, seed: input.seed, realization }) : null;
      const review = report && model ? buildReviewProjection({ report, model, seed: input.seed }) : null;
      send(res, 200, { seed: input.seed, report, review, realizationProblems });
      return true;
    },
  };
}
