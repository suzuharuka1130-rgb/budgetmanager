// 毎月25日 9:00 JST（0:00 UTC）— 支出入力リマインダー
import { sendLineMessage } from '../_shared/line.ts'

const MESSAGE = `📅 支出入力リマインダー
今月の支出をアプリに入力しましょう！
カードの締め日が近づいています。忘れずに記録してください。`

Deno.serve(async () => {
  try {
    const results = await sendLineMessage(MESSAGE)
    return Response.json({ success: results.every((r) => r.ok), results })
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 })
  }
})
