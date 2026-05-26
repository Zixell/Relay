import React, { useState, useEffect } from 'react'
import { GitBranch } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'

interface GitFile {
  path: string
  staged: boolean
  statusCode: string
}

interface GitCommitModalProps {
  open: boolean
  cwd: string
  onClose: () => void
  onCommitted: () => void
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  M: { label: 'modified', color: 'text-blue-400' },
  A: { label: 'added', color: 'text-emerald-400' },
  D: { label: 'deleted', color: 'text-red-400' },
  R: { label: 'renamed', color: 'text-violet-400' }
}

export function GitCommitModal({ open, cwd, onClose, onCommitted }: GitCommitModalProps) {
  const [files, setFiles] = useState<GitFile[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setMessage('')
    window.api.git.getWorkingStatus(cwd).then((status: { isGitRepo: boolean; branch: string; files: GitFile[] }) => {
      setFiles(status.files)
      // Pre-select all files
      setSelected(new Set(status.files.map((f) => f.path)))
    })
  }, [open, cwd])

  const toggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const handleCommit = async () => {
    if (!message.trim() || selected.size === 0) return
    setLoading(true)
    setError('')
    try {
      const filesToStage = [...selected]
      const stageResult = await window.api.git.stage(cwd, filesToStage)
      if (!stageResult.success) {
        setError(stageResult.stderr || 'Failed to stage files')
        return
      }
      const commitResult = await window.api.git.commit(cwd, message.trim())
      if (!commitResult.success) {
        setError(commitResult.stderr || 'Commit failed')
        return
      }
      onCommitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-blue-400" />
            Commit Changes
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-2 space-y-4">
          {/* File list */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-zinc-300">Files</span>
              {files.length > 0 && (
                <button
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  onClick={() =>
                    selected.size === files.length
                      ? setSelected(new Set())
                      : setSelected(new Set(files.map((f) => f.path)))
                  }
                >
                  {selected.size === files.length ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>

            {files.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-500">No changed files</div>
            ) : (
              <div className="max-h-[200px] overflow-y-auto rounded-lg border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
                {files.map((file) => {
                  const checked = selected.has(file.path)
                  const meta = STATUS_LABELS[file.statusCode] ?? { label: file.statusCode, color: 'text-zinc-400' }
                  return (
                    <label
                      key={file.path}
                      className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-white/[0.03] transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(file.path)}
                        className="w-3.5 h-3.5 accent-blue-500 shrink-0"
                      />
                      <span className="flex-1 text-xs font-mono text-zinc-300 truncate min-w-0">
                        {file.path}
                      </span>
                      <span className={`text-[10px] shrink-0 ${meta.color}`}>{meta.label}</span>
                      {file.staged && (
                        <span className="text-[10px] text-zinc-600 shrink-0">staged</span>
                      )}
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {/* Commit message */}
          <div>
            <label className="text-xs font-medium text-zinc-300 mb-1.5 block">
              Commit message <span className="text-blue-500">*</span>
            </label>
            <Textarea
              placeholder="feat: describe your changes..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[80px] text-xs"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 font-mono">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleCommit}
            disabled={!message.trim() || selected.size === 0 || loading}
            className="gap-1.5"
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Committing...
              </>
            ) : (
              <>Commit {selected.size > 0 && `(${selected.size})`}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
