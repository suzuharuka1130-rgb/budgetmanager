import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { getClient } from './supabase'

const HouseholdContext = createContext(null)

// ログインユーザーの世帯ID・メンバー一覧をアプリ全体へ提供する。
export function HouseholdProvider({ children }) {
  const [householdId, setHouseholdId] = useState(undefined) // undefined=未取得, null=未所属, string=ID
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const c = getClient()
    if (!c) {
      setHouseholdId(undefined)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data: hid, error } = await c.rpc('get_my_household_id')
      if (error) throw error
      setHouseholdId(hid || null)
      if (hid) {
        const { data: mem } = await c.from('household_members').select('*').order('created_at')
        setMembers(mem || [])
      } else {
        setMembers([])
      }
    } catch {
      setHouseholdId(null)
      setMembers([])
    } finally {
      setLoading(false)
    }
  }, [])

  const value = useMemo(
    () => ({ householdId, members, loading, refresh, hasHousehold: !!householdId }),
    [householdId, members, loading, refresh],
  )
  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext)
  if (!ctx) throw new Error('useHousehold must be used within HouseholdProvider')
  return ctx
}
