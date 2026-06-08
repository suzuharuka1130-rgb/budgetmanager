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

// 手入力スナップショットを起点に (year, month) 末時点の口座残高を算出する。
// アプリの計算ロジックと同じく、確定済み明細のみを各月の純増減として積み上げる。
// スナップショットが無い／対象が最初のスナップショットより前の場合は null。
async function computeBalanceThrough(
  sb: SupabaseClient,
  ty: number,
  tm: number,
): Promise<number | null> {
  const { data: snaps, error } = await sb.from('account_balance').select('*')
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
    sb.from('monthly_income').select('year,month,amount,confirmed').in('year', years),
    sb.from('card_expenses').select('year,month,amount,confirmed').in('year', years),
    sb.from('other_expenses').select('year,month,amount,confirmed').in('year', years),
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
export async function buildMonthlyReportMessage(
  sb: SupabaseClient,
): Promise<{ message: string; aiError: string | null }> {
  const cur = currentYearMonthJST()
  const last = prevMonth(cur.year, cur.month)

  // Section 1: 先月の収支サマリー
  const income = await monthSum(sb, 'monthly_income', last.year, last.month)
  const f1 = await monthSum(sb, 'card_expenses', last.year, last.month, { col: 'card_type', val: 'fixed' })
  const d1 = await monthSum(sb, 'card_expenses', last.year, last.month, { col: 'card_type', val: 'daily' })
  const o1 = await monthSum(sb, 'card_expenses', last.year, last.month, { col: 'card_type', val: 'other' })
  const other1 = await monthSum(sb, 'other_expenses', last.year, last.month)
  // 家賃＆生活費 = Starts + Olive、娯楽費 = Rakuten + その他
  const housing1 = f1 + d1
  const leisure1 = o1 + other1
  const totalExpense1 = housing1 + leisure1
  const net = income - totalExpense1

  // Section 2: 今月の引き落とし予定（先月利用額 = 今月の対象月で入力された金額）
  const f2 = await monthSum(sb, 'card_expenses', cur.year, cur.month, { col: 'card_type', val: 'fixed' })
  const d2 = await monthSum(sb, 'card_expenses', cur.year, cur.month, { col: 'card_type', val: 'daily' })
  const o2 = await monthSum(sb, 'card_expenses', cur.year, cur.month, { col: 'card_type', val: 'other' })
  const other2 = await monthSum(sb, 'other_expenses', cur.year, cur.month)
  const housing2 = f2 + d2
  const leisure2 = o2 + other2
  const total2 = housing2 + leisure2

  // 今月初の口座残高 = 先月末時点の残高
  const balance = await computeBalanceThrough(sb, last.year, last.month)
  const balanceText = balance === null ? '未入力' : yen(balance)

  const baseLines = [
    `📊 [${cur.year}年${cur.month}月] 月次レポート`,
    DIVIDER,
    `【${last.month}月の収支】`,
    `➕ 入金合計：${yen(income)}`,
    `➖ 家賃＆生活費：${yen(housing1)}`,
    `➖ 娯楽費：${yen(leisure1)}`,
    `💸 支出合計：${yen(totalExpense1)}`,
    `✅ 収支：${yen(net)}`,
    '',
    `🏦 支払後口座残高：${balanceText}`,
    DIVIDER,
    `【${cur.month}月引き落とし予定】`,
    `🏠 家賃＆生活費：${yen(housing2)}`,
    `🛍️ 娯楽費：${yen(leisure2)}`,
    `💳 引き落とし合計：${yen(total2)}`,
  ]

  // AI分析（Gemini）。失敗時は黙ってスキップし、レポート送信は止めない。
  const ai = await getGeminiAnalysis({
    income, housing1, leisure1, totalExpense1, net, housing2, leisure2, total2,
  })
  const lines = [...baseLines]
  if (ai.text) {
    lines.push(DIVIDER, '【AI分析】', ai.text)
  }

  return { message: lines.join('\n'), aiError: ai.error }
}

// Gemini API で支出分析コメントを生成する。失敗時は { text:null, error } を返す。
async function getGeminiAnalysis(d: {
  income: number; housing1: number; leisure1: number
  totalExpense1: number; net: number; housing2: number; leisure2: number; total2: number
}): Promise<{ text: string | null; error: string | null }> {
  try {
    const key = Deno.env.get('GEMINI_API_KEY')
    if (!key) return { text: null, error: 'GEMINI_API_KEY 未設定' }

    const prompt = `以下は夫婦の家計データです。日本語で3〜4文の簡潔な支出分析コメントを書いてください。
先月の収支の分析、前の月との比較、今月の引き落とし予定額の分析結果をバランスよく含めてください。数字は¥形式で表記してください。

先月の収支：
- 入金合計：${yen(d.income)}
- 家賃＆生活費：${yen(d.housing1)}
- 娯楽費：${yen(d.leisure1)}
- 支出合計：${yen(d.totalExpense1)}
- 収支：${yen(d.net)}

今月の引き落とし予定（先月利用分）：
- 家賃＆生活費：${yen(d.housing2)}
- 娯楽費：${yen(d.leisure2)}
- 合計：${yen(d.total2)}`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 400,
            // gemini-2.5系は既定で「思考」に出力トークンを消費するため無効化する
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    )
    if (!res.ok) {
      return { text: null, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 600)}` }
    }
    const json = await res.json()
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof text === 'string' && text.trim()) return { text: text.trim(), error: null }
    return { text: null, error: 'テキストなし: ' + JSON.stringify(json).slice(0, 400) }
  } catch (e) {
    return { text: null, error: String((e as Error)?.message ?? e) }
  }
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
