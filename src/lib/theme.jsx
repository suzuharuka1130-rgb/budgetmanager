import { createContext, useContext, useEffect, useState, useCallback } from 'react'

// 表示モード（light / dark / auto）を localStorage で保持し、
// <html data-theme="light|dark" style="color-scheme: …"> を書き換える。
// auto の場合は OS の prefers-color-scheme に追従する。
const STORAGE_KEY = 'budget_theme'
const VALID = ['light', 'dark', 'auto']

export function getStoredTheme() {
  if (typeof window === 'undefined') return 'auto'
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return VALID.includes(v) ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function setStoredTheme(mode) {
  if (typeof window === 'undefined') return
  try {
    if (VALID.includes(mode)) window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}

export function resolveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export function applyTheme(resolved) {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  html.setAttribute('data-theme', resolved)
  html.style.colorScheme = resolved
}

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => getStoredTheme())
  const [resolved, setResolved] = useState(() => resolveTheme(getStoredTheme()))

  useEffect(() => {
    const r = resolveTheme(theme)
    setResolved(r)
    applyTheme(r)
  }, [theme])

  useEffect(() => {
    if (theme !== 'auto') return
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const r = mq.matches ? 'dark' : 'light'
      setResolved(r)
      applyTheme(r)
    }
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else mq.addListener(onChange)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange)
      else mq.removeListener(onChange)
    }
  }, [theme])

  const setTheme = useCallback((mode) => {
    if (!VALID.includes(mode)) return
    setStoredTheme(mode)
    setThemeState(mode)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolved }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
