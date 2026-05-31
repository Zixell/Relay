import React, { useEffect, useState, useCallback } from 'react'
import { FileCode, FilePlus, FileMinus, FileEdit, RefreshCw, GitBranch, GitCommit, AlertTriangle, GitMerge, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { getMockFileChanges } from '../../lib/mockData'
import { useAppStore } from '../../stores/appStore'
import type { FileChange, Task } from '../../types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'

const isElectron = typeof window !== 'undefined' && !!window.api

interface GitResult {
  isGitRepo: boolean
  branch: string
  baseBranch: string
  files: FileChange[]
  committedCount: number
  isActiveBranch: boolean
}

interface FileChangesProps {
  task: Task
}

type MergeState = 'idle' | 'merging' | 'success' | 'error'

export function FileChanges({ task }: FileChangesProps) {
  const [result, setResult] = useState<GitResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [diffFile, setDiffFile] = useState<FileChange | null>(null)
  const [mergeState, setMergeState] = useState<MergeState>('idle')
  const [mergeError, setMergeError] = useState<string | null>(null)
  const updateTask = useAppStore((s) => s.updateTask)

  const startCommit: string | undefined = (() => {
    try { return task.metadata ? JSON.parse(task.metadata).startCommit : undefined } catch { return undefined }
  })()

  const load = useCallback(async (isManual = false) => {
    if (!isElectron) {
      const files = getMockFileChanges(task.id)
      setResult({
        isGitRepo: true,
        branch: task.branch ?? 'feat/mock-branch',
        baseBranch: 'main',
        files,
        committedCount: 2,
        isActiveBranch: true
      })
      setLoading(false)
      return
    }

    if (isManual) setRefreshing(true)
    try {
      const gitCwd = task.worktree_path || task.project_path
      const data = await window.api.git.getChanges(gitCwd, task.branch, startCommit)
      setResult(data)
      setLastRefreshed(new Date())
      // Keep changed_files_count in sync so the tab label stays accurate
      if (data.files.length !== task.changed_files_count) {
        updateTask(task.id, { changed_files_count: data.files.length })
      }
    } catch {
      // keep previous result
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [task.id, task.project_path, task.worktree_path, task.branch, task.changed_files_count, startCommit, updateTask])

  // Initial load
  useEffect(() => {
    load()
  }, [load])

  // Poll every 8 seconds while tab is visible
  useEffect(() => {
    const id = setInterval(() => load(), 8000)
    return () => clearInterval(id)
  }, [load])

  const handleMerge = useCallback(async () => {
    if (!isElectron || !result?.branch || !task.project_path) return
    setMergeState('merging')
    setMergeError(null)
    try {
      const res = await window.api.git.merge(task.project_path, result.branch)
      if (res.success) {
        setMergeState('success')
        setTimeout(() => setMergeState('idle'), 3000)
      } else {
        setMergeState('error')
        setMergeError(res.stderr || 'Merge failed')
      }
    } catch (err) {
      setMergeState('error')
      setMergeError(String(err))
    }
  }, [result?.branch, task.project_path])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-24 text-xs text-zinc-600">
        Loading...
      </div>
    )
  }

  if (!result?.isGitRepo) {
    return (
      <div className="flex flex-col items-center justify-center h-24 gap-1.5 text-xs text-zinc-600">
        <GitBranch className="w-4 h-4" />
        <span>Not a git repository</span>
      </div>
    )
  }

  const files = result.files
  const totalAdditions = files.reduce((a, f) => a + (f.additions ?? 0), 0)
  const totalDeletions = files.reduce((a, f) => a + (f.deletions ?? 0), 0)

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 text-xs">
          {files.length > 0 ? (
            <>
              <span className="text-zinc-500">{files.length} file{files.length !== 1 ? 's' : ''} changed</span>
              {totalAdditions > 0 && <span className="text-emerald-500 font-mono">+{totalAdditions}</span>}
              {totalDeletions > 0 && <span className="text-red-500 font-mono">-{totalDeletions}</span>}
            </>
          ) : (
            <span className="text-zinc-600">No changes</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span className="text-[10px] text-zinc-700 font-mono">
              {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05] transition-colors disabled:opacity-40"
          >
            <RefreshCw className={cn('w-3 h-3', refreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Branch info */}
      <div className="flex items-center gap-3 mb-3 px-2 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <GitBranch className="w-3 h-3" />
          <span className="font-mono text-zinc-300">{result.branch}</span>
          {result.baseBranch && (
            <>
              <span className="text-zinc-700">←</span>
              <span className="font-mono text-zinc-600">{result.baseBranch}</span>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {result.committedCount > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-violet-400">
              <GitCommit className="w-3 h-3" />
              <span>{result.committedCount} commit{result.committedCount !== 1 ? 's' : ''}</span>
            </div>
          )}
          {task.worktree_path && result.branch && (
            <button
              onClick={handleMerge}
              disabled={mergeState === 'merging'}
              title={`Merge ${result.branch} into ${task.project_path}`}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                mergeState === 'idle' && 'text-blue-400 hover:bg-blue-500/10 hover:text-blue-300',
                mergeState === 'merging' && 'text-zinc-500 cursor-not-allowed',
                mergeState === 'success' && 'text-emerald-400',
                mergeState === 'error' && 'text-red-400 hover:bg-red-500/10'
              )}
            >
              {mergeState === 'merging' && <Loader2 className="w-3 h-3 animate-spin" />}
              {mergeState === 'success' && <CheckCircle2 className="w-3 h-3" />}
              {mergeState === 'error' && <XCircle className="w-3 h-3" />}
              {mergeState === 'idle' && <GitMerge className="w-3 h-3" />}
              <span>
                {mergeState === 'merging' ? 'Merging…' :
                 mergeState === 'success' ? 'Merged!' :
                 mergeState === 'error' ? 'Failed' :
                 'Merge to main'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Merge error */}
      {mergeState === 'error' && mergeError && (
        <div className="flex items-start gap-2 mb-3 px-2 py-1.5 rounded-lg bg-red-400/[0.06] border border-red-400/20 text-[11px] text-red-400">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
          <span className="font-mono break-all">{mergeError}</span>
        </div>
      )}

      {/* Warning: branch not currently checked out */}
      {!result.isActiveBranch && (
        <div className="flex items-center gap-2 mb-3 px-2 py-1.5 rounded-lg bg-amber-400/[0.06] border border-amber-400/20 text-[11px] text-amber-400">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>
            Branch <span className="font-mono">{result.branch}</span> is not currently checked out — showing committed changes only
          </span>
        </div>
      )}

      {/* File list */}
      {files.length > 0 ? (
        <div className="space-y-0.5">
          {files.map((file) => (
            <FileRow key={file.path} file={file} onDoubleClick={() => setDiffFile(file)} />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center h-16 text-xs text-zinc-600">
          Working tree clean
        </div>
      )}

      {diffFile && (
        <FileDiffModal
          file={diffFile}
          cwd={task.worktree_path || task.project_path}
          startCommit={startCommit}
          open={!!diffFile}
          onClose={() => setDiffFile(null)}
        />
      )}
    </div>
  )
}

function FileRow({ file, onDoubleClick }: { file: FileChange; onDoubleClick: () => void }) {
  const Icon = FILE_ICONS[file.type]
  const total = (file.additions ?? 0) + (file.deletions ?? 0)
  const addRatio = total > 0 ? (file.additions ?? 0) / total : 0

  return (
    <div
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors group cursor-pointer select-none"
      onDoubleClick={onDoubleClick}
      title="Double-click to view diff"
    >
      <Icon className={cn('w-3.5 h-3.5 shrink-0', FILE_COLORS[file.type])} />
      <span className="text-xs font-mono text-zinc-300 flex-1 truncate min-w-0">{file.path}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        {(file.additions ?? 0) > 0 && (
          <span className="text-[10px] text-emerald-500 font-mono">+{file.additions}</span>
        )}
        {(file.deletions ?? 0) > 0 && (
          <span className="text-[10px] text-red-500 font-mono">-{file.deletions}</span>
        )}
        <div className="w-12 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
          <div
            className="h-full bg-emerald-500/70 rounded-full"
            style={{ width: `${addRatio * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Diff modal ─────────────────────────────────────────────────────────────────

interface DiffLine {
  type: 'header' | 'meta' | 'hunk' | 'add' | 'del' | 'ctx'
  content: string
  oldLine?: number
  newLine?: number
}

function parseDiff(raw: string): DiffLine[] {
  const result: DiffLine[] = []
  let oldLine = 0
  let newLine = 0
  for (const line of raw.split('\n')) {
    if (
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('new file') ||
      line.startsWith('deleted file') ||
      line.startsWith('old mode') ||
      line.startsWith('new mode')
    ) {
      result.push({ type: 'header', content: line })
    } else if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      result.push({ type: 'meta', content: line })
    } else if (line.startsWith('@@ ')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) { oldLine = parseInt(m[1]); newLine = parseInt(m[2]) }
      result.push({ type: 'hunk', content: line })
    } else if (line.startsWith('+')) {
      result.push({ type: 'add', content: line.slice(1), newLine: newLine++ })
    } else if (line.startsWith('-')) {
      result.push({ type: 'del', content: line.slice(1), oldLine: oldLine++ })
    } else {
      result.push({ type: 'ctx', content: line.startsWith(' ') ? line.slice(1) : line, oldLine: oldLine++, newLine: newLine++ })
    }
  }
  // Trim trailing empty context lines
  while (result.length && result[result.length - 1].type === 'ctx' && !result[result.length - 1].content.trim()) {
    result.pop()
  }
  return result
}

interface FileDiffModalProps {
  file: FileChange
  cwd: string
  startCommit?: string
  open: boolean
  onClose: () => void
}

function FileDiffModal({ file, cwd, startCommit, open, onClose }: FileDiffModalProps) {
  const [diff, setDiff] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setDiff(null)
    if (!isElectron) { setLoading(false); return }
    window.api.git.getFileDiff(cwd, file.path, startCommit)
      .then((d: string) => setDiff(d))
      .catch(() => setDiff(null))
      .finally(() => setLoading(false))
  }, [open, file.path, cwd, startCommit])

  const lines = diff ? parseDiff(diff) : []
  const adds = lines.filter((l) => l.type === 'add').length
  const dels = lines.filter((l) => l.type === 'del').length

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-5xl w-[90vw] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-3 pr-8">
            <DialogTitle className="font-mono text-sm text-zinc-200 truncate">{file.path}</DialogTitle>
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              {adds > 0 && <span className="text-[11px] font-mono text-emerald-400">+{adds}</span>}
              {dels > 0 && <span className="text-[11px] font-mono text-red-400">-{dels}</span>}
              <span className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-medium',
                file.type === 'added' ? 'bg-emerald-500/10 text-emerald-400' :
                file.type === 'deleted' ? 'bg-red-500/10 text-red-400' :
                file.type === 'renamed' ? 'bg-amber-500/10 text-amber-400' :
                'bg-blue-500/10 text-blue-400'
              )}>
                {file.type}
              </span>
            </div>
          </div>
          <DialogDescription className="text-[11px] text-zinc-600 mt-0.5">
            Double-click any file row to view its diff
          </DialogDescription>
        </DialogHeader>

        {/* Diff content */}
        <div className="flex-1 overflow-auto bg-[#0a0a0a]">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-xs text-zinc-600">Loading diff…</div>
          ) : lines.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-xs text-zinc-600">No diff available</div>
          ) : (
            <table className="w-full border-collapse text-[11px] font-mono">
              <tbody>
                {lines.map((line, i) => <DiffLineRow key={i} line={line} />)}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DiffLineRow({ line }: { line: DiffLine }) {
  if (line.type === 'header' || line.type === 'meta') {
    return (
      <tr className="bg-zinc-950">
        <td colSpan={4} className="px-4 py-0.5 text-zinc-600 text-[10px] select-none">{line.content}</td>
      </tr>
    )
  }
  if (line.type === 'hunk') {
    return (
      <tr className="bg-blue-950/30 border-y border-blue-900/40">
        <td colSpan={4} className="px-4 py-1 text-blue-400 text-[10px] select-none">{line.content}</td>
      </tr>
    )
  }

  const isAdd = line.type === 'add'
  const isDel = line.type === 'del'

  return (
    <tr className={cn(
      'group',
      isAdd && 'bg-emerald-950/30 hover:bg-emerald-950/50',
      isDel && 'bg-red-950/30 hover:bg-red-950/50',
      !isAdd && !isDel && 'hover:bg-white/[0.02]'
    )}>
      {/* Old line number */}
      <td className="w-10 text-right pr-3 text-zinc-600 select-none border-r border-white/[0.04] bg-black/20 leading-5 align-top py-0.5">
        {line.oldLine !== undefined ? line.oldLine : ''}
      </td>
      {/* New line number */}
      <td className="w-10 text-right pr-3 text-zinc-600 select-none border-r border-white/[0.04] bg-black/20 leading-5 align-top py-0.5">
        {line.newLine !== undefined ? line.newLine : ''}
      </td>
      {/* +/- prefix */}
      <td className={cn(
        'w-5 text-center select-none leading-5 align-top py-0.5',
        isAdd ? 'text-emerald-500' : isDel ? 'text-red-500' : 'text-zinc-700'
      )}>
        {isAdd ? '+' : isDel ? '-' : ' '}
      </td>
      {/* Line content */}
      <td className={cn(
        'px-3 leading-5 whitespace-pre py-0.5 align-top',
        isAdd ? 'text-emerald-200' : isDel ? 'text-red-300' : 'text-zinc-400'
      )}>
        {line.content || ' '}
      </td>
    </tr>
  )
}

const FILE_ICONS: Record<FileChange['type'], React.ElementType> = {
  added: FilePlus,
  modified: FileEdit,
  deleted: FileMinus,
  renamed: FileCode
}

const FILE_COLORS: Record<FileChange['type'], string> = {
  added: 'text-emerald-400',
  modified: 'text-blue-400',
  deleted: 'text-red-400',
  renamed: 'text-amber-400'
}
