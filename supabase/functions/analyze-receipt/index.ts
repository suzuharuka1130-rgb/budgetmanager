// レシート/明細画像を Gemini Vision で解析し { amount, total, note, transactions } を返す。
// transactions は個別取引の配列 [{ name, amount, day, month, year }]（amount=total は後方互換キー）。
// day は日にちのみ（1〜31）。month/year は画面に実際に表示されている場合のみ埋める（読み取れなければ空文字）。
// month/year が空の取引は、アプリ側で対象月と日にちの並び順から実際の購入月を推定する。
// Body: { "image": "<base64>", "mimeType"?: "image/jpeg" | "image/png" }
// ブラウザ（カード支出フォーム）から呼ばれるため CORS 対応 + JWT 手動検証。
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getPublishableKey } from '../_shared/keys.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

// 注: gemini-2.0-flash はこのアカウントの無料枠が limit:0 のため、
// 無料枠で利用できる gemini-2.5-flash を使用する（Vision対応）。
const MODEL = 'gemini-2.5-flash'

const PROMPT = `この画像はクレジットカードの利用明細または取引画面です。
以下の情報をJSON形式のみで出力してください。説明文やコードフェンスは不要です。

{
  "total": 合計金額を数値のみで（カンマや円記号なし）,
  "note": "下記ルールに従った簡潔なメモ（該当しなければ空文字）",
  "transactions": [
    { "name": "利用先または内容", "amount": 金額を数値のみで, "day": "日にちのみを1〜31の数値で", "month": "月（1〜12）。画面に表示されている場合のみ", "year": "西暦4桁。画面に表示されている場合のみ" }
  ]
}

【transactionsのルール】
- 画像から読み取れる個別の利用明細を、1件ずつ配列に列挙してください。
- name は利用先・店舗名・内容を簡潔に。読み取れない場合は空文字（""）。
- amount は各利用の金額を数値のみで（カンマや円記号なし）。
- day は各取引の「日にち」のみを1〜31の数値で（例: 26日なら26）。日にちが読み取れない場合は空文字（""）にしてください。
- month と year は、日付見出しや各行の日付表示など画面に実際に月・年の情報がある場合のみ埋めてください。画面に日にちしか表示されていない場合は、month・year とも必ず空文字（""）にしてください（推測しないこと）。
- 合計行・繰越・手数料など個別の利用でない行は含めないでください。

【totalのルール】
- total は個別利用の合計金額。明細に合計金額の記載があればそれを優先してください。
- 読み取れない場合は 0 にしてください。

【noteのルール】
- 1件だけ他の利用に比べて突出して高額な利用があり、かつその1件の金額が15000円を超える場合のみ、その利用先や内容を簡潔に記載する。
- それ以外は必ず空文字（""）にする。`

async function isAuthenticated(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return false
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    getPublishableKey(),
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data, error } = await supabase.auth.getUser()
  return !error && !!data?.user
}

// day: '1'..'31' または ''。month/year は画面に表示されている場合のみ埋まる（それ以外は ''）。
type Txn = { name: string; amount: number; day: string; month: string; year: string }
type Parsed = { total: number; note: string; transactions: Txn[] }

// マークダウンのコードフェンスを除去して JSON を取り出す
function parseJson(text: string): Parsed | null {
  if (!text) return null
  let t = text.trim()
  // ```json ... ``` / ``` ... ``` を除去
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  // 最初の { から最後の } までを抽出
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    const obj = JSON.parse(t.slice(start, end + 1))

    // 個別取引を整形（空の行は除外）
    const rawTxns = Array.isArray(obj.transactions) ? obj.transactions : []
    const transactions: Txn[] = rawTxns
      .map((it: Record<string, unknown>) => {
        const amount = Number(it?.amount)
        const dayNum = Number(it?.day)
        const day = Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31 ? String(dayNum) : ''
        const monthNum = Number(it?.month)
        const month = Number.isInteger(monthNum) && monthNum >= 1 && monthNum <= 12 ? String(monthNum) : ''
        const yearNum = Number(it?.year)
        const year = Number.isInteger(yearNum) && yearNum >= 2000 && yearNum <= 2100 ? String(yearNum) : ''
        return {
          name: typeof it?.name === 'string' ? it.name : '',
          amount: Number.isFinite(amount) ? amount : 0,
          day,
          month,
          year,
        }
      })
      .filter((it: Txn) => it.name !== '' || it.amount > 0 || it.day !== '')

    // total: 明示値を優先。無ければ（0なら）取引の合計にフォールバック。
    let total = Number(obj.total)
    if (!Number.isFinite(total)) total = Number(obj.amount) // 旧形式との互換
    if (!Number.isFinite(total)) total = 0
    if (total === 0 && transactions.length) {
      total = transactions.reduce((s, it) => s + it.amount, 0)
    }

    return {
      total,
      note: typeof obj.note === 'string' ? obj.note : '',
      transactions,
    }
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST のみ対応しています。' }, 405)
  }
  if (!(await isAuthenticated(req))) {
    return jsonResponse({ error: 'ログインが必要です。' }, 401)
  }

  try {
    const { image, mimeType } = await req.json().catch(() => ({}))
    if (!image || typeof image !== 'string') {
      return jsonResponse({ error: '画像データ（base64）が必要です。' }, 400)
    }

    const key = Deno.env.get('GEMINI_API_KEY')
    if (!key) return jsonResponse({ error: 'GEMINI_API_KEY 未設定' }, 500)

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } },
            ],
          }],
          generationConfig: {
            maxOutputTokens: 2048,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    )

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400)
      return jsonResponse({ error: `Gemini API エラー (HTTP ${res.status})`, detail }, 502)
    }

    const json = await res.json()
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
    const parsed = parseJson(text || '')
    if (!parsed) {
      return jsonResponse({ error: 'AI応答を解析できませんでした。' }, 422)
    }

    return jsonResponse({
      amount: parsed.total, // 後方互換キー（呼び出し側の guard 用）
      total: parsed.total,
      note: parsed.note,
      transactions: parsed.transactions,
    })
  } catch (e) {
    return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
