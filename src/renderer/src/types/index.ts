export type TaskStatus = 'running' | 'waiting' | 'completed' | 'failed' | 'paused' | 'pending'

export type ProcessType = 'claude-code' | 'aider' | 'opencode' | 'generic'

export interface Project {
  id: string
  name: string
  path: string
  description?: string
  created_at: number
  updated_at: number
}

export interface Task {
  id: string
  project_id: string
  project_name: string
  project_path: string
  worktree_path?: string
  title: string
  prompt: string
  process_type: ProcessType
  status: TaskStatus
  branch?: string
  started_at?: number
  completed_at?: number
  updated_at: number
  created_at: number
  runtime_seconds: number
  changed_files_count: number
  notes?: string
  summary?: string
  metadata?: string
  claude_session_id?: string
}

export interface TaskEvent {
  id: string
  task_id: string
  type: 'user_prompt' | 'ai_response' | 'file_change' | 'git_snapshot' | 'system' | 'error' | 'git_merge'
  content?: string
  timestamp: number
  metadata?: string
}

export interface TerminalLog {
  id: number
  task_id: string
  data: string
  timestamp: number
}

export interface FileChange {
  path: string
  type: 'modified' | 'added' | 'deleted' | 'renamed'
  additions?: number
  deletions?: number
}

export const PROCESS_LABELS: Record<ProcessType, string> = {
  'claude-code': 'Claude Code',
  aider: 'Aider',
  opencode: 'OpenCode',
  generic: 'CLI Tool'
}

export const PROCESS_COLORS: Record<ProcessType, string> = {
  'claude-code': '#f97316',
  aider: '#8b5cf6',
  opencode: '#06b6d4',
  generic: '#6b7280'
}

export const STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; color: string; bg: string; dot: string }
> = {
  running: {
    label: 'Running',
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    dot: 'bg-emerald-400'
  },
  waiting: {
    label: 'Waiting',
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    dot: 'bg-amber-400'
  },
  completed: {
    label: 'Completed',
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    dot: 'bg-blue-400'
  },
  failed: {
    label: 'Failed',
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    dot: 'bg-red-400'
  },
  paused: {
    label: 'Paused',
    color: 'text-zinc-400',
    bg: 'bg-zinc-400/10',
    dot: 'bg-zinc-400'
  },
  pending: {
    label: 'Pending',
    color: 'text-zinc-400',
    bg: 'bg-zinc-400/10',
    dot: 'bg-zinc-500'
  }
}

