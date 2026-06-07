import assert from "node:assert/strict";
import test from "node:test";
import { renderInventory } from "../src/reporters/inventory.js";

const FACTS = [
  { kind: "api_route",          name: "POST /api/auth/login",   evidence: [{ file: "routes/auth.py",     line: 24 }], layer: "ast" },
  { kind: "api_route",          name: "GET /api/projects",      evidence: [{ file: "routes/projects.py", line: 8  }], layer: "ast" },
  { kind: "webhook_route",      name: "POST /webhooks/stripe",  evidence: [{ file: "routes/hooks.py",    line: 5  }], layer: "ast" },
  { kind: "db_model",           name: "User",                   evidence: [{ file: "models/user.py",     line: 12 }], layer: "ast" },
  { kind: "db_model",           name: "Project",                evidence: [{ file: "models/project.py",  line: 6  }], layer: "ast" },
  { kind: "state_store",        name: "planStore",              evidence: [{ file: "src/store/plan.js"             }], layer: "ast" },
  { kind: "package",            name: "fastapi",                evidence: [{ file: "pyproject.toml"                }], layer: "heuristic" },
  { kind: "package",            name: "react",                  evidence: [{ file: "package.json"                  }], layer: "heuristic" },
  { kind: "env_var",            name: "DATABASE_URL",           evidence: [{ file: "config.py"                     }], layer: "heuristic" },
  { kind: "env_var",            name: "JWT_SECRET",             evidence: [{ file: "config.py"                     }], layer: "heuristic" },
  { kind: "database_migration", name: "001_initial.py",         evidence: [{ file: "alembic/versions/001.py"       }], layer: "heuristic" },
];

test("header uses the repo directory name", () => {
  const out = renderInventory({ repoPath: "/home/user/kalakar", scan: { facts: FACTS } });
  assert.ok(out.startsWith("# App Map — kalakar\n"));
});

test("API Routes section shows count and file:line refs", () => {
  const out = renderInventory({ repoPath: "/x/kalakar", scan: { facts: FACTS } });
  assert.ok(out.includes("## API Routes (2)"));
  assert.ok(out.includes("POST /api/auth/login"));
  assert.ok(out.includes("routes/auth.py:24"));
});

test("Webhook Routes rendered separately", () => {
  const out = renderInventory({ repoPath: "/x", scan: { facts: FACTS } });
  assert.ok(out.includes("## Webhook Routes (1)"));
  assert.ok(out.includes("POST /webhooks/stripe"));
});

test("Data Models section", () => {
  const out = renderInventory({ repoPath: "/x", scan: { facts: FACTS } });
  assert.ok(out.includes("## Data Models (2)"));
  assert.ok(out.includes("models/user.py:12"));
});

test("Frontend Stores section", () => {
  const out = renderInventory({ repoPath: "/x", scan: { facts: FACTS } });
  assert.ok(out.includes("## Frontend Stores (1)"));
  assert.ok(out.includes("planStore"));
});

test("Packages rendered as comma-separated list", () => {
  const out = renderInventory({ repoPath: "/x", scan: { facts: FACTS } });
  assert.ok(out.includes("## Packages"));
  assert.ok(out.includes("fastapi") && out.includes("react"));
});

test("Env Vars rendered as comma-separated list", () => {
  const out = renderInventory({ repoPath: "/x", scan: { facts: FACTS } });
  assert.ok(out.includes("## Env Vars"));
  assert.ok(out.includes("DATABASE_URL") && out.includes("JWT_SECRET"));
});

test("Database Migrations section", () => {
  const out = renderInventory({ repoPath: "/x", scan: { facts: FACTS } });
  assert.ok(out.includes("## Database Migrations (1)"));
  assert.ok(out.includes("001_initial.py"));
});

test("sections with zero facts are omitted entirely", () => {
  const out = renderInventory({ repoPath: "/empty", scan: { facts: [] } });
  assert.ok(!out.includes("## API Routes"));
  assert.ok(!out.includes("## Data Models"));
  assert.ok(!out.includes("## Packages"));
});

const STOCKED_FACTS = [
  { kind: "api_route",      name: "POST /api/auth/login",   evidence: [{ file: "routes/auth.py",     line: 24 }], layer: "ast", stock: ["auth"] },
  { kind: "api_route",      name: "GET /api/projects",      evidence: [{ file: "routes/projects.py", line: 8  }], layer: "ast" },
  { kind: "env_var",        name: "JWT_SECRET",             evidence: [{ file: ".env"                       }], layer: "heuristic", stock: ["auth"] },
  { kind: "package",        name: "fastapi",                evidence: [{ file: "pyproject.toml"              }], layer: "heuristic" },
  { kind: "package",        name: "stripe",                 evidence: [{ file: "pyproject.toml"              }], layer: "heuristic", stock: ["payment"] },
  { kind: "env_var",        name: "STRIPE_SECRET_KEY",      evidence: [{ file: ".env"                       }], layer: "heuristic", stock: ["payment"] },
  { kind: "db_model",       name: "User",                   evidence: [{ file: "models/auth/user.py", line: 12 }], layer: "ast", stock: ["auth"] },
  { kind: "db_model",       name: "Project",                evidence: [{ file: "models/project.py",  line: 6  }], layer: "ast" },
  { kind: "integration",    name: "Stripe",                 evidence: [{ file: "package.json"                 }], layer: "ast", stock: ["payment"] },
];

test("Standard Patterns section appears when any facts are tagged", () => {
  const out = renderInventory({ repoPath: "/x/kalakar", scan: { facts: STOCKED_FACTS } });
  assert.ok(out.includes("## Standard Patterns"));
});

test("Standard Patterns section lists a subheading per matched pattern", () => {
  const out = renderInventory({ repoPath: "/x", scan: { facts: STOCKED_FACTS } });
  assert.ok(out.includes("### Auth"));
  assert.ok(out.includes("### Payment"));
});

test("Standard Patterns section shows file:line for each fact", () => {
  const out = renderInventory({ repoPath: "/x", scan: { facts: STOCKED_FACTS } });
  assert.ok(out.includes("routes/auth.py:24"));
});

test("Standard Patterns section is omitted when no facts are tagged", () => {
  const out = renderInventory({ repoPath: "/x", scan: {
    facts: [{ kind: "env_var", name: "DATABASE_URL", evidence: [{ file: ".env" }], layer: "heuristic" }],
  }});
  assert.ok(!out.includes("## Standard Patterns"));
});

test("existing kind sections are unchanged in the presence of stock tags", () => {
  const out = renderInventory({ repoPath: "/x/kalakar", scan: { facts: STOCKED_FACTS } });
  assert.ok(out.includes("## API Routes"));
  assert.ok(out.includes("## Data Models"));
  assert.ok(out.includes("## Packages"));
});
