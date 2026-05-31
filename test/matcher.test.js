import assert from "node:assert/strict";
import test from "node:test";

import { matchIntentToScan } from "../src/matcher.js";

test("matchIntentToScan stays unverified when no evidence exists", () => {
  const findings = matchIntentToScan(
    {
      requirements: [
        {
          id: "R1",
          text: "Users receive notifications.",
          keywords: ["users", "receive", "notifications"]
        }
      ]
    },
    { facts: [] }
  );

  assert.equal(findings[0].status, "unverified");
  assert.equal(findings[0].evidence.length, 0);
});

test("matchIntentToScan marks related evidence as partial with missing links", () => {
  const findings = matchIntentToScan(
    {
      requirements: [
        {
          id: "R1",
          text: "Users receive notifications.",
          keywords: ["users", "receive", "notifications"]
        }
      ]
    },
    {
      facts: [
        {
          kind: "component",
          name: "NotificationBell",
          evidence: [{ file: "components/NotificationBell.tsx" }]
        }
      ]
    }
  );

  assert.equal(findings[0].status, "partial");
  assert.equal(findings[0].evidence[0].name, "NotificationBell");
  assert.ok(findings[0].missingLinks.some((link) => link.id === "notification_persistence"));
});

test("matchIntentToScan marks webhook requirements partial when handler is missing", () => {
  const findings = matchIntentToScan(
    {
      requirements: [
        {
          id: "R1",
          text: "A successful subscription should only activate after a Stripe webhook confirms payment.",
          keywords: ["successful", "subscription", "stripe", "webhook", "payment"]
        }
      ]
    },
    {
      facts: [
        {
          kind: "component",
          name: "CheckoutButton",
          evidence: [{ file: "components/CheckoutButton.tsx" }]
        },
        {
          kind: "package",
          name: "stripe",
          tags: ["payment"],
          evidence: [{ file: "package.json" }]
        }
      ]
    }
  );

  assert.equal(findings[0].status, "partial");
  assert.ok(findings[0].missingLinks.some((link) => link.id === "webhook_handler"));
});

test("matchIntentToScan marks complete payment loop as satisfied", () => {
  const findings = matchIntentToScan(
    {
      requirements: [
        {
          id: "R1",
          text: "Add Stripe billing for paid workspaces.",
          keywords: ["add", "stripe", "billing", "paid", "workspaces"]
        }
      ]
    },
    {
      facts: [
        {
          kind: "component",
          name: "CheckoutButton",
          evidence: [{ file: "components/CheckoutButton.tsx" }]
        },
        {
          kind: "package",
          name: "stripe",
          tags: ["payment"],
          evidence: [{ file: "package.json" }]
        }
      ]
    }
  );

  assert.equal(findings[0].status, "satisfied");
  assert.equal(findings[0].missingLinks.length, 0);
});

test("matchIntentToScan requires capability evidence for capability-specific requirements", () => {
  const findings = matchIntentToScan(
    {
      requirements: [
        {
          id: "R1",
          text: "Users receive notifications when tasks are assigned.",
          keywords: ["users", "receive", "notifications", "tasks", "assigned"]
        }
      ]
    },
    {
      facts: [
        {
          kind: "db_model",
          name: "Task",
          evidence: [{ file: "prisma/schema.prisma" }]
        },
        {
          kind: "db_model",
          name: "User",
          evidence: [{ file: "prisma/schema.prisma" }]
        }
      ]
    }
  );

  assert.equal(findings[0].status, "unverified");
});

test("matchIntentToScan avoids false partial when notified requirement only matches task facts", () => {
  const findings = matchIntentToScan(
    {
      requirements: [
        {
          id: "R1",
          text: "get notified when someone assigns them a task",
          keywords: ["notified", "assign", "task"]
        }
      ]
    },
    {
      facts: [
        {
          kind: "page",
          name: "/tasks",
          evidence: [{ file: "app/tasks/page.tsx" }]
        },
        {
          kind: "db_model",
          name: "Task",
          evidence: [{ file: "prisma/schema.prisma" }]
        }
      ]
    }
  );

  assert.equal(findings[0].status, "unverified");
  assert.equal(findings[0].profile, "receive_notifications");
});

test("matchIntentToScan prefers admin profile over auth for approval requirements", () => {
  const findings = matchIntentToScan(
    {
      requirements: [
        {
          id: "R1",
          text: "there should be an admin who approves new signups before they can do anything",
          keywords: ["admin", "approves", "signups"]
        }
      ]
    },
    { facts: [] }
  );

  assert.equal(findings[0].status, "unverified");
  assert.equal(findings[0].profile, "admin_access");
  assert.equal(findings[0].hintedCapabilities[0], "admin");
});
