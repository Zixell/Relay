# Relay

**Relay** is a desktop app for managing multiple AI coding agent sessions in one place. Run Claude Code, Aider, OpenCode, or any CLI tool in parallel — track their progress, review changes, and pick up where you left off.

Built with Electron, React, and TypeScript. Data is stored locally via SQLite — no cloud, no accounts.

---

## What it does

Modern AI coding agents are powerful but hard to manage when you have multiple tasks running across different projects. Relay solves this by giving you:

- A unified dashboard across all running agents
- A real terminal inside each task — full PTY, no limitations
- Git-aware file change tracking scoped to each session
- Automatic session summaries so you always know what happened
- Context injection that catches agents up on previous sessions automatically

---

## Features

### Multi-agent dashboard
See all your tasks at a glance — grouped by status (Running, Waiting for Input, Completed, Failed), with live status indicators, runtime counters, and a terminal preview of the latest output.

### Supported agents
- **Claude Code** — launched with `--dangerously-skip-permissions` for unattended operation
- **Aider** — launched with `--yes` for auto-confirmations
- **OpenCode** — launched in interactive mode
- **Generic CLI** — any shell command or tool, full interactive terminal

### Full terminal emulator
Each task has a real pseudo-terminal (PTY) with xterm-256color and true color support. Type directly, resize the terminal, send interrupts — it behaves exactly like a real terminal.

### Smart status tracking
Relay monitors agent output to detect state automatically:
- **Running** — agent is producing output
- **Waiting for Input** — agent has been idle for 15 seconds and appears to be waiting
- **Completed** — agent output matched a completion pattern (e.g. Claude's timing suffix)
- **Failed** — process exited with a non-zero code

Status is locked after completion or when waiting, and only unlocks when you send a new prompt — preventing false "running" flickers.

### Git integration
Each task tracks its own git branch. Relay can:
- Create a new branch or checkout an existing one before starting a session
- Show committed and uncommitted file changes scoped to the task branch
- Display additions/deletions per file with change type (added, modified, deleted, renamed)
- Scope the diff using the commit recorded at session start

### Automatic session summaries
When a task completes or goes idle, Relay generates a plain-English summary of the session using the Claude CLI. The summary includes:
- What was accomplished (2-4 sentences, action-verb style)
- Which files were modified
- Which commits were made

If the Claude CLI is not available, Relay falls back to a git-based summary.

### Context injection on restart
When you restart a paused or completed task, Relay can automatically prepend the previous session summary as context — so the agent knows exactly what was done before and can continue without repetition. Controlled via the **Auto inject relay context** setting.

### Project management
Organize tasks under projects. Each project has a name, file path, and optional description. Filter the dashboard by project to focus on what matters.

### Local-first, persistent storage
All data (projects, tasks, terminal logs, events, summaries) is stored in a local SQLite database. Nothing leaves your machine. Data persists across app restarts — tasks that were running are reset to a safe state on relaunch.

---

## Tech stack

| Layer | Technology |
|---|---|
| Shell | Electron |
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS |
| State | Zustand |
| Terminal | node-pty + xterm.js |
| Database | SQLite via better-sqlite3 |
| Build | Vite + electron-vite |

---

## Getting started

### Prerequisites

- Node.js 18+
- Git
- Claude Code, Aider, or OpenCode installed and available on PATH (at least one)

### Install and run

```bash
npm install
npm run dev
```

### Build for distribution

```bash
npm run build
```

The packaged app will be in `dist/`.

---

## Project structure

```
src/
  main/           # Electron main process
    db/           # SQLite schema and queries
    git/          # Git branch management and diff parsing
    ipc/          # IPC handlers (bridge between main and renderer)
    pty/          # PTY session lifecycle and status detection
    summary/      # Session summary generation via Claude CLI
    settings.ts   # App settings (persisted in DB)
  renderer/       # React frontend
    components/
      dashboard/  # Task list, task cards, summary bar
      layout/     # Top bar, navigation
      ui/         # Shared UI primitives (Button, Badge, Input, etc.)
    stores/       # Zustand app state
    types/        # Shared TypeScript types
  preload/        # Electron context bridge (exposes window.api)
```

---

## Settings

| Key | Description |
|---|---|
| `AUTO_INJECT_CONTEXT` | When `true`, injects the previous session summary as context when restarting a task |

---

## License

MIT
