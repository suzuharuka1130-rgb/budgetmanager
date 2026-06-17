import { getClient } from './supabase'
import { monthsInRange, netByMonthMap, buildBalanceSeries, isFutureMonth } from './helpers'

function client() {
  const c = getClient()
  if (!c) throw new Error('Supabase の接続情報が設定されていません。')
  return c
}

// ---- 取得 ----
export async function fetchMonth(year, month) {
  const c = client()
  const [income, cards, others, allBalances] = await Promise.all([
    c.from('monthly_income').select('*').eq('year', year).eq('month', month).order('created_at'),
    c.from('card_expenses').select('*').eq('year', year).eq('month', month).order('created_at'),
    c.from('other_expenses').select('*').eq('year', year).eq('month', month).order('created_at'),
    c.from('account_balance').select('*'),
  ])
  for (const r of [income, cards, others, allBalances]) {
    if (r.error) throw r.error
  }

  const balance = await computeBalanceAt(c, year, month, allBalances.data || [])

  return {
    income: income.data || [],
    cards: cards.data || [],
    others: others.data || [],
    balance,
  }
}

// (year, month) 時点の口座残高を、手入力スナップショット + 各月の純増減から算出する。
// 当月にスナップショットがあればそれを実測値として採用。無ければ最後の
// スナップショットを起点に、それ以降の月の純増減（入金 − 支出）を積み上げる。
async function computeBalanceAt(c, year, month, snapshots) {
  if (!snapshots.length) return null

  const sorted = [...snapshots].sort((a, b) => a.year - b.year || a.month - b.month)
  const start = sorted[0]
  const months = monthsInRange(start.year, start.month, year, month)
  if (!months.length) return null

  const yearsNeeded = [...new Set(months.map((m) => m.year))]
  const [income, cards, others] = await Promise.all([
    c.from('monthly_income').select('year,month,amount,confirmed').in('year', yearsNeeded),
    c.from('card_expenses').select('year,month,amount,confirmed').in('year', yearsNeeded),
    c.from('other_expenses').select('year,month,amount,confirmed').in('year', yearsNeeded),
  ])
  for (const r of [income, cards, others]) {
    if (r.error) throw r.error
  }

  const netByKey = netByMonthMap(income.data || [], cards.data || [], others.data || [])
  const series = buildBalanceSeries(months, snapshots, netByKey)
  const target = series[series.length - 1]
  if (!target || target.balance === null) return null

  const hasOwnSnapshot = snapshots.some((s) => s.year === year && s.month === month)
  const anchor = [...snapshots]
    .filter((s) => s.year < year || (s.year === year && s.month <= month))
    .sort((a, b) => b.year - a.year || b.month - a.month)[0] || null

  return {
    balance: target.balance,
    computed: !hasOwnSnapshot,
    anchorYear: anchor ? anchor.year : null,
    anchorMonth: anchor ? anchor.month : null,
  }
}

export async function fetchYear(year) {
  const c = client()
  const [income, cards, others] = await Promise.all([
    c.from('monthly_income').select('*').eq('year', year),
    c.from('card_expenses').select('*').eq('year', year),
    c.from('other_expenses').select('*').eq('year', year),
  ])
  for (const r of [income, cards, others]) {
    if (r.error) throw r.error
  }
  return {
    income: income.data || [],
    cards: cards.data || [],
    others: others.data || [],
  }
}

// 過去n ヶ月分（範囲をまたぐ年も含めて取得し、クライアント側でフィルタ）
export async function fetchRange(months) {
  const c = client()
  const years = [...new Set(months.map((m) => m.year))]
  const [income, cards, others, balance] = await Promise.all([
    c.from('monthly_income').select('*').in('year', years),
    c.from('card_expenses').select('*').in('year', years),
    c.from('other_expenses').select('*').in('year', years),
    c.from('account_balance').select('*').in('year', years),
  ])
  for (const r of [income, cards, others, balance]) {
    if (r.error) throw r.error
  }
  return {
    income: income.data || [],
    cards: cards.data || [],
    others: others.data || [],
    balance: balance.data || [],
  }
}

// 利用可能な年の一覧（入金・支出から）
export async function fetchAvailableYears() {
  const c = client()
  const tables = ['monthly_income', 'card_expenses', 'other_expenses', 'account_balance']
  const results = await Promise.all(tables.map((t) => c.from(t).select('year')))
  const years = new Set()
  for (const r of results) {
    if (r.error) throw r.error
    for (const row of r.data || []) years.add(row.year)
  }
  return [...years].sort((a, b) => b - a)
}

// ---- 追加 ----
// 未来月の入力は confirmed=false（確定待ち）。当月・過去月は確定済み。
export async function addIncome({ year, month, amount, note }) {
  const confirmed = !isFutureMonth(year, month)
  const { error } = await client().from('monthly_income').insert({ year, month, amount, note, confirmed })
  if (error) throw error
}

export async function addCardExpense({ year, month, card_id, amount, note, receipt_image_url = null }) {
  const confirmed = !isFutureMonth(year, month)
  const { error } = await client()
    .from('card_expenses')
    .insert({ year, month, card_id, amount, note, confirmed, receipt_image_url })
  if (error) throw error
}

// ---- レシート画像（Supabase Storage: receipts バケット）----
const RECEIPTS_BUCKET = 'receipts'

// 画像をアップロードし、保存パスを返す
export async function uploadReceipt(file, { year, month, card_id }) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${year}-${month}-${card_id}-${Date.now()}.${ext}`
  const { error } = await client().storage.from(RECEIPTS_BUCKET).upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  })
  if (error) throw error
  return path
}

// 非公開バケットの画像を表示するための署名付きURL（既定60秒）
export async function getReceiptSignedUrl(path, expiresIn = 60) {
  const { data, error } = await client().storage.from(RECEIPTS_BUCKET).createSignedUrl(path, expiresIn)
  if (error) throw error
  return data.signedUrl
}

export async function addOtherExpense({ year, month, expense_type_id, amount, note }) {
  const confirmed = !isFutureMonth(year, month)
  const { error } = await client()
    .from('other_expenses')
    .insert({ year, month, expense_type_id, amount, note, confirmed })
  if (error) throw error
}

export async function setAccountBalance({ year, month, balance }) {
  const { error } = await client().from('account_balance').insert({ year, month, balance })
  if (error) throw error
}

export async function deleteIncome(id) {
  const { error } = await client().from('monthly_income').delete().eq('id', id)
  if (error) throw error
}

export async function deleteCardExpense(id) {
  const { error } = await client().from('card_expenses').delete().eq('id', id)
  if (error) throw error
}

export async function deleteOtherExpense(id) {
  const { error } = await client().from('other_expenses').delete().eq('id', id)
  if (error) throw error
}

// ---- 確定（未来月入力の確定待ちを口座残高に反映させる）----
export async function confirmIncome(id) {
  const { error } = await client().from('monthly_income').update({ confirmed: true }).eq('id', id)
  if (error) throw error
}

export async function confirmCardExpense(id) {
  const { error } = await client().from('card_expenses').update({ confirmed: true }).eq('id', id)
  if (error) throw error
}

export async function confirmOtherExpense(id) {
  const { error } = await client().from('other_expenses').update({ confirmed: true }).eq('id', id)
  if (error) throw error
}

// ---- カード / その他支出タイプ（マスタ）----
export async function fetchCards() {
  const { data, error } = await client().from('cards').select('*').order('display_order')
  if (error) throw error
  return data || []
}

export async function fetchOtherExpenseTypes() {
  const { data, error } = await client().from('other_expense_types').select('*').order('display_order')
  if (error) throw error
  return data || []
}

async function nextOrder(table) {
  const { data } = await client().from(table).select('display_order').order('display_order', { ascending: false }).limit(1)
  return ((data && data[0]?.display_order) || 0) + 1
}

export async function addCard({ name, color, report_group }) {
  const display_order = await nextOrder('cards')
  const row = { name, color, display_order }
  if (report_group) row.report_group = report_group
  const { error } = await client().from('cards').insert(row)
  if (error) throw error
}
export async function updateCard(id, { name, color, report_group }) {
  const patch = { name, color }
  if (report_group) patch.report_group = report_group
  const { error } = await client().from('cards').update(patch).eq('id', id)
  if (error) throw error
}
export async function deactivateCard(id) {
  const { error } = await client().from('cards').update({ is_active: false }).eq('id', id)
  if (error) throw error
}
export async function setCardOrder(id, display_order) {
  const { error } = await client().from('cards').update({ display_order }).eq('id', id)
  if (error) throw error
}

export async function addOtherExpenseType({ name, color }) {
  const display_order = await nextOrder('other_expense_types')
  const { error } = await client().from('other_expense_types').insert({ name, color, display_order })
  if (error) throw error
}
export async function updateOtherExpenseType(id, { name, color }) {
  const { error } = await client().from('other_expense_types').update({ name, color }).eq('id', id)
  if (error) throw error
}
export async function deactivateOtherExpenseType(id) {
  const { error } = await client().from('other_expense_types').update({ is_active: false }).eq('id', id)
  if (error) throw error
}
export async function setOtherExpenseTypeOrder(id, display_order) {
  const { error } = await client().from('other_expense_types').update({ display_order }).eq('id', id)
  if (error) throw error
}

// ---- アプリ設定 ----
export async function fetchAppSettings() {
  const { data, error } = await client().from('app_settings').select('*')
  if (error) throw error
  const map = {}
  for (const row of data || []) map[row.key] = row.value
  return map
}
export async function setAppSetting(key, value) {
  const { error } = await client().from('app_settings').upsert({ key, value }, { onConflict: 'key' })
  if (error) throw error
}

// ---- 通知設定 ----
export async function fetchNotificationPreferences(userId) {
  const c = client()
  const { data, error } = await c
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function upsertNotificationPreferences(userId, prefs) {
  const c = client()
  const { error } = await c
    .from('notification_preferences')
    .upsert({
      user_id: userId,
      monthly_report: prefs.monthly_report,
      monthly_reminder: prefs.monthly_reminder,
      credit_input_reminder: prefs.credit_input_reminder,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  if (error) throw error
}
