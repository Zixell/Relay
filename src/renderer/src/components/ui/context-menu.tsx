import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'

export interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  variant?: 'default' | 'danger'
  onClick: () => void
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Adjust position so the menu doesn't overflow the viewport
  const adjustedX = Math.min(x, window.innerWidth - 180)
  const adjustedY = Math.min(y, window.innerHeight - items.length * 36 - 16)

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Use capture so we get the event before anything else
    document.addEventListener('mousedown', handleDown, true)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleDown, true)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] rounded-lg border border-white/[0.08] bg-[#1a1a1a] shadow-xl py-1 animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ left: adjustedX, top: adjustedY }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          className={cn(
            'flex items-center gap-2.5 w-full px-3 py-2 text-xs transition-colors text-left',
            item.variant === 'danger'
              ? 'text-red-400 hover:bg-red-400/10'
              : 'text-zinc-300 hover:bg-white/[0.06]'
          )}
          onClick={() => {
            item.onClick()
            onClose()
          }}
        >
          {item.icon && <span className="w-3.5 h-3.5 shrink-0">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  )
}

export interface ContextMenuState {
  x: number
  y: number
}
