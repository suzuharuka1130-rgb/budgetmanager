import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// shadcn 標準のクラス結合ユーティリティ
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
