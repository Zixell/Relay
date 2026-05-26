import React, { useState } from 'react'
import { FolderOpen, GitBranch, Play, Zap } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { useAppStore } from '../../stores/appStore'
import type { ProcessType, Task } from '../../types'

interface CreateTaskModalProps {
  open: boolean
  onClose: () => void
}

const PROCESS_OPTIONS: { value: ProcessType; label: string; desc: string; color: string; disabled?: boolean }[] = [
  {
    value: 'claude-code',
    label: 'Claude Code',
    desc: 'Anthropic\'s coding agent',
    color: 'bg-blue-500'
  },
  {
    value: 'aider',
    label: 'Aider',
    desc: 'Coming soon',
    color: 'bg-violet-500',
    disabled: true
  },
  {
    value: 'opencode',
    label: 'OpenCode',
    desc: 'Coming soon',
    color: 'bg-emerald-500',
    disabled: true
  },
  {
    value: 'generic',
    label: 'CLI Tool',
    desc: 'Coming soon',
    color: 'bg-orange-500',
    disabled: true
  }
]

const PROMPT_SUGGESTIONS = [
  'Refactor the auth module to use JWT refresh tokens',
  'Fix the N+1 query in the users endpoint',
  'Add comprehensive tests for the payment service',
  'Implement rate limiting middleware',
  'Migrate the database schema to support multi-tenancy'
]

export function CreateTaskModal({ open, onClose }: CreateTaskModalProps) {
  const { projects, addTask, addProject } = useAppStore()

  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [projectId, setProjectId] = useState('')
  const [processType, setProcessType] = useState<ProcessType>('claude-code')
  const [branch, setBranch] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [newProjectPath, setNewProjectPath] = useState('')
  const [error, setError] = useState('')

  const isElectron = typeof window !== 'undefined' && !!window.api

  const handleFolderPick = async () => {
    if (!isElectron) return
    const path = await window.api.dialog.openFolder()
    if (path) {
      setNewProjectPath(path)
      const name = path.split(/[/\\]/).pop() ?? path
      setTitle((prev) => prev || `Task in ${name}`)
    }
  }

  const handleCreate = async () => {
    if (!title.trim() || !prompt.trim()) return
    setError('')
    setIsCreating(true)

    try {
      const now = Math.floor(Date.now() / 1000)
      let resolvedId = ''
      let resolvedName = ''
      let resolvedPath = ''

      if (isElectron) {
        if (newProjectPath) {
          // Create or find project by path (server handles duplicates via INSERT OR IGNORE)
          const name = newProjectPath.split(/[/\\]/).pop() ?? 'project'
          const created = await window.api.projects.create({ name, path: newProjectPath })
          resolvedId = created.id
          resolvedName = created.name
          resolvedPath = created.path
          // Sync to store (replace if already there, add if new)
          addProject({ ...created, created_at: now, updated_at: now })
        } else if (projectId) {
          const proj = projects.find((p) => p.id === projectId)
          if (!proj) {
            setError('Selected project not found. Please pick a folder instead.')
            return
          }
          resolvedId = proj.id
          resolvedName = proj.name
          resolvedPath = proj.path
        } else {
          setError('Please select a project or click Browse to pick a folder.')
          return
        }
      } else {
        // Browser / mock mode — no DB, use whatever is selected
        const proj = projects.find((p) => p.id === projectId) ?? projects[0]
        resolvedId = proj?.id ?? 'mock'
        resolvedName = proj?.name ?? 'project'
        resolvedPath = newProjectPath || (proj?.path ?? '')
      }

      const newTask: Task = {
        id: crypto.randomUUID(), // overwritten below in Electron
        project_id: resolvedId,
        project_name: resolvedName,
        project_path: resolvedPath,
        title: title.trim(),
        prompt: prompt.trim(),
        process_type: processType,
        status: 'running',
        branch: branch || undefined,
        started_at: now,
        updated_at: now,
        created_at: now,
        runtime_seconds: 0,
        changed_files_count: 0,
        notes: ''
      }

      if (isElectron) {
        const created = await window.api.tasks.create({
          projectId: resolvedId,
          title: newTask.title,
          prompt: newTask.prompt,
          processType,
          branch: branch || undefined,
          cwd: resolvedPath
        })
        newTask.id = created.id
      }

      addTask(newTask)
      onClose()
      resetForm()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create task.')
    } finally {
      setIsCreating(false)
    }
  }

  const resetForm = () => {
    setTitle('')
    setPrompt('')
    setProjectId('')
    setProcessType('claude-code')
    setBranch('')
    setNewProjectPath('')
    setError('')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            New Task
          </DialogTitle>
          <DialogDescription>
            Start a new AI coding session. Tasks are persistent — you can always resume them.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2 space-y-4">
          {/* Task title */}
          <Field label="Task Name" required>
            <Input
              placeholder="e.g. Refactor auth to use JWT"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </Field>

          {/* Project */}
          <Field label="Project" required>
            <div className="flex gap-2">
              {!newProjectPath && (
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={isElectron ? 'Pick a folder or select existing...' : 'Select project...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5 h-9"
                onClick={handleFolderPick}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                {newProjectPath ? 'Change' : 'Browse'}
              </Button>
            </div>
            {newProjectPath && (
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[11px] text-zinc-400 font-mono flex-1 truncate">{newProjectPath}</p>
                <button
                  onClick={() => setNewProjectPath('')}
                  className="text-[10px] text-zinc-600 hover:text-zinc-400 shrink-0"
                >
                  ✕ clear
                </button>
              </div>
            )}
          </Field>

          {/* Agent */}
          <Field label="Agent">
            <div className="grid grid-cols-4 gap-2">
              {PROCESS_OPTIONS.map((opt) => {
                const selected = processType === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => !opt.disabled && setProcessType(opt.value)}
                    className={[
                      'relative flex items-center justify-between gap-1.5 rounded-lg border px-2.5 py-2.5 transition-colors',
                      opt.disabled
                        ? 'cursor-not-allowed border-white/[0.04] bg-white/[0.01] opacity-40'
                        : selected
                          ? 'border-blue-500/50 bg-blue-500/10 text-zinc-100'
                          : 'border-white/[0.07] bg-white/[0.02] text-zinc-400 hover:border-white/[0.12] hover:text-zinc-300'
                    ].join(' ')}
                  >
                    <div className="flex flex-col items-start">
                      <span className="text-[11px] font-medium leading-tight">{opt.label}</span>
                      {opt.disabled && (
                        <span className="text-[9px] text-zinc-600 leading-none">soon</span>
                      )}
                    </div>
                    <span className={`w-2 h-2 rounded-full ${opt.color} shrink-0`} />
                  </button>
                )
              })}
            </div>
          </Field>

          {/* Prompt */}
          <Field label="Initial Prompt" required>
            <Textarea
              placeholder="Describe what you want the agent to do..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[240px]"
            />
            {/* Suggestions */}
            {!prompt && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {PROMPT_SUGGESTIONS.slice(0, 3).map((s) => (
                  <button
                    key={s}
                    onClick={() => setPrompt(s)}
                    className="text-[10px] px-2 py-1 rounded-md border border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.10] transition-colors text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </Field>

          {/* Branch (optional) */}
          <Field label="Git Branch" optional>
            <div className="relative">
              <GitBranch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
              <Input
                placeholder="feat/new-feature (leave blank for current branch)"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="pl-8"
              />
            </div>
          </Field>
        </div>

        {error && (
          <div className="px-6 pb-2">
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleCreate}
            disabled={!title.trim() || !prompt.trim() || isCreating}
            className="gap-1.5"
          >
            {isCreating ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Start Task
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
  required,
  optional
}: {
  label: string
  children: React.ReactNode
  required?: boolean
  optional?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
        {label}
        {required && <span className="text-blue-500">*</span>}
        {optional && <span className="text-zinc-600 font-normal">(optional)</span>}
      </label>
      {children}
    </div>
  )
}
