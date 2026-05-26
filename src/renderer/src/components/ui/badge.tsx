import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-zinc-800 text-zinc-300',
        running: 'bg-emerald-400/10 text-emerald-400',
        waiting: 'bg-amber-400/10 text-amber-400',
        completed: 'bg-blue-400/10 text-blue-400',
        failed: 'bg-red-400/10 text-red-400',
        paused: 'bg-zinc-700/50 text-zinc-400',
        pending: 'bg-zinc-700/50 text-zinc-400'
      }
    },
    defaultVariants: { variant: 'default' }
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
