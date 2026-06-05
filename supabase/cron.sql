-- LINE通知のスケジュール設定（pg_cron + pg_net）
-- Supabase の SQL Editor で実行してください。
-- 事前に Edge Functions（monthly-reminder / credit-input-reminder / monthly-report）を
-- デプロイし、下記のプレースホルダを置き換えてください。
--
--   <PROJECT_REF>       : SupabaseプロジェクトのRef（例: abcdefghijklmno）
--   <SERVICE_ROLE_KEY>  : service role キー（Settings → API）
--
-- すべて UTC（JST = UTC+9）。9:00 JST = 0:00 UTC。

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 既存ジョブがあれば作り直す（再実行可能にする）
do $$
begin
  perform cron.unschedule('monthly-reminder');
exception when others then null; end $$;
do $$
begin
  perform cron.unschedule('credit-input-reminder');
exception when others then null; end $$;
do $$
begin
  perform cron.unschedule('monthly-report');
exception when others then null; end $$;

-- 1) 毎月25日 0:00 UTC（9:00 JST）— 支出入力リマインダー
select cron.schedule(
  'monthly-reminder',
  '0 0 25 * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/monthly-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 2) 毎月28-31日 0:00 UTC（9:00 JST）— クレジット入力リマインダー
--    関数側で「月末日」のみ送信するよう判定する
select cron.schedule(
  'credit-input-reminder',
  '0 0 28-31 * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/credit-input-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 3) 毎月1日 0:00 UTC（9:00 JST）— 月次レポート
select cron.schedule(
  'monthly-report',
  '0 0 1 * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/monthly-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 確認: select * from cron.job;
