export function renderMarkdownReport({ generatedAt, repoPath, intentPath, intent, scan, findings }) {
  const lines = [
    "# Varai Build State Report",
    "",
    `Generated: ${generatedAt}`,
    `Repo: ${repoPath}`,
    `Intent: ${intentPath}`,
    "",
    "## Summary",
    "",
    `- Files scanned: ${scan.summary.fileCount}`,
    `- Evidence facts found: ${scan.summary.factCount}`,
    `- Intent requirements: ${intent.requirements.length}`,
    "",
    "## Intent Coverage",
    ""
  ];

  if (findings.length === 0) {
    lines.push("No requirements were extracted from the intent file.");
  }

  for (const finding of findings) {
    const requirement = intent.requirements.find((item) => item.id === finding.requirementId);
    lines.push(`### ${finding.requirementId}: ${requirement?.text ?? "Unknown requirement"}`);
    lines.push("");
    lines.push(`Status: ${finding.status}`);
    lines.push("");
    lines.push(finding.summary);
    lines.push("");

    if (finding.missingLinks?.length > 0) {
      lines.push("Missing links:");
      for (const link of finding.missingLinks) {
        lines.push(`- ${link.label}`);
      }
      lines.push("");
    }

    if (finding.evidence.length > 0) {
      lines.push("Evidence:");
      for (const fact of finding.evidence) {
        const evidence = fact.evidence?.map((item) => item.file).join(", ") ?? "unknown";
        lines.push(`- ${fact.kind}: ${fact.name} (${evidence})`);
      }
      lines.push("");
    }
  }

  lines.push("## Build Surface");
  lines.push("");
  appendFacts(lines, "Pages", scan.facts.filter((fact) => fact.kind === "page"));
  appendFacts(lines, "API Routes", scan.facts.filter((fact) => fact.kind === "api_route"));
  appendFacts(lines, "Database Models", scan.facts.filter((fact) => fact.kind === "db_model"));
  appendFacts(lines, "Integrations", scan.facts.filter((fact) => fact.kind === "package" && fact.tags?.length));
  appendFacts(lines, "Signals", scan.facts.filter((fact) => fact.kind === "code_hint").slice(0, 30));

  lines.push("## Next Prompt");
  lines.push("");
  lines.push("Use this as a starting point for the next AI coding pass:");
  lines.push("");
  lines.push("```text");
  lines.push("Continue from the current repo. Use the Varai build-state report below as context.");
  lines.push("Focus on requirements marked unverified or partial. For each change, update code and keep evidence clear.");
  lines.push("");

  for (const finding of findings.filter((item) => item.status !== "satisfied")) {
    const requirement = intent.requirements.find((item) => item.id === finding.requirementId);
    lines.push(`- ${finding.status.toUpperCase()}: ${requirement?.text ?? finding.requirementId}`);
  }

  lines.push("```");
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- Varai marks requirements partial when related evidence exists but required capability links are missing.");
  lines.push("- A future LLM matcher should only use extracted evidence and should say unverifiable when evidence is weak.");

  return `${lines.join("\n")}\n`;
}

function appendFacts(lines, title, facts) {
  lines.push(`### ${title}`);
  lines.push("");

  if (facts.length === 0) {
    lines.push("None found.");
    lines.push("");
    return;
  }

  for (const fact of facts) {
    const evidence = fact.evidence?.map((item) => item.file).join(", ") ?? "unknown";
    lines.push(`- ${fact.name} (${evidence})`);
  }

  lines.push("");
}
