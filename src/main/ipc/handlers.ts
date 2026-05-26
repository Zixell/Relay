import { ipcMain, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import {
  getAllProjects,
  getAllTasks,
  getTaskById,
  getTaskEvents,
  getTerminalLogs,
  getTaskSummaries,
  upsertProject,
  insertTask,
  insertTaskEvent,
  updateTaskStatus,
  updateTaskNotes,
  appendTaskSummary,
  deleteTask
} from '../db'
import {
  createPtySession,
  writeToPty,
  resizePty,
  killPtySession,
  getActiveSessions,
  unlockTaskStatus
} from '../pty/manager'
import { getGitChanges, getFileDiff, ensureBranch, getCurrentCommit } from '../git'
import { formatSummaryAsContext, isClaudeCliAvailable } from '../summary/generator'
import { getSetting, setSetting, getSettingForClient } from '../settings'

// Per-task input buffer to reconstruct full lines from character-by-character PTY writes
const inputBuffers = new Map<string, string>()

function emitTaskEvent(event: { id: string; task_id: string; type: string; content: string; metadata: string | null; timestamp?: number }): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.webContents.send(`tasks:event:${event.task_id}`, event)
  }
}

export function registerIpcHandlers(): void {
  // --- Projects ---
  ipcMain.handle('projects:getAll', () => getAllProjects())
  ipcMain.handle('projects:create', (_, { name, path, description }) => {
    const id = randomUUID()
    const project = upsertProject({ id, name, path, description })
    return project
  })

  // --- Tasks ---
  ipcMain.handle('tasks:getAll', () => getAllTasks())
  ipcMain.handle('tasks:getById', (_, id: string) => getTaskById(id))
  ipcMain.handle(
    'tasks:create',
    (_, { projectId, title, prompt, processType, branch, cwd, cols = 80, rows = 24 }) => {
      // Ensure the git branch exists and is checked out before starting the session.
      // Throws with a descriptive message if checkout/creation fails — propagates to the modal.
      let branchCreated = false
      if (branch && cwd) {
        const result = ensureBranch(cwd, branch)
        branchCreated = result.created
      }

      // Record the HEAD commit at session start so Files tab can scope the diff
      const startCommit = cwd ? getCurrentCommit(cwd) : ''

      const id = randomUUID()
      insertTask({
        id,
        project_id: projectId,
        title,
        prompt,
        process_type: processType,
        branch,
        metadata: JSON.stringify({ startCommit })
      })

      const eventId = randomUUID()
      insertTaskEvent({
        id: eventId,
        task_id: id,
        type: 'user_prompt',
        content: prompt,
        metadata: JSON.stringify({ processType })
      })

      if (branch) {
        insertTaskEvent({
          id: randomUUID(),
          task_id: id,
          type: 'system',
          content: branchCreated
            ? `Created and switched to branch: ${branch}`
            : `Switched to existing branch: ${branch}`
        })
      }

      // Build command from process type.
      // Agent commands use one-shot/print flags so the process exits when the task is done,
      // allowing the task status to transition to Completed automatically.
      const agentShell = process.platform === 'win32' ? 'cmd.exe' : 'bash'
      const skipPerms = getSetting('CLAUDE_SKIP_PERMISSIONS') !== 'false'
      const claudeArgs = skipPerms ? ['--dangerously-skip-permissions'] : []
      const commands: Record<string, { cmd: string; args: string[] }> = {
        'claude-code': { cmd: 'claude', args: claudeArgs },
        aider: { cmd: 'aider', args: ['--yes'] },
        opencode: { cmd: 'opencode', args: [] },
        generic: { cmd: agentShell, args: [] }
      }

      const { cmd, args } = commands[processType] ?? commands.generic
      // All agent processes receive the prompt as keyboard input after startup
      const sendPrompt = processType !== 'generic'
      createPtySession(id, cmd, args, cwd || process.cwd(), undefined, sendPrompt ? prompt : undefined, cols, rows)

      return { id, projectId, title, prompt, processType, branch, status: 'running' }
    }
  )

  ipcMain.handle('tasks:updateStatus', (_, { id, status, runtimeSeconds, changedFilesCount }) => {
    updateTaskStatus(id, status, {
      runtime_seconds: runtimeSeconds,
      changed_files_count: changedFilesCount
    })
    return { success: true }
  })

  ipcMain.handle('tasks:updateNotes', (_, { id, notes }) => {
    updateTaskNotes(id, notes)
    return { success: true }
  })

  ipcMain.handle('tasks:updateSummary', (_, { id, summary }: { id: string; summary: string }) => {
    appendTaskSummary(id, summary)
    return { success: true }
  })

  ipcMain.handle('tasks:getSummaries', (_, taskId: string) => {
    const rows = getTaskSummaries(taskId)
    return rows.map((r) => ({ ...JSON.parse(r.summary_json), _created_at: r.created_at }))
  })

  ipcMain.handle('tasks:getEvents', (_, taskId: string) => getTaskEvents(taskId))
  ipcMain.handle('tasks:getLogs', (_, taskId: string) => getTerminalLogs(taskId))
  ipcMain.handle('tasks:delete', (_, id: string) => {
    killPtySession(id)
    deleteTask(id)
    return { success: true }
  })

  // --- PTY ---
  ipcMain.handle('pty:write', (_, { taskId, data }: { taskId: string; data: string }) => {
    // Buffer user input to detect complete prompts
    const buf = inputBuffers.get(taskId) ?? ''

    if (data === '\r' || data === '\n') {
      // Enter pressed — unlock status so the next agent output resumes running tracking
      unlockTaskStatus(taskId)
      // Save buffered line as user_prompt event
      const line = buf.trim()
      if (line) {
        const eventId = randomUUID()
        const now = Math.floor(Date.now() / 1000)
        insertTaskEvent({ id: eventId, task_id: taskId, type: 'user_prompt', content: line })
        emitTaskEvent({ id: eventId, task_id: taskId, type: 'user_prompt', content: line, metadata: null, timestamp: now })
      }
      inputBuffers.set(taskId, '')

      // Inject summary context if the user has enabled Auto inject relay context.
      // The user's typed chars are already in the PTY line buffer — appending the
      // context suffix before \r makes Claude receive them as one combined line.
      if (line && getSetting('AUTO_INJECT_CONTEXT') === 'true') {
        const task = getTaskById(taskId) as { process_type?: string } | null
        if (task?.process_type && task.process_type !== 'generic') {
          try {
            const rows = getTaskSummaries(taskId)
            if (rows.length > 0) {
              const last = JSON.parse(rows[rows.length - 1].summary_json)
              const summary = { text: last.text, modified_files: last.modified_files, commits: last.commits, status: last.status }
              writeToPty(taskId, ` [relay_context: ${JSON.stringify(summary)}]\r`)
              return true
            }
          } catch { /* malformed — fall through to plain \r */ }
        }
      }
    } else if (data === '\x7f' || data === '\b') {
      // Backspace
      inputBuffers.set(taskId, buf.slice(0, -1))
    } else if (data === '\x03' || data === '\x1b') {
      // Ctrl+C / Escape — discard buffer
      inputBuffers.set(taskId, '')
    } else if (!data.startsWith('\x1b')) {
      // Regular printable characters (skip escape sequences like arrow keys)
      inputBuffers.set(taskId, buf + data)
    }

    return writeToPty(taskId, data)
  })
  ipcMain.handle('pty:resize', (_, { taskId, cols, rows }) => resizePty(taskId, cols, rows))
  ipcMain.handle('pty:kill', (_, taskId: string) => {
    killPtySession(taskId)
    const task = getTaskById(taskId) as { status: string } | null
    if (task && task.status !== 'completed' && task.status !== 'failed') {
      updateTaskStatus(taskId, 'paused')
    }
    return { success: true }
  })
  ipcMain.handle('pty:sessions', () => getActiveSessions())

  ipcMain.handle('pty:restart', (_, { taskId, cols = 80, rows = 24 }: { taskId: string; cols?: number; rows?: number }) => {
    const task = getTaskById(taskId) as {
      process_type: string
      project_path: string
      branch?: string
      summary?: string
    } | null
    if (!task) throw new Error('Task not found')

    killPtySession(taskId)

    const skipPermsRestart = getSetting('CLAUDE_SKIP_PERMISSIONS') !== 'false'
    const claudeArgsRestart = skipPermsRestart ? ['--dangerously-skip-permissions'] : []
    const commands: Record<string, { cmd: string; args: string[] }> = {
      'claude-code': { cmd: 'claude', args: claudeArgsRestart },
      aider: { cmd: 'aider', args: ['--yes'] },
      opencode: { cmd: 'opencode', args: [] },
      generic: { cmd: process.platform === 'win32' ? 'cmd.exe' : 'bash', args: [] }
    }
    const { cmd, args } = commands[task.process_type] ?? commands.generic

    // Inject all previous session summaries as context on restart (only if setting is enabled)
    const isAgent = task.process_type !== 'generic'
    let contextPrompt: string | undefined
    if (isAgent && getSetting('AUTO_INJECT_CONTEXT') === 'true') {
      const summaryRows = getTaskSummaries(taskId)
      if (summaryRows.length > 0) {
        const summaries = summaryRows.map((r) => JSON.parse(r.summary_json))
        contextPrompt = formatSummaryAsContext(summaries)
      }
    }

    createPtySession(taskId, cmd, args, task.project_path, undefined, contextPrompt, cols, rows)

    updateTaskStatus(taskId, 'running')
    return { success: true }
  })

  // --- Settings ---
  ipcMain.handle('settings:get', (_, key: string) => {
    if (key === 'CLAUDE_CLI_AVAILABLE') return String(isClaudeCliAvailable())
    return getSettingForClient(key)
  })
  ipcMain.handle('settings:getAll', () => {
    return { CLAUDE_CLI_AVAILABLE: String(isClaudeCliAvailable()) }
  })
  ipcMain.handle('settings:set', (_, { key, value }: { key: string; value: string }) => {
    setSetting(key, value)
    return { success: true }
  })

  // --- Git ---
  ipcMain.handle(
    'git:getChanges',
    (_, { cwd, branch, startCommit }: { cwd: string; branch?: string; startCommit?: string }) =>
      getGitChanges(cwd, branch, startCommit)
  )

  ipcMain.handle(
    'git:getFileDiff',
    (_, { cwd, filePath, startCommit }: { cwd: string; filePath: string; startCommit?: string }) =>
      getFileDiff(cwd, filePath, startCommit)
  )
}
