// 毎月1日 9:00 JST（0:00 UTC）— 月次レポート
// cron: 全世帯をループし、各世帯のレポートを各世帯のメンバーのLINEへ送信。
// test=true（設定画面）: 呼び出しユーザーの世帯のみ、本人に送信。
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendLineFlexMessage, buildAppLinkFlexContents, listHouseholdIds, householdLineRecipients } from '../_shared/line.ts'
import { buildMonthlyReportMessage, getServiceClient } from '../_shared/report.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

// アプリを開くボタンの遷移先（未設定時はデフォルトのVercel URLを使う）
const APP_URL = Deno.env.get('APP_URL') || 'https://kuromametchi-kakeibo.vercel.app/'

// 呼び出しユーザー本人の世帯ID・LINEユーザーIDを取得（JWT検証 → household_members）
async function callerInfo(
  req: Request,
  sb: ReturnType<typeof getServiceClient>,
): Promise<{ householdId: string; lineUserId: string | null } | null> {
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth) return null
  const anon = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: auth } } },
  )
  const { data, error } = await anon.auth.getUser()
  if (error || !data?.user) return null
  const { data: mem } = await sb
    .from('household_members')
    .select('household_id, line_user_id')
    .eq('user_id', data.user.id)
    .limit(1)
  const row = mem?.[0]
  if (!row) return null
  return { householdId: row.household_id, lineUserId: row.line_user_id ?? null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const sb = getServiceClient()

    // テスト送信: 呼び出しユーザー本人のみに送信（世帯の他メンバーには送らない）
    if (body?.test === true) {
      const caller = await callerInfo(req, sb)
      if (!caller) return jsonResponse({ error: '世帯が見つかりません。' }, 400)
      const message = await buildMonthlyReportMessage(sb, caller.householdId)
      const me = Deno.env.get('LINE_USER_ID_ME')?.trim()
      const target = caller.lineUserId ? [caller.lineUserId] : (me ? [me] : [])
      if (!target.length) {
        return jsonResponse({ error: 'あなたのLINEアカウントが連携されていません。' }, 400)
      }
      const bodyText = '（テスト送信）\n' + message
      const contents = buildAppLinkFlexContents(bodyText, APP_URL)
      const results = await sendLineFlexMessage(message.split('\n')[0], contents, target)
      return jsonResponse({ success: results.every((r) => r.ok), results })
    }

    // cron: 全世帯
    const hids = await listHouseholdIds(sb)
    let sent = 0
    for (const hid of hids) {
      const recips = await householdLineRecipients(sb, hid, 'monthly_report')
      if (!recips.length) continue
      const message = await buildMonthlyReportMessage(sb, hid)
      const contents = buildAppLinkFlexContents(message, APP_URL)
      await sendLineFlexMessage(message.split('\n')[0], contents, recips)
      sent += 1
    }
    return jsonResponse({ success: true, households: hids.length, sent })
  } catch (e) {
    return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
