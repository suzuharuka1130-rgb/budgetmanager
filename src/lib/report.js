// 月次レポートのメッセージ生成（フロント用）。
// Edge Function の monthly-report と同じ書式で、設定画面のテスト送信に使用する。
import { getClient } from './supabase'
import { formatYen, currentYearMonth } from './helpers'

const DIVIDER = '━━━━━━━━━━━━━━'

function prevMonth(year, month) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

async function monthSum(table, year, month, filter) {
  const c = getClient()
  if (!c) throw new Error('Supabase の接続情報が設定されていません。')
  let q = c.from(table).select('amount').eq('year', year).eq('month', month)
  if (filter) q = q.eq(filter.col, filter.val)
  const { data, error } = await q
  if (error) throw error
  return (data || []).reduce((s, r) => s + Number(r.amount || 0), 0)
}

// 先月の収支 + 今月の引き落とし予定 を整形した文字列を返す
export async function buildMonthlyReportMessage() {
  const cur = currentYearMonth()
  const last = prevMonth(cur.year, cur.month)

  // Section 1: 先月の収支
  const income = await monthSum('monthly_income', last.year, last.month)
  const f1 = await monthSum('card_expenses', last.year, last.month, { col: 'card_type', val: 'fixed' })
  const d1 = await monthSum('card_expenses', last.year, last.month, { col: 'card_type', val: 'daily' })
  const o1 = await monthSum('card_expenses', last.year, last.month, { col: 'card_type', val: 'other' })
  const other1 = await monthSum('other_expenses', last.year, last.month)
  const net = income - (f1 + d1 + o1 + other1)

  // Section 2: 今月の引き落とし予定
  const f2 = await monthSum('card_expenses', cur.year, cur.month, { col: 'card_type', val: 'fixed' })
  const d2 = await monthSum('card_expenses', cur.year, cur.month, { col: 'card_type', val: 'daily' })
  const o2 = await monthSum('card_expenses', cur.year, cur.month, { col: 'card_type', val: 'other' })
  const total2 = f2 + d2 + o2

  return [
    `📊 [${cur.year}年${cur.month}月] 月次レポート`,
    DIVIDER,
    '【先月の収支】',
    `💰 入金合計：${formatYen(income)}`,
    `🏠 Starts：${formatYen(f1)}`,
    `🛒 Olive (生活費)：${formatYen(d1)}`,
    `🛍️ Rakuten (変動費)：${formatYen(o1)}`,
    `📦 その他：${formatYen(other1)}`,
    `✅ 収支：${formatYen(net)}`,
    DIVIDER,
    '【先月利用額 (今月引き落とし予定)】',
    `🏠 固定費：${formatYen(f2)}`,
    `🛒 生活費：${formatYen(d2)}`,
    `🛍️ 変動費：${formatYen(o2)}`,
    `💳 引き落とし合計：${formatYen(total2)}`,
  ].join('\n')
}
