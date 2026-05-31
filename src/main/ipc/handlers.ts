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
  deleteProject,
  insertTask,
  insertTaskEvent,
  updateTaskStatus,
  updateTaskNotes,
  updateTaskClaudeSessionId,
  appendTaskSummary,
  deleteTask
} from '../db'
import {
  createPtySession,
  writeToPty,
  resizePty,
  killPtySession,
  getActiveSessions,
  unlockTaskStatus,
  watchForNewClaudeSession
} from '../pty/manager'
import {
  getGitChanges,
  getFileDiff,
  getCurrentCommit,
  getLocalBranches,
  getWorkingDirStatus,
  stageFiles,
  commitStaged,
  pushOrigin,
  pullOrigin,
  mergeBranch
} from '../git'
import { addWorktree, removeWorktree } from '../git/worktree'
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
  ipcMain.handle('projects:delete', (_, id: string) => {
    deleteProject(id)
    return { success: true }
  })

  // --- Tasks ---
  ipcMain.handle('tasks:getAll', () => getAllTasks())
  ipcMain.handle('tasks:getById', (_, id: string) => getTaskById(id))
  ipcMain.handle(
    'tasks:create',
    (_, { projectId, title, prompt, processType, branch, cwd, cols = 80, rows = 24 }) => {
      const id = randomUUID()

      // Create an isolated git worktree for this task so multiple tasks can run
      // in parallel without branch-switching conflicts in the main checkout.
      let worktreePath = ''
      let branchCreated = false
      if (cwd) {
        try {
          const result = addWorktree(cwd, id, branch)
          worktreePath = result.worktreePath
          branchCreated = result.branchCreated
        } catch (err) {
          if (branch) throw err  // user chose an explicit branch — surface the error
          // Non-git project or no branch specified: fall back to running in project dir
          console.warn('[relay] Worktree creation skipped, running in project directory:', err)
        }
      }

      // The effective working directory is the worktree (if created) or the project root
      const effectiveCwd = worktreePath || cwd || process.cwd()

      // Record the HEAD commit at session start so the Files tab can scope the diff
      const startCommit = effectiveCwd ? getCurrentCommit(effectiveCwd) : ''

      insertTask({
        id,
        project_id: projectId,
        title,
        prompt,
        process_type: processType,
        branch,
        worktree_path: worktreePath || undefined,
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

      if (branch || worktreePath) {
        const worktreeNote = worktreePath ? ` (worktree: ${worktreePath})` : ''
        insertTaskEvent({
          id: randomUUID(),
          task_id: id,
          type: 'system',
          content: branchCreated
            ? `Created branch: ${branch || `relay/task-${id.slice(0, 8)}`}${worktreeNote}`
            : worktreePath
              ? `Using branch: ${branch || 'current'}${worktreeNote}`
              : `Switched to existing branch: ${branch}`
        })
      }

      // Build command from process type.
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

      // For claude-code: snapshot existing session files BEFORE launch, then
      // watch for the new one Claude creates — its UUID filename is the session ID.
      if (processType === 'claude-code') {
        watchForNewClaudeSession((sessionId) => {
          updateTaskClaudeSessionId(id, sessionId)
        })
      }

      createPtySession(id, cmd, args, effectiveCwd, undefined, sendPrompt ? prompt : undefined, cols, rows)

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
      worktree_path?: string
      branch?: string
      summary?: string
      claude_session_id?: string
    } | null
    if (!task) throw new Error('Task not found')

    killPtySession(taskId)

    const skipPermsRestart = getSetting('CLAUDE_SKIP_PERMISSIONS') !== 'false'
    const claudeBaseArgs = skipPermsRestart ? ['--dangerously-skip-permissions'] : []

    let cmd: string
    let args: string[]

    // For claude-code with a saved session ID, resume the existing session
    if (task.process_type === 'claude-code' && task.claude_session_id) {
      cmd = 'claude'
      args = ['--resume', task.claude_session_id, ...claudeBaseArgs]
    } else {
      const commands: Record<string, { cmd: string; args: string[] }> = {
        'claude-code': { cmd: 'claude', args: claudeBaseArgs },
        aider: { cmd: 'aider', args: ['--yes'] },
        opencode: { cmd: 'opencode', args: [] },
        generic: { cmd: process.platform === 'win32' ? 'cmd.exe' : 'bash', args: [] }
      }
      const resolved = commands[task.process_type] ?? commands.generic
      cmd = resolved.cmd
      args = resolved.args
    }

    // Inject context on restart only when NOT resuming a Claude session
    // (resuming already restores the full conversation history)
    let contextPrompt: string | undefined
    const isAgent = task.process_type !== 'generic'
    const isResuming = task.process_type === 'claude-code' && !!task.claude_session_id
    if (isAgent && !isResuming && getSetting('AUTO_INJECT_CONTEXT') === 'true') {
      const summaryRows = getTaskSummaries(taskId)
      if (summaryRows.length > 0) {
        const summaries = summaryRows.map((r) => JSON.parse(r.summary_json))
        contextPrompt = formatSummaryAsContext(summaries)
      }
    }

    // Use the task's worktree if it exists, otherwise fall back to the project root
    const sessionCwd = task.worktree_path || task.project_path
    createPtySession(taskId, cmd, args, sessionCwd, undefined, contextPrompt, cols, rows)

    updateTaskStatus(taskId, 'running')
    return { success: true }
  })

  // --- Worktree ---
  ipcMain.handle('worktree:remove', (_, { taskId, force }: { taskId: string; force?: boolean }) => {
    const task = getTaskById(taskId) as {
      project_path: string
      worktree_path?: string
      status: string
    } | null
    if (!task) throw new Error('Task not found')
    if (!task.worktree_path) return { success: true, message: 'No worktree associated with this task' }

    // Stop any running session first
    killPtySession(taskId)

    return removeWorktree(task.project_path, task.worktree_path, force ?? false)
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
  ipcMain.handle('git:getBranches', (_, cwd: string) => getLocalBranches(cwd))
  ipcMain.handle('git:getWorkingStatus', (_, cwd: string) => getWorkingDirStatus(cwd))
  ipcMain.handle('git:stage', (_, { cwd, files }: { cwd: string; files: string[] }) =>
    stageFiles(cwd, files)
  )
  ipcMain.handle('git:commit', (_, { cwd, message }: { cwd: string; message: string }) =>
    commitStaged(cwd, message)
  )
  ipcMain.handle('git:push', (_, cwd: string) => pushOrigin(cwd))
  ipcMain.handle('git:pull', (_, cwd: string) => pullOrigin(cwd))
  ipcMain.handle('git:merge', (_, { cwd, branch }: { cwd: string; branch: string }) =>
    mergeBranch(cwd, branch)
  )

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
