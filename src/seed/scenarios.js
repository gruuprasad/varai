// Bounded product scenarios (Seed v3 / ADR 0007). A scenario is a human-owned
// ordered example: sequential steps, principals bound to actor concepts,
// behavior invocation, scalar/JSON input, $capture.path references, exact
// status assertions, and partial body assertions. Nothing more — no
// concurrency, temporal windows, performance, arbitrary expressions, database
// inspection, or user-supplied test code.

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const CAPTURE_SLUG = SLUG;
const PATH_SEGMENT = "[a-zA-Z_][a-zA-Z0-9_]*";

export const SCENARIO_FIELDS = Object.freeze(["id", "name", "principals", "steps"]);
export const SCENARIO_PRINCIPAL_FIELDS = Object.freeze(["as", "actor"]);
export const SCENARIO_STEP_FIELDS = Object.freeze(["id", "as", "invoke", "input", "capture", "expect"]);
export const SCENARIO_EXPECT_FIELDS = Object.freeze(["status", "body"]);

export const SCENARIO_ID_PATTERN = new RegExp(`^scenario\\.${SLUG}$`);
export const SCENARIO_STEP_ID_PATTERN = new RegExp(`^${SLUG}$`);
export const SCENARIO_PRINCIPAL_AS_PATTERN = new RegExp(`^${SLUG}$`);
// Light schema-time shape for input refs: $capture.path[.more]. Full resolution is runtime.
export const SCENARIO_CAPTURE_REF_PATTERN = new RegExp(`^\\$${CAPTURE_SLUG}(?:\\.${PATH_SEGMENT})+$`);

export function scenarioId(name) {
  const slug = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  const id = `scenario.${slug}`;
  if (!SCENARIO_ID_PATTERN.test(id)) {
    throw new Error(`Cannot derive a scenario id from ${JSON.stringify(name)}`);
  }
  return id;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownFields(value, allowed, label, problems) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) problems.push({ code: "unknown-field", message: `${label} has unknown field ${key}` });
  }
}

function isScalarInput(value) {
  return ["string", "number", "boolean"].includes(typeof value);
}

function validateCaptureRefs(value, label, problems) {
  if (typeof value === "string") {
    if (value.startsWith("$") && !SCENARIO_CAPTURE_REF_PATTERN.test(value)) {
      problems.push({
        code: "invalid-scenario",
        message: `${label} capture reference ${JSON.stringify(value)} must look like $capture.path`,
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) validateCaptureRefs(item, label, problems);
    return;
  }
  if (isPlainObject(value)) {
    for (const nested of Object.values(value)) validateCaptureRefs(nested, label, problems);
  }
}

export function validateScenarios(seed, conceptById, seenIds, problems) {
  if (seed.formatVersion < 3) {
    if (seed.scenarios !== undefined) {
      problems.push({ code: "unsupported-field-for-format", message: "Seed scenarios require seed format version 3" });
    }
    return;
  }
  if (!Array.isArray(seed.scenarios)) {
    problems.push({ code: "invalid-collection", message: "Seed scenarios must be an array" });
    return;
  }
  for (const scenario of seed.scenarios) {
    if (!isPlainObject(scenario)) {
      problems.push({ code: "invalid-entry", message: "Scenario entries must be objects" });
      continue;
    }
    unknownFields(scenario, SCENARIO_FIELDS, `Scenario ${scenario.id}`, problems);
    if (typeof scenario.id !== "string" || !SCENARIO_ID_PATTERN.test(scenario.id)) {
      problems.push({ code: "invalid-id-format", message: `Scenario id ${JSON.stringify(scenario.id)} must match ${SCENARIO_ID_PATTERN}` });
    } else if (seenIds.has(scenario.id)) {
      problems.push({ code: "duplicate-id", message: `Duplicate stable ID: ${scenario.id}` });
    }
    if (typeof scenario.id === "string") seenIds.add(scenario.id);
    if (typeof scenario.name !== "string" || !scenario.name) {
      problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} requires a name` });
    }

    const principalAliases = new Set();
    if (!Array.isArray(scenario.principals)) {
      problems.push({ code: "invalid-collection", message: `Scenario ${scenario.id} principals must be an array` });
    } else if (scenario.principals.length === 0) {
      problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} requires at least one principal` });
    } else {
      for (const principal of scenario.principals) {
        if (!isPlainObject(principal)) {
          problems.push({ code: "invalid-entry", message: `Scenario ${scenario.id} principals must be objects` });
          continue;
        }
        unknownFields(principal, SCENARIO_PRINCIPAL_FIELDS, `Scenario ${scenario.id} principal`, problems);
        if (typeof principal.as !== "string" || !SCENARIO_PRINCIPAL_AS_PATTERN.test(principal.as)) {
          problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} principal alias ${JSON.stringify(principal.as)} must be a lower-kebab slug` });
        } else if (principalAliases.has(principal.as)) {
          problems.push({ code: "duplicate-id", message: `Scenario ${scenario.id} has duplicate principal alias ${principal.as}` });
        } else {
          principalAliases.add(principal.as);
        }
        if (typeof principal.actor !== "string" || !conceptById.has(principal.actor)) {
          problems.push({ code: "dangling-concept-reference", message: `Scenario ${scenario.id} principal actor ${JSON.stringify(principal.actor)} is not a declared concept` });
        } else if (conceptById.get(principal.actor)?.role !== "actor") {
          problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} principal actor ${JSON.stringify(principal.actor)} must reference an actor concept` });
        }
      }
    }

    const stepIds = new Set();
    if (!Array.isArray(scenario.steps)) {
      problems.push({ code: "invalid-collection", message: `Scenario ${scenario.id} steps must be an array` });
    } else if (scenario.steps.length === 0) {
      problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} requires at least one step` });
    } else {
      for (const step of scenario.steps) {
        if (!isPlainObject(step)) {
          problems.push({ code: "invalid-entry", message: `Scenario ${scenario.id} steps must be objects` });
          continue;
        }
        unknownFields(step, SCENARIO_STEP_FIELDS, `Scenario ${scenario.id} step ${step.id}`, problems);
        if (typeof step.id !== "string" || !SCENARIO_STEP_ID_PATTERN.test(step.id)) {
          problems.push({ code: "invalid-id-format", message: `Scenario ${scenario.id} step id ${JSON.stringify(step.id)} must be a lower-kebab slug` });
        } else if (stepIds.has(step.id)) {
          problems.push({ code: "duplicate-id", message: `Scenario ${scenario.id} has duplicate step id ${step.id}` });
        } else {
          stepIds.add(step.id);
        }
        if (typeof step.as !== "string" || !principalAliases.has(step.as)) {
          problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} step ${step.id} as ${JSON.stringify(step.as)} is not a declared principal` });
        }
        if (typeof step.invoke !== "string" || !conceptById.has(step.invoke)) {
          problems.push({ code: "dangling-concept-reference", message: `Scenario ${scenario.id} step ${step.id} invoke ${JSON.stringify(step.invoke)} is not a declared concept` });
        } else if (conceptById.get(step.invoke)?.role !== "behavior") {
          problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} step ${step.id} invoke must reference a behavior concept` });
        }
        if (step.input !== undefined) {
          if (!isPlainObject(step.input) && !isScalarInput(step.input)) {
            problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} step ${step.id} input must be a scalar or object` });
          } else {
            validateCaptureRefs(step.input, `Scenario ${scenario.id} step ${step.id}`, problems);
          }
        }
        if (step.capture !== undefined && (typeof step.capture !== "string" || !step.capture)) {
          problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} step ${step.id} capture must be a non-empty string` });
        }
        if (!isPlainObject(step.expect)) {
          problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} step ${step.id} requires an expect object` });
        } else {
          unknownFields(step.expect, SCENARIO_EXPECT_FIELDS, `Scenario ${scenario.id} step ${step.id} expect`, problems);
          if (typeof step.expect.status !== "number" || !Number.isInteger(step.expect.status)) {
            problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} step ${step.id} expect.status must be an integer` });
          }
          if (step.expect.body !== undefined && !isPlainObject(step.expect.body)) {
            problems.push({ code: "invalid-scenario", message: `Scenario ${scenario.id} step ${step.id} expect.body must be an object` });
          }
        }
      }
    }
  }
}
