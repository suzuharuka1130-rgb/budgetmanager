// 毎月1日 9:00 JST（0:00 UTC）— 月次レポート
// 先月の収支サマリー + 今月の引き落とし予定を LINE へ送信する。
import { sendLineMessage } from '../_shared/line.ts'
import { buildMonthlyReportMessage, getServiceClient } from '../_shared/report.ts'

Deno.serve(async () => {
  try {
    const sb = getServiceClient()
    const message = await buildMonthlyReportMessage(sb)
    const results = await sendLineMessage(message)
    return Response.json({ success: results.every((r) => r.ok), message, results })
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 })
  }
})
