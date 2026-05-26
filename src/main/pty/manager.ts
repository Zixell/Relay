import { BrowserWindow } from 'electron'
import { insertTerminalLog, updateTaskStatus, getTaskById, appendTaskSummary, getTaskSummaries, getTaskEvents, getTerminalLogs } from '../db'
import { generateSessionSummary } from '../summary/generator'

// Lazy-load node-pty so a missing native binding doesn't crash the whole app
let pty: typeof import('node-pty') | null = null
try {
  pty = require('node-pty')
} catch {
  console.warn('[relay] node-pty not available — PTY sessions disabled')
}

interface PtySession {
  id: string
  taskId: string
  process: pty.IPty
  cols: number
  rows: number
}

const sessions = new Map<string, PtySession>()
// Sessions killed intentionally (Stop button / app quit)
const killedSessions = new Set<string>()
// Per-session polling intervals watching for agent completion
const completionWatchers = new Map<string, ReturnType<typeof setInterval>>()

// --- Inactivity-based status management ---
const inactivityTimers = new Map<string, ReturnType<typeof setTimeout>>()
// Track last emitted status to avoid redundant updates
const sessionStatuses = new Map<string, string>()
// Tasks locked in completed state — won't revert to running until user sends a new prompt
const lockedStatuses = new Set<string>()

const INACTIVITY_MS = 15_000
// Strips standard CSI sequences (including private ?/!/< prefixes), OSC, DCS, SOS/PM/APC, character-set designators, and bare Fe sequences
const ANSI_RE = /\x1b(?:\[[0-9;?!<>]*[a-zA-Z@]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[PX^_][^\x1b]*\x1b\\|[()][0-9A-Za-z]|[=>NOMc])/g

function emitStatusChange(taskId: string, status: 'running' | 'completed'): void {
  const prev = sessionStatuses.get(taskId)
  if (prev === status) return
  sessionStatuses.set(taskId, status)
  if (status === 'completed') {
    lockedStatuses.add(taskId)
  }
  updateTaskStatus(taskId, status)
  BrowserWindow.getAllWindows()[0]?.webContents.send(`pty:status:${taskId}`, status)
}

function scheduleInactivityCheck(taskId: string): void {
  const existing = inactivityTimers.get(taskId)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(async () => {
    inactivityTimers.delete(taskId)
    if (!sessions.has(`pty-${taskId}`)) return

    const newStatus = 'completed' as const
    emitStatusChange(taskId, newStatus)

    // Regenerate the single task summary from all user prompts + git changes
    try {
      const task = getTaskById(taskId) as {
        project_path: string
        metadata?: string
      } | null
      if (!task) return

      const meta = task.metadata ? JSON.parse(task.metadata) : {}

      // Collect all user prompts recorded for this task
      const events = getTaskEvents(taskId) as Array<{ type: string; content: string }>
      const userPrompts = events
        .filter((e) => e.type === 'user_prompt' && e.content)
        .map((e) => e.content)

      // Collect Claude's actual terminal output for richer summarization
      const logs = getTerminalLogs(taskId) as Array<{ data: string }>
      const claudeOutput = logs
        .map((l) => l.data)
        .join('')
        .replace(ANSI_RE, '')
        .replace(/\r/g, '')

      const summary = await generateSessionSummary(
        taskId,
        userPrompts,
        task.project_path,
        meta.startCommit,
        newStatus,
        claudeOutput
      )

      const json = JSON.stringify(summary)
      appendTaskSummary(taskId, json)
      const allSummaries = getTaskSummaries(taskId).map((r) => JSON.parse(r.summary_json))
      BrowserWindow.getAllWindows()[0]?.webContents.send(`pty:summary:${taskId}`, JSON.stringify(allSummaries))
    } catch (err) {
      console.warn('[relay] Failed to generate session summary:', err)
    }
  }, INACTIVITY_MS)
  inactivityTimers.set(taskId, timer)
}

function clearInactivityTracking(taskId: string): void {
  const t = inactivityTimers.get(taskId)
  if (t) { clearTimeout(t); inactivityTimers.delete(taskId) }
  sessionStatuses.delete(taskId)
  lockedStatuses.delete(taskId)
}

/** Unlock status lock for a task so the next terminal output can set it back to running.
 *  Call this when the user sends a new prompt to an already-completed/waiting task. */
export function unlockTaskStatus(taskId: string): void {
  lockedStatuses.delete(taskId)
}

/** Pre-populate lockedStatuses from persisted DB state so completed/waiting tasks
 *  stay locked after an app restart, even if a PTY session is somehow created for them. */
export function initLockedStatuses(taskIds: string[]): void {
  for (const id of taskIds) lockedStatuses.add(id)
}

/** Write a potentially large string to PTY in chunks to avoid ConPTY/node-pty buffer limits (~4 KB on Windows) */
function writeLarge(proc: pty.IPty, text: string, chunkSize = 2048, delayMs = 10, onDone?: () => void): void {
  let offset = 0
  const writeNext = () => {
    if (offset >= text.length) {
      onDone?.()
      return
    }
    proc.write(text.slice(offset, offset + chunkSize))
    offset += chunkSize
    if (offset < text.length) {
      setTimeout(writeNext, delayMs)
    } else {
      onDone?.()
    }
  }
  writeNext()
}

export function createPtySession(
  taskId: string,
  command: string,
  args: string[],
  cwd: string,
  env?: Record<string, string>,
  initialPrompt?: string,
  cols = 80,
  rows = 24
): string {
  const sessionId = `pty-${taskId}`
  if (!pty) {
    console.warn('[relay] PTY session skipped — node-pty not available')
    return sessionId
  }

  const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash'
  const resolvedEnv = {
    ...process.env,
    ...(env ?? {}),
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor'
  } as Record<string, string>

  const isAgent = command !== shell

  // Always spawn an interactive shell — the agent command is written to it below.
  // This avoids ConPTY child-process handle-inheritance issues on Windows where
  // spawning an agent directly (cmd.exe /c) would keep the PTY alive after the
  // agent exits if it has lingering grandchildren.
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: cwd || process.env.HOME || '/',
    env: resolvedEnv
  })

  sessions.set(sessionId, { id: sessionId, taskId, process: ptyProcess, cols, rows })

  // Shared flag: set to true the moment cmd.exe produces its first output.
  // Used by the agent command scheduler below to know the shell is ready.
  let shellStarted = false

  ptyProcess.onData((data) => {
    shellStarted = true
    try {
      insertTerminalLog(taskId, data)
    } catch {
      // Task may have been deleted while PTY still had buffered data
    }
    BrowserWindow.getAllWindows()[0]?.webContents.send(`pty:data:${taskId}`, data)

    // Inactivity-based status tracking (only for agent sessions)
    if (isAgent) {
      // Skip status/timer updates while status is locked (completed) —
      // status will unlock only when the user sends a new prompt
      if (!lockedStatuses.has(taskId)) {
        emitStatusChange(taskId, 'running')
        scheduleInactivityCheck(taskId)
      }
    }
  })

  ptyProcess.onExit(({ exitCode }) => {
    sessions.delete(sessionId)
    const watcher = completionWatchers.get(taskId)
    if (watcher) { clearInterval(watcher); completionWatchers.delete(taskId) }
    clearInactivityTracking(taskId)

    if (killedSessions.has(sessionId)) {
      killedSessions.delete(sessionId)
      return
    }
    // Only update status if the task isn't already in a terminal state
    // (e.g. agent completion was already detected via signal file)
    const current = getTaskById(taskId) as { status: string } | null
    const alreadyDone = current?.status === 'completed' || current?.status === 'failed' || current?.status === 'paused'
    if (!alreadyDone) {
      const status = exitCode === 0 ? 'completed' : 'failed'
      updateTaskStatus(taskId, status)
    }
    BrowserWindow.getAllWindows()[0]?.webContents.send(`pty:exit:${taskId}`, exitCode)
  })

  if (isAgent) {
    // Quote args that contain spaces so prompts passed via -p/--message aren't truncated
    const quoteArg = (a: string): string => {
      if (!/\s|"/.test(a)) return a
      return process.platform === 'win32'
        ? `"${a.replace(/"/g, '""')}"` // cmd.exe: double inner quotes
        : `'${a.replace(/'/g, "'\\''")}'` // bash: single-quote with escaping
    }
    const agentCmd = args.length ? `${command} ${args.map(quoteArg).join(' ')}` : command

    // Wait for the shell to produce its first output (proof it's alive), then
    // write the agent command 100 ms later.  Polling via the shared shellStarted
    // flag avoids adding a second onData listener (which can disrupt the first one
    // on some node-pty builds).  Hard fallback at 4 s covers cold-start delays.
    let commandWritten = false
    const writeAgent = () => {
      if (commandWritten || !sessions.has(sessionId)) return
      commandWritten = true

      ptyProcess.write(`${agentCmd}\r`)

      if (initialPrompt) {
        // Wait for the agent to finish its startup output (600 ms of silence),
        // then type the initial prompt so the agent stays open interactively.
        let promptSent = false
        let lastOutput = Date.now()

        const outputWatcher = ptyProcess.onData(() => {
          if (!promptSent) lastOutput = Date.now()
        })

        const sendPrompt = () => {
          if (promptSent || !sessions.has(sessionId)) return
          promptSent = true
          clearInterval(checkInterval)
          outputWatcher.dispose()
          writeLarge(ptyProcess, initialPrompt, 64, 25, () => {
            if (sessions.has(sessionId)) ptyProcess.write('\r')
          })
        }

        const checkInterval = setInterval(() => {
          if (promptSent) { clearInterval(checkInterval); return }
          if (Date.now() - lastOutput >= 1500) sendPrompt()
        }, 100)

        // Hard fallback: send after 30 s regardless (covers very slow first-time startups)
        setTimeout(sendPrompt, 30_000)
      }
    }

    // Poll every 50 ms until the shell produces output, then fire writeAgent
    // after a 100 ms settling pause.  Falls back after 4 s unconditionally.
    let elapsed = 0
    const pollInterval = setInterval(() => {
      elapsed += 50
      if (!shellStarted && elapsed < 4000) return
      clearInterval(pollInterval)
      if (shellStarted) {
        setTimeout(writeAgent, 100)
      } else {
        writeAgent() // 4 s fallback — write immediately
      }
    }, 50)
  }

  return sessionId
}

export function writeToPty(taskId: string, data: string): boolean {
  const sessionId = `pty-${taskId}`
  const session = sessions.get(sessionId)
  if (!session) return false
  session.process.write(data)
  return true
}

export function resizePty(taskId: string, cols: number, rows: number): void {
  const sessionId = `pty-${taskId}`
  const session = sessions.get(sessionId)
  if (session) {
    session.process.resize(cols, rows)
    session.cols = cols
    session.rows = rows
  }
}

export function killPtySession(taskId: string): void {
  const sessionId = `pty-${taskId}`
  const watcher = completionWatchers.get(taskId)
  if (watcher) { clearInterval(watcher); completionWatchers.delete(taskId) }
  clearInactivityTracking(taskId)
  const session = sessions.get(sessionId)
  if (session) {
    killedSessions.add(sessionId)
    session.process.kill()
    sessions.delete(sessionId)
  }
}

export function killAllSessions(): void {
  for (const interval of completionWatchers.values()) clearInterval(interval)
  completionWatchers.clear()
  for (const timer of inactivityTimers.values()) clearTimeout(timer)
  inactivityTimers.clear()
  sessionStatuses.clear()
  lockedStatuses.clear()
  for (const [sessionId, session] of sessions) {
    killedSessions.add(sessionId)
    session.process.kill()
  }
  sessions.clear()
}

export function getActiveSessions(): string[] {
  return Array.from(sessions.keys())
}
