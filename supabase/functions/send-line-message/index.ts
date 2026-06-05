// 共有のLINE送信エンドポイント。アプリの設定画面（テスト送信）から利用。
// Body: { "message": string, "userIds"?: string[] }
//
// verify_jwt はゲートウェイ側でOFF（CORSプリフライトを通すため）。
// 代わりにこの関数内で Authorization ヘッダーのJWTを検証し、
// ログイン済みユーザーのみ送信を許可する。
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendLineMessage } from '../_shared/line.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

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

Deno.serve(async (req) => {
  // CORS プリフライト
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST のみ対応しています。' }, 405)
  }

  // ログイン済みユーザーのみ許可
  if (!(await isAuthenticated(req))) {
    return jsonResponse({ error: 'ログインが必要です。' }, 401)
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
