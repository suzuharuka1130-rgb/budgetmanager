// 共有のLINE送信エンドポイント。アプリの設定画面（テスト送信）から利用。
// Body: { "message": string }
//
// verify_jwt はゲートウェイ側でOFF（CORSプリフライトを通すため）。
// 代わりにこの関数内で Authorization ヘッダーのJWTを検証し、
// 送信先は「呼び出したユーザー本人の連携済みLINEアカウント」に固定する。
// （以前は送信先 userIds をリクエストで自由に指定でき、ログイン済みなら誰でも
//   任意のLINEユーザーへBot名義で任意の文面を送れてしまっていた）
import { sendLineMessage } from '../_shared/line.ts'
import { getServiceClient } from '../_shared/report.ts'
import { getCallerContext } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const MAX_MESSAGE_LENGTH = 1000

Deno.serve(async (req) => {
  // CORS プリフライト
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST のみ対応しています。' }, 405)
  }

  try {
    const caller = await getCallerContext(req, getServiceClient())
    if (!caller) return jsonResponse({ error: 'ログインが必要です。' }, 401)
    if (!caller.lineUserId) {
      return jsonResponse({ error: 'あなたのLINEアカウントが連携されていません。' }, 400)
    }

    const { message } = await req.json().catch(() => ({}))
    if (!message || typeof message !== 'string') {
      return jsonResponse({ error: 'message（文字列）が必要です。' }, 400)
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return jsonResponse({ error: `message は${MAX_MESSAGE_LENGTH}文字以内にしてください。` }, 400)
    }

    const results = await sendLineMessage(message, [caller.lineUserId])
    const success = results.every((r) => r.ok)
    return jsonResponse({ success, results }, success ? 200 : 502)
  } catch (e) {
    return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
