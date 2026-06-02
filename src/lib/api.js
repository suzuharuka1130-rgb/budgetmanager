import { getClient } from './supabase'

function client() {
  const c = getClient()
  if (!c) throw new Error('Supabase の接続情報が設定されていません。')
  return c
}

// ---- 取得 ----
export async function fetchMonth(year, month) {
  const c = client()
  const [income, cards, others, balance] = await Promise.all([
    c.from('monthly_income').select('*').eq('year', year).eq('month', month).order('created_at'),
    c.from('card_expenses').select('*').eq('year', year).eq('month', month).order('created_at'),
    c.from('other_expenses').select('*').eq('year', year).eq('month', month).order('created_at'),
    c.from('account_balance').select('*').eq('year', year).eq('month', month).order('created_at', { ascending: false }).limit(1),
  ])
  for (const r of [income, cards, others, balance]) {
    if (r.error) throw r.error
  }
  return {
    income: income.data || [],
    cards: cards.data || [],
    others: others.data || [],
    balance: balance.data?.[0] || null,
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

// 利用可能な年の一覧（収入・支出から）
export async function fetchAvailableYears() {
  const c = client()
  const tables = ['monthly_income', 'card_expenses', 'other_expenses']
  const results = await Promise.all(tables.map((t) => c.from(t).select('year')))
  const years = new Set()
  for (const r of results) {
    if (r.error) throw r.error
    for (const row of r.data || []) years.add(row.year)
  }
  return [...years].sort((a, b) => b - a)
}

// ---- 追加 ----
export async function addIncome({ year, month, amount, note }) {
  const { error } = await client().from('monthly_income').insert({ year, month, amount, note })
  if (error) throw error
}

export async function addCardExpense({ year, month, card_type, amount, note }) {
  const { error } = await client().from('card_expenses').insert({ year, month, card_type, amount, note })
  if (error) throw error
}

export async function addOtherExpense({ year, month, type, amount, note }) {
  const { error } = await client().from('other_expenses').insert({ year, month, type, amount, note })
  if (error) throw error
}

export async function setAccountBalance({ year, month, balance }) {
  const { error } = await client().from('account_balance').insert({ year, month, balance })
  if (error) throw error
}
