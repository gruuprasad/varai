import { evaluateCapabilityRequirement } from "./capabilities.js";

export function matchIntentToScan(intent, scan) {
  const searchableFacts = scan.facts.map((fact) => ({
    fact,
    text: [
      fact.kind,
      fact.name,
      fact.detail,
      ...(fact.tags ?? []),
      ...(fact.evidence ?? []).map((item) => item.file)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
  }));

  return intent.requirements.map((requirement) => {
    const capabilityFinding = evaluateCapabilityRequirement(requirement, scan.facts);
    if (capabilityFinding) {
      return capabilityFinding;
    }

    return matchByKeywords(requirement, searchableFacts);
  });
}

function matchByKeywords(requirement, searchableFacts) {
  const keywordVariants = expandKeywords(requirement.keywords);
  const broadMatches = searchableFacts
    .filter(({ text }) => keywordVariants.some((keyword) => text.includes(keyword)))
    .slice(0, 8)
    .map(({ fact }) => fact);

  if (broadMatches.length === 0) {
    return {
      requirementId: requirement.id,
      status: "unverified",
      summary: "No direct local evidence found for this requirement.",
      evidence: [],
      missingLinks: []
    };
  }

  return {
    requirementId: requirement.id,
    status: "partial",
    summary: "Some related evidence exists, but Varai cannot yet prove full implementation.",
    evidence: uniqueFacts(broadMatches).slice(0, 8),
    missingLinks: []
  };
}

function expandKeywords(keywords) {
  const variants = new Set(keywords);

  for (const keyword of keywords) {
    if (keyword.endsWith("s") && keyword.length > 4) {
      variants.add(keyword.slice(0, -1));
    }
  }

  return [...variants];
}

function uniqueFacts(facts) {
  const seen = new Set();

  return facts.filter((fact) => {
    const key = `${fact.kind}:${fact.name}:${fact.evidence?.[0]?.file ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
