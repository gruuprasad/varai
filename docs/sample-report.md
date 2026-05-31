# Sample Varai Build State Report

This sample is generated from `examples/golden/todo-partial/intent.md` against `examples/golden/todo-partial/app`.

## Summary

- Files scanned: 4
- Evidence facts found: 11
- Intent requirements: 4

## Intent Coverage

### R1: Build a task app where users can sign up, log in, and create tasks.

Status: partial

Some related evidence exists, but Varai v0 cannot yet prove full implementation.

Evidence:

- api_route: `/api/tasks` (`app/api/tasks/route.ts`)
- page: `/tasks` (`app/tasks/page.tsx`)
- db_model: `User` (`prisma/schema.prisma`)
- db_model: `Task` (`prisma/schema.prisma`)

### R2: Users should receive in-app notifications when a task is assigned to them.

Status: unverified

No direct local evidence found for this requirement.

### R3: Admins should be able to approve new users before they can create tasks.

Status: unverified

No direct local evidence found for this requirement.

### R4: Add Stripe billing for paid workspaces.

Status: unverified

No direct local evidence found for this requirement.

## Next Prompt

```text
Continue from the current repo. Use the Varai build-state report below as context.
Focus on requirements marked unverified or partial. For each change, update code and keep evidence clear.

- PARTIAL: Build a task app where users can sign up, log in, and create tasks.
- UNVERIFIED: Users should receive in-app notifications when a task is assigned to them.
- UNVERIFIED: Admins should be able to approve new users before they can create tasks.
- UNVERIFIED: Add Stripe billing for paid workspaces.
```
