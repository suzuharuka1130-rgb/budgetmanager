// 毎月1日 9:00 JST（0:00 UTC）— 月次レポート
// cron: 全世帯をループし、各世帯のレポートを各世帯のメンバーのLINEへ送信。
// test=true（設定画面）: 呼び出しユーザーの世帯のみ、本人に送信。
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendLineMessage, listHouseholdIds, householdLineRecipients } from '../_shared/line.ts'
import { buildMonthlyReportMessage, getServiceClient } from '../_shared/report.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

// 呼び出しユーザーの世帯IDを取得（JWT検証 → household_members）
async function callerHouseholdId(req: Request, sb: ReturnType<typeof getServiceClient>): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth) return null
  const anon = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: auth } } },
  )
  const { data, error } = await anon.auth.getUser()
  if (error || !data?.user) return null
  const { data: mem } = await sb.from('household_members').select('household_id').eq('user_id', data.user.id).limit(1)
  return mem?.[0]?.household_id ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const sb = getServiceClient()

    // テスト送信: 呼び出しユーザーの世帯のみ、本人（または env フォールバック）に送信
    if (body?.test === true) {
      const hid = await callerHouseholdId(req, sb)
      if (!hid) return jsonResponse({ error: '世帯が見つかりません。' }, 400)
      const message = await buildMonthlyReportMessage(sb, hid)
      const recips = await householdLineRecipients(sb, hid, 'monthly_report')
      const me = Deno.env.get('LINE_USER_ID_ME')?.trim()
      const target = recips.length ? recips : (me ? [me] : [])
      const results = await sendLineMessage('（テスト送信）\n' + message, target)
      return jsonResponse({ success: results.every((r) => r.ok), results })
    }

    // cron: 全世帯
    const hids = await listHouseholdIds(sb)
    let sent = 0
    for (const hid of hids) {
      const recips = await householdLineRecipients(sb, hid, 'monthly_report')
      if (!recips.length) continue
      const message = await buildMonthlyReportMessage(sb, hid)
      await sendLineMessage(message, recips)
      sent += 1
    }
    return jsonResponse({ success: true, households: hids.length, sent })
  } catch (e) {
    return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
