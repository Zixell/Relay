import React, { useState, useEffect } from 'react'
import { Terminal, CheckCircle2, XCircle, FileText, Info, Cpu } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '../ui/dialog'
import { cn } from '../../lib/utils'

const isElectron = typeof window !== 'undefined' && !!window.api

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [claudeAvailable, setClaudeAvailable] = useState<boolean | null>(null)
  const [autoInjectContext, setAutoInjectContext] = useState(false)
  const [skipPermissions, setSkipPermissions] = useState(true)

  useEffect(() => {
    if (!open || !isElectron) return
    window.api.settings.get('CLAUDE_CLI_AVAILABLE').then((val: string) => {
      setClaudeAvailable(val === 'true')
    })
    window.api.settings.get('AUTO_INJECT_CONTEXT').then((val: string) => {
      setAutoInjectContext(val === 'true')
    })
    window.api.settings.get('CLAUDE_SKIP_PERMISSIONS').then((val: string) => {
      // default true — matches original behaviour
      setSkipPermissions(val !== 'false')
    })
  }, [open])

  function toggleAutoInjectContext() {
    const next = !autoInjectContext
    setAutoInjectContext(next)
    if (isElectron) window.api.settings.set('AUTO_INJECT_CONTEXT', String(next))
  }

  function toggleSkipPermissions() {
    const next = !skipPermissions
    setSkipPermissions(next)
    if (isElectron) window.api.settings.set('CLAUDE_SKIP_PERMISSIONS', String(next))
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Relay configuration and integration status.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 px-6 pb-6 pt-1">

          {/* Claude CLI status */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-200">Claude Code CLI</span>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Session summaries are generated automatically using your local{' '}
              <span className="font-mono text-zinc-400">claude</span> CLI after each completed prompt —
              no API credits required.
            </p>

            <div className={cn(
              'flex items-center gap-2.5 px-3 py-2.5 rounded-lg border',
              claudeAvailable === true
                ? 'bg-emerald-400/5 border-emerald-400/20'
                : claudeAvailable === false
                  ? 'bg-red-400/5 border-red-400/20'
                  : 'bg-white/[0.02] border-white/[0.07]'
            )}>
              {claudeAvailable === true && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
              {claudeAvailable === false && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
              {claudeAvailable === null && <div className="w-4 h-4 rounded-full border-2 border-zinc-600 border-t-zinc-400 animate-spin shrink-0" />}
              <div>
                {claudeAvailable === true && (
                  <>
                    <p className="text-xs font-medium text-emerald-400">claude CLI detected</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Summaries will be generated automatically</p>
                  </>
                )}
                {claudeAvailable === false && (
                  <>
                    <p className="text-xs font-medium text-red-400">claude CLI not found</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Install Claude Code to enable summaries
                    </p>
                  </>
                )}
                {claudeAvailable === null && (
                  <p className="text-xs text-zinc-500">Checking...</p>
                )}
              </div>
            </div>
          </div>

          <div className="h-px bg-white/[0.05]" />

          {/* Summary behaviour */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-200">Summary Generation</span>
            </div>
            <div className="flex flex-col gap-2">
              {[
                'Triggered after 15 seconds of agent inactivity',
                'Runs claude --print in the background (no terminal window)',
                'Accumulated per task — each prompt adds a new session entry',
              ].map((item) => (
                <div key={item} className="flex items-start gap-2 text-xs text-zinc-400">
                  <Info className="w-3 h-3 text-zinc-600 mt-0.5 shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="h-px bg-white/[0.05]" />

          {/* Auto inject relay context */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-200">Context Injection</span>
            </div>

            <div className="flex items-start gap-3 px-3 py-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <button
                role="checkbox"
                aria-checked={autoInjectContext}
                onClick={toggleAutoInjectContext}
                className={cn(
                  'relative mt-0.5 w-8 h-[18px] rounded-full transition-colors duration-200 shrink-0 focus:outline-none',
                  autoInjectContext ? 'bg-violet-500' : 'bg-zinc-700'
                )}
              >
                <span className={cn(
                  'absolute top-[2px] left-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-transform duration-200',
                  autoInjectContext ? 'translate-x-[14px]' : 'translate-x-0'
                )} />
              </button>
              <div>
                <p className="text-xs font-medium text-zinc-200 leading-snug">Auto inject relay context</p>
                <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">
                  When enabled, Relay automatically appends a compact JSON summary of the current
                  task — recent changes, commits, and status — to each message you send and on
                  session restart. This gives the agent continuity across prompts without you
                  having to repeat context manually.
                </p>
              </div>
            </div>
          </div>

          <div className="h-px bg-white/[0.05]" />

          {/* Claude launch options */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-200">Claude Launch Options</span>
            </div>

            <div className="flex items-start gap-3 px-3 py-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <button
                role="checkbox"
                aria-checked={skipPermissions}
                onClick={toggleSkipPermissions}
                className={cn(
                  'relative mt-0.5 w-8 h-[18px] rounded-full transition-colors duration-200 shrink-0 focus:outline-none',
                  skipPermissions ? 'bg-violet-500' : 'bg-zinc-700'
                )}
              >
                <span className={cn(
                  'absolute top-[2px] left-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-transform duration-200',
                  skipPermissions ? 'translate-x-[14px]' : 'translate-x-0'
                )} />
              </button>
              <div>
                <p className="text-xs font-medium text-zinc-200 leading-snug">Skip permissions bypass</p>
                <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">
                  Passes <span className="font-mono text-zinc-400">--dangerously-skip-permissions</span> when
                  launching Claude. Disable if you prefer Claude to ask for confirmation before
                  making file changes. Takes effect on the next session start or restart.
                </p>
              </div>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}
