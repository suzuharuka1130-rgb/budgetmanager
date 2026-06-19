// 毎月末日 9:00 JST（0:00 UTC）— クレジット入力リマインダー（全世帯へ）
// cron は 28-31日に毎日起動し、月末日でなければ早期終了する。
import { sendLineMessage, listHouseholdIds, householdLineRecipients } from '../_shared/line.ts'
import { getServiceClient, isLastDayOfMonthJST } from '../_shared/report.ts'

const MESSAGE = `💳 クレジット入力リマインダー
今月使用したクレジット金額を入力してください。
対象月を来月に設定して、各カードの来月引き落とし予定の金額を入力。`

Deno.serve(async () => {
  if (!isLastDayOfMonthJST()) {
    return Response.json({ skipped: true, reason: '月末日ではありません。' })
  }
  try {
    const sb = getServiceClient()
    const hids = await listHouseholdIds(sb)
    let sent = 0
    for (const hid of hids) {
      const recips = await householdLineRecipients(sb, hid, 'credit_input_reminder')
      if (!recips.length) continue
      await sendLineMessage(MESSAGE, recips)
      sent += 1
    }
    return Response.json({ success: true, households: hids.length, sent })
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 })
  }
})
