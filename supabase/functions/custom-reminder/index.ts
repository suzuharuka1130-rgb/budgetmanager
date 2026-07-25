// 毎日 9:00 JST（0:00 UTC）に起動 — カスタム通知（統合モデル）
// custom_notifications の day_of_month が今日（JST）に一致する通知を、
// 世帯ごとのオプトイン設定（custom_notification_prefs、行なし = ON）に従って送信する。
// include_app_link が true の通知は「Kakeiboを開く」ボタン付きの Flex Message で送信する。
import { sendLineMessage, sendLineFlexMessage, buildAppLinkFlexContents, customNotificationRecipients, SendResult } from '../_shared/line.ts'
import { getServiceClient, isReminderDayJST } from '../_shared/report.ts'

// アプリを開くボタンの遷移先（未設定時はデフォルトのVercel URLを使う）
const APP_URL = Deno.env.get('APP_URL') || 'https://kuromametchi-kakeibo.vercel.app/'

Deno.serve(async () => {
  try {
    const sb = getServiceClient()
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

    return Response.json(
      { success: failures.length === 0, total: (notifs ?? []).length, sent, failures },
      { status: failures.length ? 500 : 200 },
    )
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 })
  }
})
