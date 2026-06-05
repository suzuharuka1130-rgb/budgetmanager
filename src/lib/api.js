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

export async function addCardExpense({ year, month, card_type, amount, note }) {
  const confirmed = !isFutureMonth(year, month)
  const { error } = await client().from('card_expenses').insert({ year, month, card_type, amount, note, confirmed })
  if (error) throw error
}

export async function addOtherExpense({ year, month, type, amount, note }) {
  const confirmed = !isFutureMonth(year, month)
  const { error } = await client().from('other_expenses').insert({ year, month, type, amount, note, confirmed })
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
