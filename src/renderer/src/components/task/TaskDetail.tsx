import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  GitBranch,
  Clock,
  FileCode,
  Square,
  Loader2,
  MessageSquare,
  Folder,
  Save,
  GitCommit,
  CheckCircle2,
  PauseCircle
} from 'lucide-react'
import { cn, formatDuration, formatRelativeTime, truncatePath } from '../../lib/utils'
import { STATUS_CONFIG, PROCESS_LABELS, PROCESS_COLORS, type Task } from '../../types'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Terminal } from './Terminal'
import { TaskTimeline } from './TaskTimeline'
import { FileChanges } from './FileChanges'
import { useAppStore } from '../../stores/appStore'

const isElectron = typeof window !== 'undefined' && !!window.api

interface TaskDetailProps {
  task: Task
}

type DetailTab = 'terminal' | 'timeline' | 'files' | 'notes' | 'summary'

export function TaskDetail({ task }: TaskDetailProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('terminal')
  const [notes, setNotes] = useState(task.notes ?? '')
  const [notesSaved, setNotesSaved] = useState(false)
  const [summaryJson, setSummaryJson] = useState(task.summary ?? '')
  const [isStopping, setIsStopping] = useState(false)
  const selectTask = useAppStore((s) => s.selectTask)
  const updateTask = useAppStore((s) => s.updateTask)

  // Sync notes when task changes
  useEffect(() => {
    setNotes(task.notes ?? '')
  }, [task.id, task.notes])

  // Sync summary JSON from task store
  useEffect(() => {
    setSummaryJson(task.summary ?? '')
  }, [task.id, task.summary])

  // Eagerly fetch file count so the Files tab label is correct on first render
  useEffect(() => {
    if (!isElectron || !task.project_path) return
    const startCommit: string | undefined = (() => {
      try { return task.metadata ? JSON.parse(task.metadata).startCommit : undefined } catch { return undefined }
    })()
    window.api.git.getChanges(task.project_path, task.branch, startCommit).then((data) => {
      if (data.files.length !== task.changed_files_count) {
        updateTask(task.id, { changed_files_count: data.files.length })
      }
    }).catch(() => {})
  }, [task.id, task.project_path, task.branch])

  // Live summary updates from PTY
  useEffect(() => {
    if (!isElectron || !window.api.pty.onSummary) return
    const unsub = window.api.pty.onSummary(task.id, (newSummaryJson) => {
      setSummaryJson(newSummaryJson)
      updateTask(task.id, { summary: newSummaryJson, updated_at: Math.floor(Date.now() / 1000) })
    })
    return unsub
  }, [task.id, updateTask])

  const handleStop = useCallback(async () => {
    if (!isElectron) return
    setIsStopping(true)
    await window.api.pty.kill(task.id)
    updateTask(task.id, { status: 'paused', updated_at: Math.floor(Date.now() / 1000) })
    setIsStopping(false)
  }, [task.id, updateTask])

  const handleSaveNotes = useCallback(async () => {
    if (isElectron) {
      await window.api.tasks.updateNotes({ id: task.id, notes })
    }
    updateTask(task.id, { notes })
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 1500)
  }, [task.id, notes, updateTask])


  const statusCfg = STATUS_CONFIG[task.status]
  const processColor = PROCESS_COLORS[task.process_type]

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Detail header */}
      <div className="flex items-start gap-4 px-6 py-4 border-b border-white/[0.06] bg-[#0d0d0d] shrink-0">
        <button
          onClick={() => selectTask(null)}
          className="mt-0.5 p-1.5 -ml-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {/* Title */}
              <h1 className="text-base font-semibold text-zinc-100 leading-snug mb-2">
                {task.title}
              </h1>

              {/* Meta chips */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Status */}
                <Badge variant={task.status} className="gap-1.5">
                  <StatusDot status={task.status} />
                  {statusCfg.label}
                </Badge>

                {/* Process */}
                <div
                  className="flex items-center gap-1.5 text-[11px] font-medium"
                  style={{ color: processColor }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: processColor }}
                  />
                  {PROCESS_LABELS[task.process_type]}
                </div>

                {/* Project */}
                <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                  <Folder className="w-3 h-3" />
                  <span>{task.project_name}</span>
                  <span className="text-zinc-700">·</span>
                  <span className="font-mono text-[10px]">{truncatePath(task.project_path, 35)}</span>
                </div>

                {/* Branch */}
                {task.branch && (
                  <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                    <GitBranch className="w-3 h-3" />
                    <span className="font-mono">{task.branch}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {task.status === 'running' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8 text-xs"
                  onClick={handleStop}
                  disabled={isStopping}
                >
                  <Square className="w-3 h-3" />
                  {isStopping ? 'Stopping...' : 'Stop'}
                </Button>
              )}
              {task.status === 'waiting' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8 text-xs border-amber-500/20 text-amber-400 hover:bg-amber-500/10"
                  onClick={() => setActiveTab('terminal')}
                >
                  <MessageSquare className="w-3 h-3" />
                  Respond to Agent
                </Button>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-3">
            <RuntimeDisplay task={task} />
            <StatItem icon={<FileCode className="w-3 h-3" />} label={`${task.changed_files_count} files changed`} />
            <StatItem
              icon={<Clock className="w-3 h-3" />}
              label={`Last activity ${formatRelativeTime(task.updated_at)}`}
            />
          </div>
        </div>
      </div>

      {/* Context summary (prompt) */}
      <div className="px-6 py-3 border-b border-white/[0.05] bg-white/[0.01] shrink-0">
        <div className="flex items-start gap-2">
          <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mt-0.5 w-12 shrink-0">
            Prompt
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">{task.prompt}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 px-6 border-b border-white/[0.06] bg-[#0d0d0d] shrink-0">
        {(
          [
            { id: 'terminal', label: 'Terminal' },
            { id: 'timeline', label: 'Timeline' },
            { id: 'files', label: `Files (${task.changed_files_count})` },
            { id: 'notes', label: 'Notes' },
            { id: 'summary', label: 'Summary' }
          ] as { id: DetailTab; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-3 text-xs font-medium border-b-2 transition-all duration-100',
              activeTab === tab.id
                ? 'border-blue-500 text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'terminal' && (
          <div className="h-full p-5">
            <Terminal task={task} className="h-full" />
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="h-full overflow-y-auto px-6 py-4">
            <TaskTimeline taskId={task.id} />
          </div>
        )}

        {activeTab === 'files' && (
          <div className="h-full overflow-y-auto px-6 py-4">
            <FileChanges task={task} />
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="h-full p-5">
            <div className="h-full flex flex-col gap-3">
              <p className="text-xs text-zinc-500">
                Task notes — visible only to you, stored locally.
              </p>
              <textarea
                className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-white/20 resize-none font-mono"
                placeholder="Add notes about this task, blockers, context..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 gap-1.5"
                  onClick={handleSaveNotes}
                >
                  <Save className="w-3 h-3" />
                  {notesSaved ? 'Saved!' : 'Save Notes'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="h-full overflow-y-auto px-6 py-4">
            <SessionSummaryList summaryJson={summaryJson} />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 px-6 py-2 border-t border-white/[0.05] bg-[#0d0d0d] shrink-0">
        <div className="flex items-center gap-1.5 text-[11px]">
          <StatusDot status={task.status} />
          <span className={statusCfg.color}>{statusCfg.label}</span>
        </div>
        <span className="text-zinc-700">·</span>
        <span className="text-[11px] text-zinc-600 font-mono">{task.id}</span>
        <div className="ml-auto flex items-center gap-2">
          {task.status === 'running' && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Agent active
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function RuntimeDisplay({ task }: { task: Task }) {
  const [elapsed, setElapsed] = useState(task.runtime_seconds)

  useEffect(() => {
    if (task.status !== 'running' || !task.started_at) {
      setElapsed(task.runtime_seconds)
      return
    }
    const tick = () => {
      setElapsed(Math.floor(Date.now() / 1000) - task.started_at!)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [task.status, task.started_at, task.runtime_seconds])

  return <StatItem icon={<Clock className="w-3 h-3" />} label={formatDuration(elapsed)} />
}

function StatusDot({ status }: { status: Task['status'] }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span
      className={cn(
        'w-1.5 h-1.5 rounded-full shrink-0',
        cfg.dot,
        status === 'running' && 'animate-pulse'
      )}
    />
  )
}

function StatItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1 text-[11px] text-zinc-500">
      {icon}
      <span>{label}</span>
    </div>
  )
}

interface SessionSummaryEntry {
  session_id: string
  timestamp: string
  text?: string           // new format: prose paragraph
  summary?: string[]      // legacy format: bullet array
  modified_files: string[]
  commits: string[]
  status: 'completed' | 'waiting'
}

function SessionSummaryList({ summaryJson }: { summaryJson: string }) {
  let s: SessionSummaryEntry | null = null
  try {
    if (summaryJson) {
      const parsed = JSON.parse(summaryJson)
      s = Array.isArray(parsed) ? parsed[0] ?? null : parsed
    }
  } catch { /* invalid json */ }

  if (!s) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-zinc-600">
        <CheckCircle2 className="w-6 h-6 opacity-30" />
        <p className="text-xs">No summary yet — generated automatically after 15 s of agent inactivity</p>
        <p className="text-[11px] text-zinc-700">Requires the claude CLI to be installed</p>
      </div>
    )
  }

  const date = (() => { try { return new Date(s.timestamp).toLocaleString() } catch { return s.timestamp } })()
  const isCompleted = s.status === 'completed'

  // Resolve display text: new prose format or legacy bullet array
  const prosText: string | null = s.text ?? null
  const bulletItems: string[] = (!prosText && Array.isArray(s.summary)) ? s.summary : []

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        {isCompleted
          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          : <PauseCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
        <span className={cn('text-[11px] font-medium', isCompleted ? 'text-emerald-400' : 'text-amber-400')}>
          {isCompleted ? 'Completed' : 'Waiting for input'}
        </span>
        <span className="text-[11px] text-zinc-600 ml-auto">{date}</span>
      </div>

      {/* Prose summary (new format) */}
      {prosText && (
        <p className="text-sm text-zinc-200 leading-relaxed">{prosText}</p>
      )}

      {/* Legacy bullet list */}
      {bulletItems.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {bulletItems.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-zinc-500 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      )}

      {/* Files */}
      {s.modified_files?.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Modified files</span>
          <div className="flex flex-wrap gap-1.5">
            {s.modified_files.map((f) => (
              <span key={f} className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-400 bg-white/[0.04] border border-white/[0.06]">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Commits */}
      {s.commits?.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <GitCommit className="w-3 h-3 text-zinc-600 shrink-0" />
          {s.commits.map((c) => (
            <span key={c} className="text-[10px] font-mono text-zinc-500">{c}</span>
          ))}
        </div>
      )}

      {/* Context hint */}
      <p className="text-[10px] text-zinc-700 pt-1 border-t border-white/[0.04]">
        Automatically appended to every terminal message as <span className="font-mono">[relay_context]</span>
      </p>
    </div>
  )
}
