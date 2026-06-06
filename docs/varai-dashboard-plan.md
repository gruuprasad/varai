# varai start — Local Web Dashboard

**Date:** 2026-06-06
**Status:** Approved

## Problem

`varai map` outputs a dense markdown report (655+ facts across 16 kinds). Vibecoders (AI-assisted developers) need a persistent, live dashboard they can keep open alongside their IDE — not a one-shot report they scroll through.

## Decisions

| Question | Decision | Rationale |
|---|---|---|
| Web vs desktop | Local web server (`localhost`) | Zero new deps; Neutralino/Electron wrapper possible later with zero frontend changes |
| Update model | Live file watching, auto-rescan | Vibecoders change files constantly; manual refresh breaks the "alive" feel |
| Primary view | Overview cards → drill-down | Answers "what does this codebase do" in 5s; then lets you go deeper |
| Frontend tech | Vanilla JS, no build step (v1) | Sufficient for this UI; build step adds complexity before product is validated |
| CLI | Stays unchanged | `varai map` keeps working for CI/scripting/piping |

## Architecture

```
varai start [repo] [--port 3847] [--no-open]
  ├── Node HTTP server (node:http, zero new deps)
  │    ├── GET /            → src/ui/index.html
  │    ├── GET /app.js      → src/ui/app.js
  │    ├── GET /styles.css  → src/ui/styles.css
  │    ├── GET /api/scan    → scanRepo() → JSON
  │    └── GET /api/events  → SSE stream (full scan result on each rescan)
  │
  ├── File watcher (node:fs watch, recursive)
  │    ├── Ignore: .varai/, node_modules/, .git/, dist/, __pycache__
  │    ├── Debounce: 2000ms after last qualifying event
  │    └── On fire: re-run scanRepo() → broadcast to all SSE clients
  │
  └── Frontend (src/ui/ — static, no bundler)
       ├── index.html — shell, offline, no CDN
       ├── app.js    — vanilla JS, EventSource for SSE
       └── styles.css — dark theme, CSS variables
```

## New Files

- `src/server/index.js` — HTTP server, SSE broadcaster, auto-open browser
- `src/server/watcher.js` — fs.watch + debounce + rescan trigger
- `src/ui/index.html` — app shell
- `src/ui/app.js` — frontend app
- `src/ui/styles.css` — dark theme

## Modified Files

- `bin/varai.js` — add `start` subcommand

## UI Layout

```
┌─────────────────────────────────────────────┐
│ varai  /path/to/repo  Last scan: 2s ago  ● Live │
├─────────────────────────────────────────────┤
│ [⚡ Integrations 6] [🐳 Services 5] [▶ Scripts 29] [→ Routes 162] │
│ [{ } Schemas 185] [◈ Components 42] [⊞ DB Models 18] ...         │
├─────────────────────────────────────────────┤
│ ← API Routes (162)                          │
│ [Search routes...]                          │
│                                             │
│  GET /api/users                             │
│    services/backend/app/routers/users.py:24 │
│  POST /api/users                            │
│    services/backend/app/routers/users.py:38 │
│  ...                                        │
└─────────────────────────────────────────────┘
```

- Cards: only show kinds with ≥1 fact
- Drill-down: search filters by name or file path in real time
- Header: green pulsing dot = live; spinner = scanning

## Key Implementation Notes

- **Infinite loop prevention**: watcher must ignore `.varai/` directory; cache writes would otherwise re-trigger scan indefinitely
- **SSE over WebSocket**: simpler, no library, server-push-only is all we need
- **Auto-open**: `child_process.exec` with platform detection (`open` macOS, `xdg-open` Linux, `start` Windows)
- **Initial data**: frontend fetches `/api/scan` immediately on load; SSE stream carries subsequent updates

## Out of Scope (v1)

- Build step / bundler
- Authentication
- Neutralino/Electron wrapper
- Multiple repo tabs
- Fact detail pages with file preview

## Migration Path to Desktop

Later: Neutralino or Electron spawns the Node server as a child process and loads `http://localhost:PORT` in a native WebView. Frontend code unchanged.
