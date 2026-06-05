// 共有のLINE送信エンドポイント。アプリの設定画面（テスト送信）や他の関数から利用。
// Body: { "message": string, "userIds"?: string[] }
import { sendLineMessage } from '../_shared/line.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST のみ対応しています。' }, 405)
  }

  try {
    const { message, userIds } = await req.json().catch(() => ({}))
    if (!message || typeof message !== 'string') {
      return jsonResponse({ error: 'message（文字列）が必要です。' }, 400)
    }

    const results = await sendLineMessage(message, Array.isArray(userIds) ? userIds : undefined)
    const success = results.every((r) => r.ok)
    return jsonResponse({ success, results }, success ? 200 : 502)
  } catch (e) {
    return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
