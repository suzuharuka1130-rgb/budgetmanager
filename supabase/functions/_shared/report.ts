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

// 世帯の app_settings から値を取得（無ければ null）
export async function getHouseholdSetting(
  sb: SupabaseClient,
  hid: string,
  key: string,
): Promise<string | null> {
  const { data } = await sb
    .from('app_settings')
    .select('value')
    .eq('household_id', hid)
    .eq('key', key)
    .maybeSingle()
  return data?.value ?? null
}

async function monthSum(
  sb: SupabaseClient,
  table: string,
  hid: string,
  year: number,
  month: number,
  filter?: { col: string; val: string },
): Promise<number> {
  let q = sb.from(table).select('amount').eq('household_id', hid).eq('year', year).eq('month', month)
  if (filter) q = q.eq(filter.col, filter.val)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount || 0), 0)
}

// カードとその他支出タイプを report_group（ラベル）ごとにまとめる。
// 表示順は各グループ内の最小 display_order（カードを優先）。
async function getReportGroups(
  sb: SupabaseClient,
  hid: string,
): Promise<{ group: string; cardIds: string[]; typeIds: string[] }[]> {
  const [{ data: cards }, { data: types }] = await Promise.all([
    sb.from('cards').select('id, report_group, display_order').eq('household_id', hid),
    sb.from('other_expense_types').select('id, report_group, display_order').eq('household_id', hid),
  ])
  const map = new Map<string, { cardIds: string[]; typeIds: string[]; order: number }>()
  const ensure = (g: string, order: number) => {
    if (!map.has(g)) map.set(g, { cardIds: [], typeIds: [], order })
    else map.get(g)!.order = Math.min(map.get(g)!.order, order)
  }
  for (const c of cards ?? []) {
    const g = c.report_group || '未分類'
    ensure(g, c.display_order ?? 9999)
    map.get(g)!.cardIds.push(c.id)
  }
  for (const t of types ?? []) {
    const g = t.report_group || '娯楽費'
    ensure(g, (t.display_order ?? 9999) + 1000) // カードを優先表示
    map.get(g)!.typeIds.push(t.id)
  }
  return [...map.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([group, v]) => ({ group, cardIds: v.cardIds, typeIds: v.typeIds }))
}

// 指定タイプ群の その他支出 合計
async function otherTypeSum(
  sb: SupabaseClient,
  hid: string,
  year: number,
  month: number,
  typeIds: string[],
): Promise<number> {
  if (!typeIds.length) return 0
  const { data, error } = await sb
    .from('other_expenses')
    .select('amount')
    .eq('household_id', hid)
    .eq('year', year)
    .eq('month', month)
    .in('expense_type_id', typeIds)
  if (error) throw error
  return (data ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount || 0), 0)
}

async function cardSum(
  sb: SupabaseClient,
  hid: string,
  year: number,
  month: number,
  cardIds: string[],
): Promise<number> {
  if (!cardIds.length) return 0
  const { data, error } = await sb
    .from('card_expenses')
    .select('amount')
    .eq('household_id', hid)
    .eq('year', year)
    .eq('month', month)
    .in('card_id', cardIds)
  if (error) throw error
  return (data ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount || 0), 0)
}

// 手入力スナップショットを起点に (year, month) 末時点の口座残高を算出する。
// アプリの計算ロジックと同じく、確定済み明細のみを各月の純増減として積み上げる。
// スナップショットが無い／対象が最初のスナップショットより前の場合は null。
async function computeBalanceThrough(
  sb: SupabaseClient,
  hid: string,
  ty: number,
  tm: number,
): Promise<number | null> {
  const { data: snaps, error } = await sb.from('account_balance').select('*').eq('household_id', hid)
  if (error) throw error
  if (!snaps || !snaps.length) return null

  const sorted = [...snaps].sort((a, b) => a.year - b.year || a.month - b.month)
  const start = sorted[0]
  if (ty < start.year || (ty === start.year && tm < start.month)) return null

  const months: { year: number; month: number }[] = []
  let y = start.year
  let m = start.month
  while (y < ty || (y === ty && m <= tm)) {
    months.push({ year: y, month: m })
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }

  const snapMap = new Map<string, { balance: number; created_at?: string }>()
  for (const s of snaps) {
    const k = `${s.year}-${s.month}`
    const prev = snapMap.get(k)
    if (!prev || (s.created_at || '') >= (prev.created_at || '')) snapMap.set(k, s)
  }

  const years = [...new Set(months.map((mm) => mm.year))]
  const [inc, cards, others] = await Promise.all([
    sb.from('monthly_income').select('year,month,amount,confirmed').eq('household_id', hid).in('year', years),
    sb.from('card_expenses').select('year,month,amount,confirmed').eq('household_id', hid).in('year', years),
    sb.from('other_expenses').select('year,month,amount,confirmed').eq('household_id', hid).in('year', years),
  ])
  const net = new Map<string, number>()
  const addNet = (yy: number, mm: number, d: number) => {
    const k = `${yy}-${mm}`
    net.set(k, (net.get(k) || 0) + d)
  }
  for (const r of inc.data ?? []) if (r.confirmed !== false) addNet(r.year, r.month, Number(r.amount || 0))
  for (const r of cards.data ?? []) if (r.confirmed !== false) addNet(r.year, r.month, -Number(r.amount || 0))
  for (const r of others.data ?? []) if (r.confirmed !== false) addNet(r.year, r.month, -Number(r.amount || 0))

  let running: number | null = null
  for (const { year: yy, month: mm } of months) {
    const k = `${yy}-${mm}`
    if (snapMap.has(k)) running = Number(snapMap.get(k)!.balance)
    else if (running !== null) running += net.get(k) || 0
  }
  return running
}

/**
 * 月次レポートのメッセージを生成する。
 * 基準月（current）は JST の現在月。先月（last）は前月。
 */
export async function buildMonthlyReportMessage(sb: SupabaseClient, hid: string): Promise<string> {
  const cur = currentYearMonthJST()
  const last = prevMonth(cur.year, cur.month)

  // カード＋その他支出タイプを report_group ごとに集計
  const groups = await getReportGroups(sb, hid)

  // 各グループの合計 = グループ内カード + グループ内その他タイプ
  async function groupSums(year: number, month: number) {
    const out = []
    for (const g of groups) {
      const amt = (await cardSum(sb, hid, year, month, g.cardIds))
        + (await otherTypeSum(sb, hid, year, month, g.typeIds))
      out.push({ name: g.group, amt })
    }
    return out
  }

  // Section 1: 先月の収支サマリー
  const income = await monthSum(sb, 'monthly_income', hid, last.year, last.month)
  const sums1 = await groupSums(last.year, last.month)
  const totalExpense1 = sums1.reduce((s, x) => s + x.amt, 0)
  const net = income - totalExpense1

  // Section 2: 今月の引き落とし予定（先月利用額 = 今月の対象月で入力された金額）
  const sums2 = await groupSums(cur.year, cur.month)
  const total2 = sums2.reduce((s, x) => s + x.amt, 0)

  // 今月初の口座残高 = 先月末時点の残高
  const balance = await computeBalanceThrough(sb, hid, last.year, last.month)
  const balanceText = balance === null ? '未入力' : yen(balance)

  const lines = [
    `📊 [${cur.year}年${cur.month}月] 月次レポート`,
    DIVIDER,
    `【${last.month}月の収支】`,
    `➕ 入金合計：${yen(income)}`,
    ...sums1.map((g) => `➖ ${g.name}：${yen(g.amt)}`),
    `💸 支出合計：${yen(totalExpense1)}`,
    `✅ 収支：${yen(net)}`,
    '',
    `🏦 支払後口座残高：${balanceText}`,
    DIVIDER,
    `【${cur.month}月引き落とし予定】`,
    ...sums2.map((g) => `➖ ${g.name}：${yen(g.amt)}`),
    `💳 支出合計：${yen(total2)}`,
  ]
  return lines.join('\n')
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
