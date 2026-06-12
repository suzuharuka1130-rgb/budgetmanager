// 毎月25日 9:00 JST（0:00 UTC）— 支出入力リマインダー
import { sendLineMessage, getFilteredLineUserIds } from '../_shared/line.ts'

const MESSAGE = `📅 支出入力リマインダー
今月の支出をアプリに入力しましょう！
カードの引き落とし日が近づいています。忘れずに記録してください。
入金額：
多い月　はるか16万　ちぃ14万
少ない月　はるか14万　ちぃ13万`

Deno.serve(async () => {
  try {
    const targets = await getFilteredLineUserIds('monthly_reminder')
    if (targets.length === 0) {
      return Response.json({ success: true, skipped: true, reason: 'すべてのユーザーがこの通知をオフに設定しています。' })
    }
    const results = await sendLineMessage(MESSAGE, targets)
    return Response.json({ success: results.every((r) => r.ok), results })
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 })
  }
})
