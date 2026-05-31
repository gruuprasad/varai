function factFile(fact) {
  return (fact.evidence ?? []).map((item) => item.file).join(" ").toLowerCase();
}

function factText(fact) {
  return [
    fact.kind,
    fact.name,
    fact.detail,
    ...(fact.tags ?? []),
    factFile(fact)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isUiFile(file) {
  return file.includes("/components/") || file.includes("components/") || file.includes("/page.") || file.startsWith("pages/");
}

const CHECKS = {
  checkout_ui: {
    label: "Checkout UI",
    match(fact) {
      const text = factText(fact);
      if (fact.kind === "component" && /checkout|billing|pricing|stripe/.test(text)) return true;
      if (fact.kind === "page" && /checkout|billing|pricing|stripe/.test(text)) return true;
      if (fact.kind === "code_hint" && fact.name === "payment" && isUiFile(factFile(fact))) return true;
      return false;
    }
  },
  stripe_integration: {
    label: "Stripe integration",
    match(fact) {
      const text = factText(fact);
      if (fact.kind === "package" && (fact.name === "stripe" || text.includes("stripe"))) return true;
      if (fact.kind === "api_route" && /stripe|checkout|billing/.test(text)) return true;
      return false;
    }
  },
  webhook_handler: {
    label: "Webhook handler",
    match(fact) {
      const text = factText(fact);
      if (fact.kind === "webhook_route") return true;
      if (fact.kind === "api_route" && /webhook/.test(text)) return true;
      if (fact.kind === "code_hint" && fact.name === "payment" && factFile(fact).includes("/api/") && /webhook/.test(text)) return true;
      return false;
    }
  },
  notification_ui: {
    label: "Notification UI",
    match(fact) {
      const text = factText(fact);
      if (fact.kind === "component" && /notification|bell|inbox/.test(text)) return true;
      if (fact.kind === "code_hint" && fact.name === "notification" && isUiFile(factFile(fact))) return true;
      return false;
    }
  },
  notification_persistence: {
    label: "Notification persistence",
    match(fact) {
      const text = factText(fact);
      if (fact.kind === "db_model" && /notification/.test(text)) return true;
      if (fact.kind === "database_migration" && /notification/.test(text)) return true;
      return false;
    }
  },
  notification_api: {
    label: "Notification API",
    match(fact) {
      const text = factText(fact);
      if (fact.kind === "api_route" && /notification/.test(text)) return true;
      return false;
    }
  },
  auth_ui: {
    label: "Auth UI",
    match(fact) {
      const text = factText(fact);
      if (fact.kind === "page" && /login|signup|sign-in|sign-up|auth/.test(text)) return true;
      if (fact.kind === "code_hint" && fact.name === "auth" && isUiFile(factFile(fact))) return true;
      return false;
    }
  },
  auth_integration: {
    label: "Auth integration",
    match(fact) {
      const text = factText(fact);
      if (fact.kind === "package" && (fact.tags?.includes("auth") || /auth|clerk|supabase/.test(text))) return true;
      if (fact.kind === "api_route" && /auth|login|signup|session/.test(text)) return true;
      return false;
    }
  },
  task_surface: {
    label: "Task surface",
    match(fact) {
      const text = factText(fact);
      if (fact.kind === "page" && /task/.test(text)) return true;
      if (fact.kind === "api_route" && /task/.test(text)) return true;
      if (fact.kind === "db_model" && fact.name === "Task") return true;
      return false;
    }
  }
};

export const CAPABILITIES = [
  {
    name: "payments",
    terms: ["stripe", "checkout", "payment", "billing", "subscription", "invoice", "webhook"],
    resolveProfile(text) {
      const lower = text.toLowerCase();
      if (/webhook/.test(lower)) {
        return { name: "webhook_confirmation", required: ["checkout_ui", "webhook_handler"] };
      }
      if (/stripe|billing|checkout|payment|subscription|invoice/.test(lower)) {
        return { name: "billing", required: ["checkout_ui", "stripe_integration"] };
      }
      return null;
    }
  },
  {
    name: "notifications",
    terms: ["notification", "notifications", "notify", "inbox", "bell"],
    resolveProfile(text) {
      const lower = text.toLowerCase();
      if (/mark.*read|read notification/.test(lower)) {
        return { name: "mark_read", required: ["notification_ui", "notification_persistence", "notification_api"] };
      }
      if (/notification|notify|bell|inbox/.test(lower)) {
        return { name: "receive_notifications", required: ["notification_ui", "notification_persistence"] };
      }
      return null;
    }
  },
  {
    name: "authentication",
    terms: ["auth", "login", "logout", "signup", "sign-in", "sign-up", "session"],
    resolveProfile(text) {
      const lower = text.toLowerCase();
      if (/sign up|signup|log in|login|auth/.test(lower) && /task/.test(lower)) {
        return { name: "auth_and_tasks", required: ["auth_ui", "auth_integration", "task_surface"] };
      }
      if (/sign up|signup|log in|login|auth/.test(lower)) {
        return { name: "auth", required: ["auth_ui", "auth_integration"] };
      }
      return null;
    }
  },
  {
    name: "admin",
    terms: ["admin", "role", "roles", "permission", "permissions", "rbac", "approve"],
    resolveProfile(text) {
      const lower = text.toLowerCase();
      if (/admin|approve|permission|rbac|role/.test(lower)) {
        return { name: "admin_access", required: ["admin_ui", "admin_api"] };
      }
      return null;
    }
  }
];

CHECKS.admin_ui = {
  label: "Admin UI",
  match(fact) {
    const text = factText(fact);
    if (fact.kind === "page" && /admin|approve/.test(text)) return true;
    if (fact.kind === "code_hint" && fact.name === "permission" && isUiFile(factFile(fact))) return true;
    return false;
  }
};

CHECKS.admin_api = {
  label: "Admin API",
  match(fact) {
    const text = factText(fact);
    if (fact.kind === "api_route" && /admin|approve|permission/.test(text)) return true;
    if (fact.kind === "code_hint" && fact.name === "permission" && factFile(fact).includes("/api/")) return true;
    return false;
  }
};

export function evaluateCapabilityRequirement(requirement, facts) {
  for (const capability of CAPABILITIES) {
    const lower = requirement.text.toLowerCase();
    if (!capability.terms.some((term) => lower.includes(term))) {
      continue;
    }

    const profile = capability.resolveProfile(requirement.text);
    if (!profile) {
      continue;
    }

    const matchedChecks = [];
    const missingLinks = [];
    const evidence = [];

    for (const checkId of profile.required) {
      const check = CHECKS[checkId];
      const matchingFacts = facts.filter((fact) => check.match(fact));

      if (matchingFacts.length > 0) {
        matchedChecks.push(checkId);
        evidence.push(...matchingFacts);
      } else {
        missingLinks.push({ id: checkId, label: check.label });
      }
    }

    if (matchedChecks.length === 0) {
      return {
        requirementId: requirement.id,
        status: "unverified",
        summary: "No direct local evidence found for this requirement.",
        evidence: [],
        missingLinks: profile.required.map((checkId) => ({
          id: checkId,
          label: CHECKS[checkId].label
        })),
        hintedCapabilities: [capability.name],
        profile: profile.name
      };
    }

    if (missingLinks.length > 0) {
      const missingLabels = missingLinks.map((link) => link.label).join(", ");
      return {
        requirementId: requirement.id,
        status: "partial",
        summary: `Related evidence exists, but these links are missing: ${missingLabels}.`,
        evidence: uniqueFacts(evidence).slice(0, 8),
        missingLinks,
        hintedCapabilities: [capability.name],
        profile: profile.name
      };
    }

    return {
      requirementId: requirement.id,
      status: "satisfied",
      summary: "Required capability links are evidenced locally.",
      evidence: uniqueFacts(evidence).slice(0, 8),
      missingLinks: [],
      hintedCapabilities: [capability.name],
      profile: profile.name
    };
  }

  return null;
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
