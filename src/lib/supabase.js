import { createClient } from '@supabase/supabase-js'

const URL_KEY = 'budget_supabase_url'
const ANON_KEY = 'budget_supabase_anon_key'

export function getCredentials() {
  return {
    url: localStorage.getItem(URL_KEY) || '',
    anonKey: localStorage.getItem(ANON_KEY) || '',
  }
}

export function saveCredentials(url, anonKey) {
  localStorage.setItem(URL_KEY, url.trim())
  localStorage.setItem(ANON_KEY, anonKey.trim())
  client = null // force re-create on next access
}

export function hasCredentials() {
  const { url, anonKey } = getCredentials()
  return Boolean(url && anonKey)
}

let client = null

export function getClient() {
  if (!hasCredentials()) return null
  if (!client) {
    const { url, anonKey } = getCredentials()
    client = createClient(url, anonKey)
  }
  return client
}

// ---- 認証（Supabase Auth）----
export async function getSession() {
  const c = getClient()
  if (!c) return null
  const { data } = await c.auth.getSession()
  return data.session
}

export async function signIn(email, password) {
  const c = getClient()
  if (!c) throw new Error('Supabase の接続情報が設定されていません。')
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signOut() {
  const c = getClient()
  if (!c) return
  await c.auth.signOut()
}

// ログイン状態の変化を購読。解除用の関数を返す。
export function onAuthChange(callback) {
  const c = getClient()
  if (!c) return () => {}
  const { data } = c.auth.onAuthStateChange((_event, session) => callback(session))
  return () => data.subscription.unsubscribe()
}
