// 毎月末日 9:00 JST（0:00 UTC）— クレジット入力リマインダー
// cron は 28-31日に毎日起動し、月末日でなければ早期終了する。
import { sendLineMessage } from '../_shared/line.ts'
import { isLastDayOfMonthJST } from '../_shared/report.ts'

const MESSAGE = `💳 クレジット入力リマインダー
今月使用したクレジット金額を入力してください。
対象月を来月に設定して、各カードの使用額を入力しましょう。
（この金額が来月末に口座から引き落とされます）`

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
