// 毎月1日 9:00 JST（0:00 UTC）— 月次レポート
// 先月の収支サマリー + 今月の引き落とし予定 を LINE へ送信する。
// cron からの起動に加え、設定画面のテスト送信ボタン（ブラウザ）からも呼べるよう CORS 対応。
// レスポンスには家計データ本文（message）を含めない（情報漏えい防止）。
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendLineMessage } from '../_shared/line.ts'
import { buildMonthlyReportMessage, getServiceClient } from '../_shared/report.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

// メールアドレスからLINEユーザーIDへのマッピング
function getLineUserIdForEmail(email: string): string | undefined {
  const me = Deno.env.get('LINE_USER_ID_ME')?.trim()
  const wife = Deno.env.get('LINE_USER_ID_WIFE')?.trim()
  const meEmail = (Deno.env.get('USER_EMAIL_ME') || 'suzu.haruka1130@gmail.com').trim().toLowerCase()
  const wifeEmail = (Deno.env.get('USER_EMAIL_WIFE') || '').trim().toLowerCase()

  const normalized = email.trim().toLowerCase()
  if (normalized === meEmail) return me
  if (wifeEmail && normalized === wifeEmail) return wife
  return me // fallback to ME
}

// リクエストからユーザーのメールアドレスを取得
async function getUserEmail(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return null
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) return null
  return data.user.email ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const body = await req.json().catch(() => ({}))

    // body.test === true（設定画面のテスト送信）のときはリクエスト者のLINEのみに送る。
    // cron は body '{}' なので両者へ送信される。
    let userIds: string[] | undefined = undefined
    if (body?.test === true) {
      const email = await getUserEmail(req)
      if (email) {
        const lineId = getLineUserIdForEmail(email)
        if (lineId) userIds = [lineId]
      } else {
        const me = Deno.env.get('LINE_USER_ID_ME')?.trim()
        if (me) userIds = [me]
      }
    }

    const sb = getServiceClient()
    const message = await buildMonthlyReportMessage(sb)

    // dryRun=true のときは送信しない（本文は返さない）
    if (body?.dryRun === true) {
      return jsonResponse({ success: true, dryRun: true })
    }

    const results = await sendLineMessage(message, userIds)
    return jsonResponse({ success: results.every((r) => r.ok), results })
  } catch (e) {
    return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
