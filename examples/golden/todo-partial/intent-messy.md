ok so i want to build a task app, something like a lightweight todo/project thing.
users need to be able to sign up and log in (use whatever, next-auth is fine) and then
once they're in they can create tasks, edit them, mark them done. i also want them to
get notified when someone assigns them a task — in-app is fine for now, email later maybe.
oh and there should be an admin who approves new signups before they can do anything.
eventually i want to charge for team workspaces so stripe billing at some point, but the
subscription should only actually turn on after stripe confirms via webhook, don't just
flip it on the client. keep it simple, ship the auth + tasks first.
