// 毎月25日 9:00 JST（0:00 UTC）— 支出入力リマインダー（全世帯へ）
// 文面は世帯ごとに app_settings.reminder_monthly_text へ保存。未設定（空）の世帯は送信しない。
import { sendLineMessage, listHouseholdIds, householdLineRecipients } from '../_shared/line.ts'
import { getServiceClient, getHouseholdSetting } from '../_shared/report.ts'

Deno.serve(async () => {
  try {
    const sb = getServiceClient()
    const hids = await listHouseholdIds(sb)
    let sent = 0
    for (const hid of hids) {
      const message = (await getHouseholdSetting(sb, hid, 'reminder_monthly_text'))?.trim()
      if (!message) continue // 文面未設定の世帯は送信しない
      const recips = await householdLineRecipients(sb, hid, 'monthly_reminder')
      if (!recips.length) continue
      await sendLineMessage(message, recips)
      sent += 1
    }
    return Response.json({ success: true, households: hids.length, sent })
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 })
  }
})
