// 毎月1日 9:00 JST（0:00 UTC）— 月次レポート
// 先月の収支サマリー + 今月の引き落とし予定 + AI分析 を LINE へ送信する。
// cron からの起動に加え、設定画面のテスト送信ボタン（ブラウザ）からも呼べるよう CORS 対応。
// レスポンスには家計データ本文（message）を含めない（情報漏えい防止）。
import { sendLineMessage } from '../_shared/line.ts'
import { buildMonthlyReportMessage, getServiceClient } from '../_shared/report.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const body = await req.json().catch(() => ({}))

    // body.test === true（設定画面のテスト送信）のときは自分だけに送る。
    // cron は body '{}' なので両者へ送信される。
    let userIds: string[] | undefined = undefined
    if (body?.test === true) {
      const me = Deno.env.get('LINE_USER_ID_ME')?.trim()
      if (me) userIds = [me]
    }

    const sb = getServiceClient()
    const { aiError, message } = await buildMonthlyReportMessage(sb)

    // dryRun=true のときは送信せず、AIの成否だけ返す（本文は返さない）
    if (body?.dryRun === true) {
      return jsonResponse({ success: true, dryRun: true, aiOk: !aiError, aiError })
    }

    const results = await sendLineMessage(message, userIds)
    return jsonResponse({ success: results.every((r) => r.ok), aiOk: !aiError, aiError, results })
  } catch (e) {
    return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
