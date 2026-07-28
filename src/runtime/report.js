// Human-readable scenario verification report. Language stays at "scenario
// passed/failed/could not run" — never universal invariants.

export function scenariosSummary(results = []) {
  const count = (result) => results.filter((item) => item.result === result).length;
  return {
    total: results.length,
    passed: count("passed"),
    failed: count("failed"),
    couldNotRun: count("could_not_run"),
  };
}

export function attachScenariosSection(report, scenarioRun) {
  if (!scenarioRun) return report;
  const results = scenarioRun.scenarios ?? scenarioRun.results ?? [];
  return {
    ...report,
    scenarios: {
      runId: scenarioRun.id ?? null,
      seedHash: scenarioRun.seedHash ?? null,
      results: results.map((item) => ({
        id: item.id,
        name: item.name,
        result: item.result,
        reasons: item.reasons ?? [],
      })),
      summary: scenariosSummary(results),
      // Builder-authored tests are optional supporting metadata only.
      builderTests: scenarioRun.builderTests ?? [],
    },
    summary: {
      ...report.summary,
      scenarios: scenariosSummary(results),
    },
  };
}

export function renderScenarioVerifyText(run) {
  const lines = [];
  lines.push(`Scenario verification — ${run.systemName ?? "system"}`);
  lines.push(`Spec ${run.seedHash}`);
  lines.push(`Run ${run.id} (${run.contentHash})`);
  lines.push("");
  for (const scenario of run.scenarios ?? []) {
    const label = scenario.result === "passed" ? "scenario passed"
      : scenario.result === "failed" ? "scenario failed"
        : "scenario could not run";
    lines.push(`${label}  ${scenario.id}`);
    lines.push(`    ${scenario.name}`);
    for (const reason of scenario.reasons ?? []) lines.push(`    why: ${reason}`);
    lines.push("");
  }
  const summary = scenariosSummary(run.scenarios);
  lines.push([
    `${summary.total} scenarios:`,
    `${summary.passed} passed,`,
    `${summary.failed} failed,`,
    `${summary.couldNotRun} could not run`,
  ].join(" "));
  return `${lines.join("\n")}\n`;
}
