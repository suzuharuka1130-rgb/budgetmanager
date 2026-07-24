import { cva } from 'class-variance-authority'
import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'

// shadcn 風の Button（cva バリアント + framer-motion のタップアニメーション）
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 disabled:opacity-50 disabled:pointer-events-none select-none',
  {
    variants: {
      variant: {
        default: 'bg-[color:var(--primary)] text-[color:var(--on-primary)] hover:bg-[color:var(--primary-dark)]',
        outline: 'border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text)] hover:bg-[color:var(--block)]',
        danger: 'bg-[color:var(--danger)] text-white hover:bg-[color:var(--danger-hover)]',
        ghost: 'text-[color:var(--text)] hover:bg-[color:var(--block)]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-[13px]',
        lg: 'h-11 px-6',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export function Button({ className, variant, size, ...props }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
