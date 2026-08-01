// 毎月1日 9:00 JST（0:00 UTC）— 月次レポート
// cron: 全世帯をループし、各世帯のレポートを各世帯のメンバーのLINEへ送信。
// test=true（設定画面）: 呼び出しユーザーの世帯のみ、本人に送信。
import { sendLineFlexMessage, buildAppLinkFlexContents, listHouseholdIds, householdLineRecipients, SendResult } from '../_shared/line.ts'
import { buildMonthlyReportMessage, getServiceClient } from '../_shared/report.ts'
import { getCallerContext, isCronAuthorized } from '../_shared/auth.ts'
import { logNotificationRun } from '../_shared/notification-log.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

// アプリを開くボタンの遷移先（未設定時はデフォルトのVercel URLを使う）
const APP_URL = Deno.env.get('APP_URL') || 'https://kuromametchi-kakeibo.vercel.app/'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const sb = getServiceClient()

    // テスト送信: 呼び出しユーザー本人のみに送信（世帯の他メンバーには送らない）
    if (body?.test === true) {
      const caller = await getCallerContext(req, sb)
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

    // cron 専用: apikey ヘッダーが secret キーと一致するリクエストのみ許可する
    // （そうしないと URL さえ知っていれば誰でも全世帯へLINE送信を起動できてしまう）
    if (!isCronAuthorized(req)) {
      return jsonResponse({ error: '認証が必要です。' }, 401)
    }

    // cron: 全世帯
    const hids = await listHouseholdIds(sb)
    let sent = 0
    // 1世帯の失敗が他の世帯への送信を止めないよう、世帯ごとに独立して処理・記録する
    const failures: { householdId: string; error: string }[] = []
    for (const hid of hids) {
      try {
        const recips = await householdLineRecipients(sb, hid, 'monthly_report')
        if (!recips.length) continue
        const message = await buildMonthlyReportMessage(sb, hid)
        const contents = buildAppLinkFlexContents(message, APP_URL)
        const results: SendResult[] = await sendLineFlexMessage(message.split('\n')[0], contents, recips)
        const failed = results.filter((r) => !r.ok)
        if (failed.length) {
          throw new Error(
            `LINE push failed for ${failed.length}/${results.length} recipient(s): ` +
              failed.map((f) => `${f.userId}(${f.status})`).join(', '),
          )
        }
        sent += 1
      } catch (e) {
        failures.push({ householdId: hid, error: String((e as Error)?.message ?? e) })
      }
    }
    await logNotificationRun(sb, 'monthly-report', { total: hids.length, sent, failures })
    return jsonResponse(
      { success: failures.length === 0, households: hids.length, sent, failures },
      failures.length ? 500 : 200,
    )
  } catch (e) {
    return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
