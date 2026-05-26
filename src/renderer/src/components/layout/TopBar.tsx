import React from 'react'
import { Plus, Search, SlidersHorizontal, Minus, Square, X } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import type { TaskStatus } from '../../types'

const STATUS_FILTERS: { label: string; value: TaskStatus | null }[] = [
  { label: 'All', value: null },
  { label: 'Running', value: 'running' },
  { label: 'Waiting', value: 'waiting' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' }
]

const isElectron = typeof window !== 'undefined' && !!window.api

export function TopBar() {
  const { statusFilter, setStatusFilter, openCreateModal, selectedTaskId, selectTask } = useAppStore()

  return (
    <header className="flex items-center h-12 px-4 border-b border-white/[0.06] bg-[#0d0d0d] shrink-0 gap-3">
      {/* Window traffic lights placeholder on non-mac or custom frame */}
      {isElectron && (
        <div className="flex items-center gap-1.5 mr-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => window.api.window.close()}
            className="w-3 h-3 rounded-full bg-zinc-700 hover:bg-red-500 transition-colors"
          />
          <button
            onClick={() => window.api.window.minimize()}
            className="w-3 h-3 rounded-full bg-zinc-700 hover:bg-amber-500 transition-colors"
          />
          <button
            onClick={() => window.api.window.maximize()}
            className="w-3 h-3 rounded-full bg-zinc-700 hover:bg-emerald-500 transition-colors"
          />
        </div>
      )}

      {/* Breadcrumb */}
      {selectedTaskId && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <button
            onClick={() => selectTask(null)}
            className="hover:text-zinc-300 transition-colors"
          >
            Tasks
          </button>
          <span>/</span>
          <span className="text-zinc-300 truncate max-w-[200px]">
            {useAppStore.getState().tasks.find((t) => t.id === selectedTaskId)?.title}
          </span>
        </div>
      )}

      {/* Status filters (only on dashboard) */}
      {!selectedTaskId && (
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-100',
                statusFilter === f.value
                  ? 'bg-white/[0.08] text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] hover:border-white/10 text-xs transition-all duration-100">
          <Search className="w-3.5 h-3.5" />
          <span>Search</span>
          <kbd className="ml-1 text-[10px] bg-white/[0.06] px-1.5 py-0.5 rounded text-zinc-600">
            ⌘K
          </kbd>
        </button>

        <Button variant="primary" size="sm" onClick={openCreateModal} className="gap-1.5 h-8 text-xs">
          <Plus className="w-3.5 h-3.5" />
          New Task
        </Button>
      </div>
    </header>
  )
}
