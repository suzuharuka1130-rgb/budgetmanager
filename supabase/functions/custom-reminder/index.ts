// 毎日 9:00 JST（0:00 UTC）に起動 — カスタム通知（統合モデル）
// custom_notifications の day_of_month が今日（JST）に一致する通知を、
// 世帯ごとのオプトイン設定（custom_notification_prefs、行なし = ON）に従って送信する。
// include_app_link が true の通知は「Kakeiboを開く」ボタン付きの Flex Message で送信する。
// test=true + notificationId（設定画面）: 日付判定なしで呼び出しユーザー本人にのみ即時送信。
import { sendLineMessage, sendLineFlexMessage, buildAppLinkFlexContents, customNotificationRecipients, SendResult } from '../_shared/line.ts'
import { getServiceClient, isReminderDayJST } from '../_shared/report.ts'
import { getCallerContext, isCronAuthorized } from '../_shared/auth.ts'
import { logNotificationRun } from '../_shared/notification-log.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

// アプリを開くボタンの遷移先（未設定時はデフォルトのVercel URLを使う）
const APP_URL = Deno.env.get('APP_URL') || 'https://kuromametchi-kakeibo.vercel.app/'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST のみ対応しています。' }, 405)
  }
  try {
    const body = await req.json().catch(() => ({}))
    const sb = getServiceClient()

    // テスト送信: 呼び出しユーザー本人のみに、送信日の判定なしで即時送信する
    if (body?.test === true) {
      if (!body?.notificationId) return jsonResponse({ error: 'notificationId が必要です。' }, 400)
      const caller = await getCallerContext(req, sb)
      if (!caller) return jsonResponse({ error: '世帯が見つかりません。' }, 400)
      const { data: n, error } = await sb
        .from('custom_notifications')
        .select('id, content, include_app_link')
        .eq('id', body.notificationId)
        .eq('household_id', caller.householdId)
        .maybeSingle()
      if (error) throw error
      if (!n) return jsonResponse({ error: '通知が見つかりません。' }, 404)
      const content = (n.content ?? '').trim()
      if (!content) return jsonResponse({ error: '文面が空です。' }, 400)
      if (!caller.lineUserId) return jsonResponse({ error: 'あなたのLINEアカウントが連携されていません。' }, 400)

      const bodyText = '（テスト送信）\n' + content
      let results: SendResult[]
      if (n.include_app_link) {
        const contents = buildAppLinkFlexContents(bodyText, APP_URL)
        results = await sendLineFlexMessage(content.split('\n')[0], contents, [caller.lineUserId])
      } else {
        results = await sendLineMessage(bodyText, [caller.lineUserId])
      }
      return jsonResponse({ success: results.every((r) => r.ok), results })
    }

    // cron 専用: apikey ヘッダーが secret キーと一致するリクエストのみ許可する
    if (!isCronAuthorized(req)) {
      return jsonResponse({ error: '認証が必要です。' }, 401)
    }

    const { data: notifs, error: selectError } = await sb
      .from('custom_notifications')
      .select('id, household_id, content, day_of_month, include_app_link')
    if (selectError) throw selectError

    let sent = 0
    // 1件の失敗が他の通知の送信を止めないよう、通知ごとに独立して処理・記録する
    const failures: { id: string; error: string }[] = []

    for (const n of notifs ?? []) {
      try {
        const content = (n.content ?? '').trim()
        if (!content) continue // 文面が空の通知は送信しない
        if (!isReminderDayJST(n.day_of_month, '1')) continue
        const recips = await customNotificationRecipients(sb, n.household_id, n.id)
        if (!recips.length) continue

        let results: SendResult[]
        if (n.include_app_link) {
          const contents = buildAppLinkFlexContents(content, APP_URL)
          results = await sendLineFlexMessage(content.split('\n')[0], contents, recips)
        } else {
          results = await sendLineMessage(content, recips)
        }
        const failed = results.filter((r) => !r.ok)
        if (failed.length) {
          throw new Error(
            `LINE push failed for ${failed.length}/${results.length} recipient(s): ` +
              failed.map((f) => `${f.userId}(${f.status})`).join(', '),
          )
        }
        sent += 1
      } catch (e) {
        failures.push({ id: n.id, error: String((e as Error)?.message ?? e) })
      }
    }

    await logNotificationRun(sb, 'custom-reminder', { total: (notifs ?? []).length, sent, failures })
    return jsonResponse(
      { success: failures.length === 0, total: (notifs ?? []).length, sent, failures },
      failures.length ? 500 : 200,
    )
  } catch (e) {
    return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
