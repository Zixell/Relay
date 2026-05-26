import React, { useEffect, useState, useCallback } from 'react'
import { FileCode, FilePlus, FileMinus, FileEdit, RefreshCw, GitBranch, GitCommit, AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { getMockFileChanges } from '../../lib/mockData'
import { useAppStore } from '../../stores/appStore'
import type { FileChange, Task } from '../../types'

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

export function FileChanges({ task }: FileChangesProps) {
  const [result, setResult] = useState<GitResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
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
      const data = await window.api.git.getChanges(task.project_path, task.branch, startCommit)
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
  }, [task.id, task.project_path, task.branch, task.changed_files_count, startCommit, updateTask])

  // Initial load
  useEffect(() => {
    load()
  }, [load])

  // Poll every 8 seconds while tab is visible
  useEffect(() => {
    const id = setInterval(() => load(), 8000)
    return () => clearInterval(id)
  }, [load])

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
        {result.committedCount > 0 && (
          <div className="ml-auto flex items-center gap-1 text-[11px] text-violet-400">
            <GitCommit className="w-3 h-3" />
            <span>{result.committedCount} commit{result.committedCount !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

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
            <FileRow key={file.path} file={file} />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center h-16 text-xs text-zinc-600">
          Working tree clean
        </div>
      )}
    </div>
  )
}

function FileRow({ file }: { file: FileChange }) {
  const Icon = FILE_ICONS[file.type]
  const total = (file.additions ?? 0) + (file.deletions ?? 0)
  const addRatio = total > 0 ? (file.additions ?? 0) / total : 0

  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors group">
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
