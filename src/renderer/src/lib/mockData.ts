import type { Task, Project, TaskEvent, FileChange } from '../types'

const now = Math.floor(Date.now() / 1000)

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    name: 'flowstate-api',
    path: '/Users/roman/dev/flowstate-api',
    description: 'Backend REST API for Flowstate platform',
    created_at: now - 86400 * 30,
    updated_at: now - 3600
  },
  {
    id: 'proj-2',
    name: 'relay-desktop',
    path: '/Users/roman/dev/relay-desktop',
    description: 'Relay Electron desktop app',
    created_at: now - 86400 * 14,
    updated_at: now - 600
  },
  {
    id: 'proj-3',
    name: 'datasync-worker',
    path: '/Users/roman/dev/datasync-worker',
    description: 'Background sync worker service',
    created_at: now - 86400 * 7,
    updated_at: now - 7200
  },
  {
    id: 'proj-4',
    name: 'marketing-site',
    path: '/Users/roman/dev/marketing-site',
    description: 'Next.js marketing website',
    created_at: now - 86400 * 60,
    updated_at: now - 86400 * 2
  }
]

export const MOCK_TASKS: Task[] = [
  {
    id: 'task-1',
    project_id: 'proj-1',
    project_name: 'flowstate-api',
    project_path: '/Users/roman/dev/flowstate-api',
    title: 'Refactor auth middleware to use JWT refresh tokens',
    prompt:
      'Refactor the existing session-based auth to use JWT with refresh token rotation. Add proper token expiry, implement refresh endpoint, and update all protected routes.',
    process_type: 'claude-code',
    status: 'running',
    branch: 'feat/jwt-refresh-tokens',
    started_at: now - 1847,
    updated_at: now - 12,
    created_at: now - 1847,
    runtime_seconds: 1847,
    changed_files_count: 8,
    notes: ''
  },
  {
    id: 'task-2',
    project_id: 'proj-2',
    project_name: 'relay-desktop',
    project_path: '/Users/roman/dev/relay-desktop',
    title: 'Implement PTY session persistence across restarts',
    prompt:
      'When the app restarts, active PTY sessions should be reattached if the underlying process is still running. Store session PIDs in SQLite and attempt reconnect on startup.',
    process_type: 'aider',
    status: 'waiting',
    branch: 'feat/pty-persistence',
    started_at: now - 4320,
    updated_at: now - 180,
    created_at: now - 4320,
    runtime_seconds: 4320,
    changed_files_count: 3,
    notes: 'Need to test on Windows — PTY behavior differs'
  },
  {
    id: 'task-3',
    project_id: 'proj-3',
    project_name: 'datasync-worker',
    project_path: '/Users/roman/dev/datasync-worker',
    title: 'Add exponential backoff to sync retry logic',
    prompt:
      'The sync worker currently retries immediately on failure. Implement exponential backoff with jitter, max 5 retries, and dead-letter queue for permanently failed jobs.',
    process_type: 'claude-code',
    status: 'completed',
    branch: 'fix/retry-backoff',
    started_at: now - 86400,
    completed_at: now - 82800,
    updated_at: now - 82800,
    created_at: now - 86400,
    runtime_seconds: 3600,
    changed_files_count: 5,
    notes: ''
  },
  {
    id: 'task-4',
    project_id: 'proj-1',
    project_name: 'flowstate-api',
    project_path: '/Users/roman/dev/flowstate-api',
    title: 'Fix N+1 query in workspace members endpoint',
    prompt:
      'The GET /workspaces/:id/members endpoint is causing N+1 queries. Profile and fix using proper JOIN or dataloader pattern.',
    process_type: 'opencode',
    status: 'failed',
    branch: 'fix/workspace-n-plus-one',
    started_at: now - 43200,
    completed_at: now - 41400,
    updated_at: now - 41400,
    created_at: now - 43200,
    runtime_seconds: 1800,
    changed_files_count: 2,
    notes: 'Failed: opencode ran into schema mismatch. Need to re-run after migration.'
  },
  {
    id: 'task-5',
    project_id: 'proj-4',
    project_name: 'marketing-site',
    project_path: '/Users/roman/dev/marketing-site',
    title: 'Add animated hero section with scroll-triggered reveals',
    prompt:
      'Create a polished animated hero section using Framer Motion. Scroll-triggered text reveals, floating product screenshot, and a subtle particle background. Match the design spec in Figma.',
    process_type: 'aider',
    status: 'paused',
    branch: 'feat/animated-hero',
    started_at: now - 172800,
    updated_at: now - 86400,
    created_at: now - 172800,
    runtime_seconds: 7200,
    changed_files_count: 11,
    notes: 'On hold pending design review from team'
  },
  {
    id: 'task-6',
    project_id: 'proj-2',
    project_name: 'relay-desktop',
    project_path: '/Users/roman/dev/relay-desktop',
    title: 'Implement global search with fuzzy matching',
    prompt:
      'Add a global search overlay (Cmd+K) that searches across tasks, projects, and recent actions. Use fuse.js for fuzzy matching with keyboard navigation.',
    process_type: 'claude-code',
    status: 'completed',
    branch: 'feat/global-search',
    started_at: now - 259200,
    completed_at: now - 252000,
    updated_at: now - 252000,
    created_at: now - 259200,
    runtime_seconds: 7200,
    changed_files_count: 14,
    notes: ''
  }
]

export const MOCK_EVENTS: TaskEvent[] = [
  {
    id: 'evt-1',
    task_id: 'task-1',
    type: 'user_prompt',
    content:
      'Refactor the existing session-based auth to use JWT with refresh token rotation. Add proper token expiry, implement refresh endpoint, and update all protected routes.',
    timestamp: now - 1847
  },
  {
    id: 'evt-2',
    task_id: 'task-1',
    type: 'system',
    content: 'Session started · claude-code · branch: feat/jwt-refresh-tokens',
    timestamp: now - 1845
  },
  {
    id: 'evt-3',
    task_id: 'task-1',
    type: 'ai_response',
    content:
      "I'll start by analyzing the existing auth implementation to understand what needs to change.\n\nReading src/middleware/auth.ts, src/routes/auth.ts, and src/models/session.ts...",
    timestamp: now - 1840
  },
  {
    id: 'evt-4',
    task_id: 'task-1',
    type: 'file_change',
    content: JSON.stringify([
      { path: 'src/middleware/auth.ts', type: 'modified', additions: 87, deletions: 43 },
      { path: 'src/routes/auth.ts', type: 'modified', additions: 124, deletions: 31 },
      { path: 'src/lib/jwt.ts', type: 'added', additions: 68, deletions: 0 },
      { path: 'src/models/refreshToken.ts', type: 'added', additions: 45, deletions: 0 }
    ]),
    timestamp: now - 1200
  },
  {
    id: 'evt-5',
    task_id: 'task-1',
    type: 'ai_response',
    content:
      "JWT utility created with RS256 signing. Now implementing the refresh token rotation — I'll store refresh tokens in the DB with a 30-day TTL and invalidate on use.",
    timestamp: now - 1180
  },
  {
    id: 'evt-6',
    task_id: 'task-1',
    type: 'git_snapshot',
    content: 'Checkpoint: JWT foundation + refresh token model',
    timestamp: now - 900
  },
  {
    id: 'evt-7',
    task_id: 'task-1',
    type: 'file_change',
    content: JSON.stringify([
      { path: 'src/routes/auth.ts', type: 'modified', additions: 56, deletions: 12 },
      { path: 'src/middleware/requireAuth.ts', type: 'modified', additions: 23, deletions: 41 },
      { path: 'src/db/migrations/004_refresh_tokens.ts', type: 'added', additions: 34, deletions: 0 },
      { path: 'tests/auth.test.ts', type: 'modified', additions: 89, deletions: 24 }
    ]),
    timestamp: now - 600
  },
  {
    id: 'evt-8',
    task_id: 'task-1',
    type: 'ai_response',
    content:
      'Refresh endpoint implemented with token rotation. All 47 existing auth tests pass. Running the full test suite now...',
    timestamp: now - 180
  },
  {
    id: 'evt-9',
    task_id: 'task-1',
    type: 'user_prompt',
    content: 'Also update the logout endpoint to invalidate all refresh tokens for the user',
    timestamp: now - 60
  },

  // task-2 events
  {
    id: 'evt-10',
    task_id: 'task-2',
    type: 'user_prompt',
    content:
      'When the app restarts, active PTY sessions should be reattached if the underlying process is still running. Store session PIDs in SQLite and attempt reconnect on startup.',
    timestamp: now - 4320
  },
  {
    id: 'evt-11',
    task_id: 'task-2',
    type: 'system',
    content: 'Session started · aider · branch: feat/pty-persistence',
    timestamp: now - 4318
  },
  {
    id: 'evt-12',
    task_id: 'task-2',
    type: 'ai_response',
    content:
      "I'll implement PTY session persistence. Plan: store PIDs in SQLite on create, check process liveness on startup, reattach if alive.",
    timestamp: now - 4310
  },
  {
    id: 'evt-13',
    task_id: 'task-2',
    type: 'file_change',
    content: JSON.stringify([
      { path: 'src/main/pty/manager.ts', type: 'modified', additions: 67, deletions: 12 },
      { path: 'src/main/db/index.ts', type: 'modified', additions: 34, deletions: 8 }
    ]),
    timestamp: now - 3600
  },
  {
    id: 'evt-14',
    task_id: 'task-2',
    type: 'user_prompt',
    content: 'Yes, add the Windows fallback that shows a session ended notice',
    timestamp: now - 180
  },

  // task-3 events
  {
    id: 'evt-15',
    task_id: 'task-3',
    type: 'user_prompt',
    content:
      'The sync worker currently retries immediately on failure. Implement exponential backoff with jitter, max 5 retries, and dead-letter queue for permanently failed jobs.',
    timestamp: now - 86400
  },
  {
    id: 'evt-16',
    task_id: 'task-3',
    type: 'system',
    content: 'Session started · claude-code · branch: fix/retry-backoff',
    timestamp: now - 86398
  },
  {
    id: 'evt-17',
    task_id: 'task-3',
    type: 'file_change',
    content: JSON.stringify([
      { path: 'src/workers/syncWorker.ts', type: 'modified', additions: 89, deletions: 23 },
      { path: 'src/lib/backoff.ts', type: 'added', additions: 54, deletions: 0 },
      { path: 'src/queue/deadLetter.ts', type: 'added', additions: 71, deletions: 0 }
    ]),
    timestamp: now - 84000
  },
  {
    id: 'evt-18',
    task_id: 'task-3',
    type: 'ai_response',
    content: 'Exponential backoff implemented with full jitter. Dead-letter queue stores failed jobs with error context.',
    timestamp: now - 83800
  },
  {
    id: 'evt-19',
    task_id: 'task-3',
    type: 'git_snapshot',
    content: 'Checkpoint: backoff + dead-letter queue complete',
    timestamp: now - 83000
  }
]

export const MOCK_TERMINAL_LOGS: Record<string, string> = {
  'task-1': `\x1b[1;32m>\x1b[0m claude --dangerously-skip-permissions
\x1b[90m  Relay · Claude Code · feat/jwt-refresh-tokens\x1b[0m

\x1b[1;36mClaude Code\x1b[0m \x1b[90mv0.9.14\x1b[0m

\x1b[90m───────────────────────────────────────────────\x1b[0m
\x1b[1mAnalyzing codebase...\x1b[0m
\x1b[90m✓ Indexed 847 files in 0.4s\x1b[0m

\x1b[1;33mUser:\x1b[0m Refactor the existing session-based auth to use JWT with refresh token rotation...

\x1b[1;32mClaude:\x1b[0m I'll analyze the existing auth implementation first.

\x1b[90mReading:\x1b[0m src/middleware/auth.ts
\x1b[90mReading:\x1b[0m src/routes/auth.ts
\x1b[90mReading:\x1b[0m src/models/session.ts
\x1b[90mReading:\x1b[0m src/db/schema.ts

\x1b[1mPlanning changes:\x1b[0m
  \x1b[90m1.\x1b[0m Create \x1b[36msrc/lib/jwt.ts\x1b[0m — RS256 token generation & verification
  \x1b[90m2.\x1b[0m Create \x1b[36msrc/models/refreshToken.ts\x1b[0m — token model with TTL
  \x1b[90m3.\x1b[0m Modify \x1b[36msrc/middleware/auth.ts\x1b[0m — swap session for JWT verification
  \x1b[90m4.\x1b[0m Modify \x1b[36msrc/routes/auth.ts\x1b[0m — add /refresh endpoint
  \x1b[90m5.\x1b[0m Add migration \x1b[36m004_refresh_tokens.ts\x1b[0m

\x1b[90m───────────────────────────────────────────────\x1b[0m
\x1b[1;34mWriting:\x1b[0m src/lib/jwt.ts \x1b[90m(68 lines)\x1b[0m \x1b[32m✓\x1b[0m
\x1b[1;34mWriting:\x1b[0m src/models/refreshToken.ts \x1b[90m(45 lines)\x1b[0m \x1b[32m✓\x1b[0m
\x1b[1;34mEditing:\x1b[0m src/middleware/auth.ts \x1b[90m(+87/-43)\x1b[0m \x1b[32m✓\x1b[0m
\x1b[1;34mEditing:\x1b[0m src/routes/auth.ts \x1b[90m(+124/-31)\x1b[0m \x1b[32m✓\x1b[0m

\x1b[1;32mClaude:\x1b[0m JWT utility created. Implementing refresh token rotation with 30-day TTL...

\x1b[1;34mEditing:\x1b[0m src/routes/auth.ts \x1b[90m(+56/-12)\x1b[0m \x1b[32m✓\x1b[0m
\x1b[1;34mEditing:\x1b[0m src/middleware/requireAuth.ts \x1b[90m(+23/-41)\x1b[0m \x1b[32m✓\x1b[0m
\x1b[1;34mWriting:\x1b[0m src/db/migrations/004_refresh_tokens.ts \x1b[90m(34 lines)\x1b[0m \x1b[32m✓\x1b[0m

Running tests...
\x1b[90m$ npm test -- --testPathPattern=auth\x1b[0m

  \x1b[32m✓\x1b[0m POST /auth/login returns access + refresh tokens (84ms)
  \x1b[32m✓\x1b[0m POST /auth/refresh rotates token correctly (31ms)
  \x1b[32m✓\x1b[0m POST /auth/refresh rejects reused tokens (22ms)
  \x1b[32m✓\x1b[0m GET /protected returns 401 with expired token (18ms)
  \x1b[32m✓\x1b[0m GET /protected accepts valid JWT (15ms)

\x1b[32m✓\x1b[0m 47 tests passed \x1b[90m(all)\x1b[0m · \x1b[90m2.3s\x1b[0m

\x1b[1;32mClaude:\x1b[0m All tests passing. Updating remaining protected routes...
\x1b[90m[waiting for input...]\x1b[0m`,

  'task-2': `\x1b[1;32m>\x1b[0m aider --yes
\x1b[90m  Relay · Aider · feat/pty-persistence\x1b[0m

\x1b[1;35mAider\x1b[0m \x1b[90mv0.38.0 (claude-3-5-sonnet-20241022)\x1b[0m
\x1b[90mGit repo: /Users/roman/dev/relay-desktop/.git\x1b[0m
\x1b[90mAdded src/main/pty/manager.ts to the chat\x1b[0m

\x1b[1;33mUser:\x1b[0m When the app restarts, active PTY sessions should be reattached...

\x1b[1;35mAider:\x1b[0m I'll implement PTY session persistence. Here's the plan:

1. Store session PIDs and metadata in SQLite on session create
2. On startup, query sessions with status 'active'
3. Attempt \`/proc/{pid}/stat\` check (Linux) or \`tasklist\` (Windows)
4. If process alive, create new PTY attached to existing process group

\x1b[90mApplying edits...\x1b[0m
\x1b[36msrc/main/pty/manager.ts\x1b[0m
\x1b[36msrc/main/db/index.ts\x1b[0m
\x1b[36msrc/main/index.ts\x1b[0m

\x1b[33m⚠\x1b[0m  Waiting for your input on Windows compatibility:
    On Windows, PTY reattachment via conpty is limited.
    Should I add a Windows-specific fallback that shows
    a "session ended" notice instead of attempting reattach?

\x1b[1;33m[WAITING FOR INPUT]\x1b[0m`
}

export function getMockFileChanges(taskId: string): FileChange[] {
  const changes: Record<string, FileChange[]> = {
    'task-1': [
      { path: 'src/lib/jwt.ts', type: 'added', additions: 68, deletions: 0 },
      { path: 'src/models/refreshToken.ts', type: 'added', additions: 45, deletions: 0 },
      { path: 'src/middleware/auth.ts', type: 'modified', additions: 87, deletions: 43 },
      { path: 'src/routes/auth.ts', type: 'modified', additions: 180, deletions: 43 },
      { path: 'src/middleware/requireAuth.ts', type: 'modified', additions: 23, deletions: 41 },
      { path: 'src/db/migrations/004_refresh_tokens.ts', type: 'added', additions: 34, deletions: 0 },
      { path: 'tests/auth.test.ts', type: 'modified', additions: 89, deletions: 24 },
      { path: 'src/types/auth.ts', type: 'modified', additions: 12, deletions: 5 }
    ],
    'task-2': [
      { path: 'src/main/pty/manager.ts', type: 'modified', additions: 67, deletions: 12 },
      { path: 'src/main/db/index.ts', type: 'modified', additions: 34, deletions: 8 },
      { path: 'src/main/index.ts', type: 'modified', additions: 18, deletions: 4 }
    ],
    'task-3': [
      { path: 'src/workers/syncWorker.ts', type: 'modified', additions: 89, deletions: 23 },
      { path: 'src/lib/backoff.ts', type: 'added', additions: 54, deletions: 0 },
      { path: 'src/queue/deadLetter.ts', type: 'added', additions: 71, deletions: 0 },
      { path: 'src/config/worker.ts', type: 'modified', additions: 14, deletions: 6 },
      { path: 'tests/backoff.test.ts', type: 'added', additions: 112, deletions: 0 }
    ]
  }
  return changes[taskId] ?? []
}
