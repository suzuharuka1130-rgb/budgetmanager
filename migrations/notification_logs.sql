-- monthly-report / custom-reminder の実行結果ログ。
-- cron.job_run_details は net.http_post が送信できたかしか見ておらず、呼び出し先が
-- 404/500 を返しても「成功」と記録される。この盲点（2026-07-25〜08-01の障害を
-- 3週間放置させた原因）を塞ぐため、関数自身の成否を毎回このテーブルに記録する。
create table if not exists notification_logs (
  id bigint generated always as identity primary key,
  function_name text not null,   -- 'monthly-report' | 'custom-reminder'
  status text not null,          -- 'success' | 'error'
  detail text,                   -- { total, sent, failures } の JSON 文字列
  created_at timestamptz not null default now()
);
create index if not exists idx_notification_logs_created on notification_logs (created_at desc);

-- service role からのみ書き込む（クライアントからの直接書き込みは想定しない）。
-- 確認は SQL Editor から: select * from notification_logs order by created_at desc limit 20;
alter table notification_logs enable row level security;
