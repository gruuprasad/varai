const CAPABILITY_HINTS = [
  {
    name: "authentication",
    terms: ["auth", "login", "logout", "signup", "sign-in", "clerk", "supabase", "next-auth"]
  },
  {
    name: "payments",
    terms: ["stripe", "checkout", "payment", "billing", "subscription", "invoice", "webhook"]
  },
  {
    name: "email",
    terms: ["email", "mail", "resend", "postmark", "sendgrid", "nodemailer"]
  },
  {
    name: "notifications",
    terms: ["notification", "notifications", "notify", "inbox", "bell"]
  },
  {
    name: "admin",
    terms: ["admin", "role", "roles", "permission", "permissions", "rbac"]
  },
  {
    name: "uploads",
    terms: ["upload", "uploads", "file", "files", "storage", "s3", "bucket"]
  }
];

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
    const keywordVariants = expandKeywords(requirement.keywords);
    const broadMatches = searchableFacts
      .filter(({ text }) => keywordVariants.some((keyword) => text.includes(keyword)))
      .slice(0, 8)
      .map(({ fact }) => fact);

    const hintedCapabilityConfigs = CAPABILITY_HINTS
      .filter((hint) => hint.terms.some((term) => requirement.text.toLowerCase().includes(term)));
    const hintedCapabilities = hintedCapabilityConfigs.map((hint) => hint.name);
    const capabilityTerms = hintedCapabilityConfigs.flatMap((hint) => hint.terms);
    const capabilityMatches = searchableFacts
      .filter(({ text }) => capabilityTerms.some((term) => text.includes(term)))
      .map(({ fact }) => fact);

    if (broadMatches.length === 0 || (hintedCapabilities.length > 0 && capabilityMatches.length === 0)) {
      return {
        requirementId: requirement.id,
        status: "unverified",
        summary: "No direct local evidence found for this requirement.",
        evidence: [],
        hintedCapabilities
      };
    }

    return {
      requirementId: requirement.id,
      status: "partial",
      summary: "Some related evidence exists, but Varai v0 cannot yet prove full implementation.",
      evidence: uniqueFacts([...capabilityMatches, ...broadMatches]).slice(0, 8),
      hintedCapabilities
    };
  });
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
