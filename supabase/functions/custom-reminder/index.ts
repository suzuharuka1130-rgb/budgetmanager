// 毎日 9:00 JST（0:00 UTC）に起動 — カスタム通知（統合モデル）
// custom_notifications の day_of_month が今日（JST）に一致する通知を、
// 世帯ごとのオプトイン設定（custom_notification_prefs、行なし = ON）に従って送信する。
import { sendLineMessage, customNotificationRecipients } from '../_shared/line.ts'
import { getServiceClient, isReminderDayJST } from '../_shared/report.ts'

Deno.serve(async () => {
  try {
    const sb = getServiceClient()
    const { data: notifs } = await sb
      .from('custom_notifications')
      .select('id, household_id, content, day_of_month')
    let sent = 0
    for (const n of notifs ?? []) {
      const content = (n.content ?? '').trim()
      if (!content) continue // 文面が空の通知は送信しない
      if (!isReminderDayJST(n.day_of_month, '1')) continue
      const recips = await customNotificationRecipients(sb, n.household_id, n.id)
      if (!recips.length) continue
      await sendLineMessage(content, recips)
      sent += 1
    }
    return Response.json({ success: true, total: (notifs ?? []).length, sent })
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 })
  }
})
