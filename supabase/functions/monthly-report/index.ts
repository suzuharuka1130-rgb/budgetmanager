// 毎月1日 9:00 JST（0:00 UTC）— 月次レポート
// 先月の収支サマリー + 今月の引き落とし予定 + AI分析 を LINE へ送信する。
// cron からの起動に加え、設定画面のテスト送信ボタン（ブラウザ）からも呼べるよう CORS 対応。
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendLineMessage } from '../_shared/line.ts'
import { buildMonthlyReportMessage, getServiceClient } from '../_shared/report.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

// cron（service role キー）またはログイン済みユーザーのみ許可する。
async function authorize(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? ''
  const bearer = auth.replace(/^Bearer\s+/i, '').trim()
  if (!bearer) return false
  if (bearer === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return true // cron
  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: auth } } },
  )
  const { data, error } = await sb.auth.getUser()
  return !error && !!data?.user
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (!(await authorize(req))) {
    return jsonResponse({ error: '権限がありません。' }, 401)
  }
  try {
    // body.test === true（設定画面のテスト送信）のときは自分だけに送る。
    // cron は body '{}' なので両者へ送信される。
    const body = await req.json().catch(() => ({}))
    let userIds: string[] | undefined = undefined
    if (body?.test === true) {
      const me = Deno.env.get('LINE_USER_ID_ME')?.trim()
      if (me) userIds = [me]
    }

    const sb = getServiceClient()
    const { message, aiError } = await buildMonthlyReportMessage(sb)

    // dryRun=true のときは送信せず、生成内容とAIエラーだけ返す（デバッグ用）
    if (body?.dryRun === true) {
      return jsonResponse({ success: true, dryRun: true, message, aiError })
    }

    const results = await sendLineMessage(message, userIds)
    return jsonResponse({ success: results.every((r) => r.ok), message, aiError, results })
  } catch (e) {
    return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
