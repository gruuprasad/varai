import { evaluateCapabilityRequirement } from "./capabilities.js";

const SPECIFIC_DOMAINS = new Set(["notifications", "payments", "admin", "authentication"]);

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
  const requirementDomains = domainsForText(requirement.text);
  const broadMatches = searchableFacts
    .filter(({ fact, text }) => keywordVariants.some((keyword) => text.includes(keyword))
      && hasDomainOverlap(requirementDomains, domainsForFact(fact)))
    .slice(0, 8)
    .map(({ fact }) => fact);

  if (broadMatches.length === 0) {
    return unverifiedFinding(requirement.id);
  }

  const specificDomains = [...requirementDomains].filter((domain) => SPECIFIC_DOMAINS.has(domain));
  if (specificDomains.length > 0) {
    const coversSpecificDomain = broadMatches.some((fact) =>
      specificDomains.some((domain) => domainsForFact(fact).has(domain))
    );

    if (!coversSpecificDomain) {
      return unverifiedFinding(requirement.id);
    }
  }

  const directMatches = broadMatches.filter((fact) =>
    keywordVariants.some((keyword) => keywordMatchesFactName(keyword, fact))
  );

  if (directMatches.length === 0) {
    return unverifiedFinding(requirement.id);
  }

  return {
    requirementId: requirement.id,
    status: "partial",
    summary: "Some related evidence exists, but Varai cannot yet prove full implementation.",
    evidence: uniqueFacts(directMatches).slice(0, 8),
    missingLinks: []
  };
}

function domainsForText(text) {
  const lower = text.toLowerCase();
  const domains = new Set();

  if (/notif|bell|inbox/.test(lower)) domains.add("notifications");
  if (/stripe|billing|checkout|payment|webhook|subscription|invoice/.test(lower)) domains.add("payments");
  if (/admin|approve|permission|rbac|role/.test(lower)) domains.add("admin");
  if (/auth|login|logout|signup|sign-up|sign.in|session/.test(lower)) domains.add("authentication");
  if (/task|todo/.test(lower)) domains.add("tasks");

  return domains;
}

function domainsForFact(fact) {
  const text = [
    fact.kind,
    fact.name,
    fact.detail,
    ...(fact.tags ?? []),
    ...(fact.evidence ?? []).map((item) => item.file)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const domains = new Set();

  if (/notif|bell|inbox/.test(text)) domains.add("notifications");
  if (/stripe|billing|checkout|payment|webhook|subscription/.test(text)) domains.add("payments");
  if (/admin|approve|permission|rbac|role/.test(text)) domains.add("admin");
  if (/auth|login|logout|signup|sign.in|session|next-auth|clerk/.test(text)) domains.add("authentication");
  if (/task|todo/.test(text)) domains.add("tasks");

  return domains;
}

function hasDomainOverlap(requirementDomains, factDomains) {
  if (requirementDomains.size === 0 || factDomains.size === 0) {
    return true;
  }

  for (const domain of requirementDomains) {
    if (factDomains.has(domain)) {
      return true;
    }
  }

  return false;
}

function keywordMatchesFactName(keyword, fact) {
  const haystack = [
    fact.name,
    fact.detail,
    ...(fact.tags ?? []),
    fact.kind === "code_hint" ? fact.name : ""
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(keyword);
}

function unverifiedFinding(requirementId) {
  return {
    requirementId,
    status: "unverified",
    summary: "No direct local evidence found for this requirement.",
    evidence: [],
    missingLinks: []
  };
}

function expandKeywords(keywords) {
  const variants = new Set(keywords);

  for (const keyword of keywords) {
    if (keyword.endsWith("s") && keyword.length > 4) {
      variants.add(keyword.slice(0, -1));
    }

    if (keyword.endsWith("ed") && keyword.length > 5) {
      variants.add(keyword.slice(0, -2));
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
