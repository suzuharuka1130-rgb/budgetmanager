// 毎月1日 9:00 JST（0:00 UTC）— 月次レポート
// 先月の収支サマリー + 今月の引き落とし予定 + AI分析 を LINE へ送信する。
// cron からの起動に加え、設定画面のテスト送信ボタン（ブラウザ）からも呼べるよう CORS 対応。
import { sendLineMessage } from '../_shared/line.ts'
import { buildMonthlyReportMessage, getServiceClient } from '../_shared/report.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const sb = getServiceClient()
    const message = await buildMonthlyReportMessage(sb)
    const results = await sendLineMessage(message)
    return jsonResponse({ success: results.every((r) => r.ok), message, results })
  } catch (e) {
    return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
