import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-40 select-none',
  {
    variants: {
      variant: {
        default: 'bg-white text-zinc-950 hover:bg-zinc-100 shadow-sm',
        primary: 'bg-blue-600 text-white hover:bg-blue-500 shadow-sm shadow-blue-500/20',
        ghost: 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5',
        outline:
          'border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07] hover:text-white',
        destructive: 'bg-red-600/20 text-red-400 border border-red-500/20 hover:bg-red-600/30',
        link: 'text-zinc-400 hover:text-white underline-offset-4 hover:underline p-0 h-auto'
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        default: 'h-9 px-4',
        lg: 'h-10 px-6',
        icon: 'h-8 w-8 p-0'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
