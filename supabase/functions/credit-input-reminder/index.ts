// 毎月末日 9:00 JST（0:00 UTC）— クレジット入力リマインダー
// cron は 28-31日に毎日起動し、月末日でなければ早期終了する。
import { sendLineMessage } from '../_shared/line.ts'
import { isLastDayOfMonthJST } from '../_shared/report.ts'

const MESSAGE = `💳 クレジット入力リマインダー
今月使用したクレジット金額を入力してください。
対象月を来月に設定して、各カードの来月引き落とし予定の金額を入力。`

Deno.serve(async () => {
  // 月末日でなければ送信しない
  if (!isLastDayOfMonthJST()) {
    return Response.json({ skipped: true, reason: '月末日ではありません。' })
  }

  try {
    const results = await sendLineMessage(MESSAGE)
    return Response.json({ success: results.every((r) => r.ok), results })
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 })
  }
})
