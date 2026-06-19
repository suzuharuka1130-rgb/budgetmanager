// 毎月25日 9:00 JST（0:00 UTC）— 支出入力リマインダー（全世帯へ）
import { sendLineMessage, listHouseholdIds, householdLineRecipients } from '../_shared/line.ts'
import { getServiceClient } from '../_shared/report.ts'

const MESSAGE = `📅 支出入力リマインダー
今月の支出をアプリに入力しましょう！
カードの引き落とし日が近づいています。忘れずに記録してください。
入金額：
多い月　はるか16万　ちぃ14万
少ない月　はるか14万　ちぃ13万`

Deno.serve(async () => {
  try {
    const sb = getServiceClient()
    const hids = await listHouseholdIds(sb)
    let sent = 0
    for (const hid of hids) {
      const recips = await householdLineRecipients(sb, hid, 'monthly_reminder')
      if (!recips.length) continue
      await sendLineMessage(MESSAGE, recips)
      sent += 1
    }
    return Response.json({ success: true, households: hids.length, sent })
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 })
  }
})
