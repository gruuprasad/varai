# Evidence Model

Varai should separate grounded facts from inferred claims.

## Fact

A fact is extracted directly from local project files.

```json
{
  "kind": "api_route",
  "name": "/api/tasks",
  "evidence": [
    {
      "file": "app/api/tasks/route.ts"
    }
  ]
}
```

Facts can be incomplete, but they should not be invented.

## Requirement

A requirement is extracted from intent.

```json
{
  "id": "R2",
  "text": "Users should receive in-app notifications when a task is assigned to them.",
  "keywords": ["users", "receive", "app", "notifications", "task", "assigned"]
}
```

Requirements may come from a prompt, issue, PRD, chat transcript, or manual note.

## Finding

A finding compares one requirement to local evidence.

```json
{
  "requirementId": "R2",
  "status": "partial",
  "summary": "Notification UI exists, but persistence and delivery are not evidenced.",
  "evidence": [
    {
      "kind": "component",
      "name": "NotificationBell",
      "evidence": [{ "file": "components/NotificationBell.tsx" }]
    }
  ]
}
```

## Trust Rule

No claim without evidence.

If Varai cannot find evidence, it should say `unverified`. If evidence exists but does not prove full behavior, it should say `partial`.

This is the character of the project.
