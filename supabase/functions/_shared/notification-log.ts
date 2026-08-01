// notification_logs への実行結果の記録。
// cron.job_run_details は net.http_post が「送信できたか」までしか見ておらず、
// 呼び出し先が404/500を返しても「成功」と記録される（この見えなさが今回の
// 3週間の障害を長引かせた）。関数自身の成否をDBに残すことで、この盲点を塞ぐ。
import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export async function logNotificationRun(
  sb: SupabaseClient,
  functionName: string,
  summary: { total: number; sent: number; failures: unknown[] },
): Promise<void> {
  const status = summary.failures.length === 0 ? 'success' : 'error'
  try {
    await sb.from('notification_logs').insert({
      function_name: functionName,
      status,
      detail: JSON.stringify(summary),
    })
  } catch {
    // ログ書き込み自体の失敗は本処理の成否に影響させない（握りつぶす）
  }
}
