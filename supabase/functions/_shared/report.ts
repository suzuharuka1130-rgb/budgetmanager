// 月次レポートのデータ取得とメッセージ整形（Edge Function 用 / Deno）。
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const DIVIDER = '━━━━━━━━━━━━━━'

function yen(n: number): string {
  return '¥' + Math.round(n || 0).toLocaleString('en-US')
}

// 現在時刻を JST に変換した {year, month} を返す
export function currentYearMonthJST(): { year: number; month: number } {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1 }
}

function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です。')
  return createClient(url, key)
}

async function monthSum(
  sb: SupabaseClient,
  table: string,
  year: number,
  month: number,
  filter?: { col: string; val: string },
): Promise<number> {
  let q = sb.from(table).select('amount').eq('year', year).eq('month', month)
  if (filter) q = q.eq(filter.col, filter.val)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount || 0), 0)
}

/**
 * 月次レポートのメッセージを生成する。
 * 基準月（current）は JST の現在月。先月（last）は前月。
 */
export async function buildMonthlyReportMessage(sb: SupabaseClient): Promise<string> {
  const cur = currentYearMonthJST()
  const last = prevMonth(cur.year, cur.month)

  // Section 1: 先月の収支サマリー
  const income = await monthSum(sb, 'monthly_income', last.year, last.month)
  const f1 = await monthSum(sb, 'card_expenses', last.year, last.month, { col: 'card_type', val: 'fixed' })
  const d1 = await monthSum(sb, 'card_expenses', last.year, last.month, { col: 'card_type', val: 'daily' })
  const o1 = await monthSum(sb, 'card_expenses', last.year, last.month, { col: 'card_type', val: 'other' })
  const other1 = await monthSum(sb, 'other_expenses', last.year, last.month)
  const net = income - (f1 + d1 + o1 + other1)

  // Section 2: 今月の引き落とし予定（先月利用額 = 今月の対象月で入力された金額）
  const f2 = await monthSum(sb, 'card_expenses', cur.year, cur.month, { col: 'card_type', val: 'fixed' })
  const d2 = await monthSum(sb, 'card_expenses', cur.year, cur.month, { col: 'card_type', val: 'daily' })
  const o2 = await monthSum(sb, 'card_expenses', cur.year, cur.month, { col: 'card_type', val: 'other' })
  const total2 = f2 + d2 + o2

  return [
    `📊 [${cur.year}年${cur.month}月] 月次レポート`,
    DIVIDER,
    '【先月の収支】',
    `💰 入金合計：${yen(income)}`,
    `🏠 Starts：${yen(f1)}`,
    `🛒 Olive (生活費)：${yen(d1)}`,
    `🛍️ Rakuten (変動費)：${yen(o1)}`,
    `📦 その他：${yen(other1)}`,
    `✅ 収支：${yen(net)}`,
    DIVIDER,
    '【先月利用額 (今月引き落とし予定)】',
    `🏠 固定費：${yen(f2)}`,
    `🛒 生活費：${yen(d2)}`,
    `🛍️ 変動費：${yen(o2)}`,
    `💳 引き落とし合計：${yen(total2)}`,
  ].join('\n')
}

// 月末判定（JST）
export function isLastDayOfMonthJST(): boolean {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const y = jst.getUTCFullYear()
  const m = jst.getUTCMonth()
  const d = jst.getUTCDate()
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return d === lastDay
}
