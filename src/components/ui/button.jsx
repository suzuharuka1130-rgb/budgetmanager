import { cva } from 'class-variance-authority'
import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'

// shadcn 風の Button（cva バリアント + framer-motion のタップアニメーション）
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#166534]/40 disabled:opacity-50 disabled:pointer-events-none select-none',
  {
    variants: {
      variant: {
        default: 'bg-[#166534] text-white hover:bg-[#0f4d28]',
        outline: 'border border-[#deded8] bg-white text-[#37352f] hover:bg-[#eeeeeb]',
        danger: 'bg-[#dc2626] text-white hover:bg-[#b91c1c]',
        ghost: 'text-[#37352f] hover:bg-[#eeeeeb]',
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
