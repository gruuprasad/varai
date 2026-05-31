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

test("matchIntentToScan marks related evidence as partial", () => {
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
