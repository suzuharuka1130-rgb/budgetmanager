import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { fetchCards, fetchOtherExpenseTypes, fetchAppSettings } from './api'

const DEFAULT_TITLE = 'Haruka ChiChan Kakeibo'

const MetaContext = createContext(null)

// カード・その他支出タイプ・アプリ設定をまとめて読み込み、アプリ全体へ提供する。
export function MetaProvider({ children }) {
  const [cards, setCards] = useState([])
  const [otherTypes, setOtherTypes] = useState([])
  const [appTitle, setAppTitle] = useState(DEFAULT_TITLE)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [c, t, s] = await Promise.all([
        fetchCards(),
        fetchOtherExpenseTypes(),
        fetchAppSettings(),
      ])
      setCards(c)
      setOtherTypes(t)
      setAppTitle(s.app_title || DEFAULT_TITLE)
    } catch {
      // 取得失敗時は既定値のまま（アプリは動作継続）
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const value = useMemo(() => {
    const cardsById = Object.fromEntries(cards.map((c) => [c.id, c]))
    const typesById = Object.fromEntries(otherTypes.map((t) => [t.id, t]))
    return {
      cards,
      otherTypes,
      activeCards: cards.filter((c) => c.is_active),
      activeOtherTypes: otherTypes.filter((t) => t.is_active),
      cardsById,
      typesById,
      cardName: (id) => cardsById[id]?.name || '不明なカード',
      cardColor: (id) => cardsById[id]?.color || '#6b7280',
      typeName: (id) => typesById[id]?.name || 'その他',
      typeColor: (id) => typesById[id]?.color || '#6b7280',
      appTitle,
      loading,
      refresh,
    }
  }, [cards, otherTypes, appTitle, loading, refresh])

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>
}

export function useMeta() {
  const ctx = useContext(MetaContext)
  if (!ctx) throw new Error('useMeta must be used within MetaProvider')
  return ctx
}
