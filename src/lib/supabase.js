import { createClient } from '@supabase/supabase-js'

const URL_KEY = 'budget_supabase_url'
const ANON_KEY = 'budget_supabase_anon_key'

// ビルド時に埋め込まれる環境変数（Vercel 等で設定）。設定済みなら全端末で優先利用される。
const ENV_URL = import.meta.env.VITE_SUPABASE_URL || ''
const ENV_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export function getCredentials() {
  return {
    url: ENV_URL || localStorage.getItem(URL_KEY) || '',
    anonKey: ENV_ANON_KEY || localStorage.getItem(ANON_KEY) || '',
  }
}

// 環境変数で接続情報が用意されているか（設定画面の表示制御などに使用）
export function hasEnvCredentials() {
  return Boolean(ENV_URL && ENV_ANON_KEY)
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

// send-line-message Edge Function を呼び出してLINEへ送信
export async function sendLineMessage(message) {
  const c = getClient()
  if (!c) throw new Error('Supabase の接続情報が設定されていません。')
  const { data, error } = await c.functions.invoke('send-line-message', {
    body: { message },
  })
  if (error) throw error
  if (data && data.success === false) {
    throw new Error('LINE送信に失敗しました（チャネルトークン/ユーザーIDをご確認ください）。')
  }
  return data
}

// monthly-report Edge Function を呼び出し、AI分析を含む月次レポートを生成・送信する（テスト送信用）
export async function sendMonthlyReport() {
  const c = getClient()
  if (!c) throw new Error('Supabase の接続情報が設定されていません。')
  const { data, error } = await c.functions.invoke('monthly-report', { body: { test: true } })
  if (error) throw error
  if (data && data.success === false) {
    throw new Error('LINE送信に失敗しました（チャネルトークン/ユーザーIDをご確認ください）。')
  }
  return data
}

// daily-backup Edge Function を手動起動し、Google Drive へバックアップする
export async function runDailyBackup() {
  const c = getClient()
  if (!c) throw new Error('Supabase の接続情報が設定されていません。')
  const { data, error } = await c.functions.invoke('daily-backup', { body: { manual: true } })
  if (error) throw error
  if (data && data.success === false) {
    throw new Error(data.error || 'バックアップに失敗しました。')
  }
  return data // { success, filename, file_size }
}

// analyze-receipt Edge Function を呼び出し、画像から明細を抽出する。
// 返り値: { amount, total, note, transactions: [{ name, amount, date }] }
// （amount は total と同値の後方互換キー）
export async function analyzeReceipt(base64Image, mimeType) {
  const c = getClient()
  if (!c) throw new Error('Supabase の接続情報が設定されていません。')
  const { data, error } = await c.functions.invoke('analyze-receipt', {
    body: { image: base64Image, mimeType },
  })
  if (error) throw error
  if (!data || typeof data.amount === 'undefined') {
    throw new Error(data?.error || 'AI読み取りに失敗しました。')
  }
  return data
}

// ログイン状態の変化を購読。解除用の関数を返す。
export function onAuthChange(callback) {
  const c = getClient()
  if (!c) return () => {}
  const { data } = c.auth.onAuthStateChange((_event, session) => callback(session))
  return () => data.subscription.unsubscribe()
}
