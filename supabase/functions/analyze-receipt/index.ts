// レシート/明細画像を Gemini Vision で解析し { amount, note } を返す。
// Body: { "image": "<base64>", "mimeType"?: "image/jpeg" | "image/png" }
// ブラウザ（カード支出フォーム）から呼ばれるため CORS 対応 + JWT 手動検証。
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

// 注: gemini-2.0-flash はこのアカウントの無料枠が limit:0 のため、
// 無料枠で利用できる gemini-2.5-flash を使用する（Vision対応）。
const MODEL = 'gemini-2.5-flash'

const PROMPT = `この画像はクレジットカードの利用明細または取引画面です。
以下の情報をJSON形式のみで出力してください。説明文は不要です。

{
  "amount": 合計金額を数値のみで（カンマや円記号なし）,
  "note": "下記ルールに従った簡潔なメモ（該当しなければ空文字）"
}

【noteのルール】
- 1件だけ他の利用に比べて突出して高額な利用があり、かつその1件の金額が15000円を超える場合のみ、その利用先や内容を簡潔に記載する。
- すべての利用がほぼ同程度の金額の場合、または最も高額な利用でも15000円以下の場合は、noteを必ず空文字（""）にする。
- 安価な利用を無理に記載しないこと。

金額が複数ある場合は合計金額を抽出してください。読み取れない場合はamountを0にしてください。`

async function isAuthenticated(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return false
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data, error } = await supabase.auth.getUser()
  return !error && !!data?.user
}

// マークダウンのコードフェンスを除去して JSON を取り出す
function parseJson(text: string): { amount: number; note: string } | null {
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
    const amount = Number(obj.amount)
    return {
      amount: Number.isFinite(amount) ? amount : 0,
      note: typeof obj.note === 'string' ? obj.note : '',
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
            maxOutputTokens: 200,
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

    return jsonResponse({ amount: parsed.amount, note: parsed.note })
  } catch (e) {
    return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
