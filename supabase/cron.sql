-- LINE通知のスケジュール設定（pg_cron + pg_net）
-- Supabase の SQL Editor で実行してください。
-- 事前に Edge Functions（custom-reminder / monthly-report / daily-backup）を
-- デプロイし、下記のプレースホルダを置き換えてください。
-- ※ 旧 monthly-reminder / credit-input-reminder は custom-reminder に統合されました。
--    本ファイルを再実行すると旧ジョブは削除されます。
--
--   <PROJECT_REF>  : SupabaseプロジェクトのRef（例: abcdefghijklmno）
--   <SECRET_KEY>   : secret キー（Settings → API Keys → Secret keys）。
--                    レガシーキーのみのプロジェクトでは service role キーで代用可。
--
-- 新しい secret / publishable キー（sb_secret_... / sb_publishable_...）はJWTでは
-- ないため Authorization: Bearer では拒否される。apikey ヘッダーで送ること。
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
do $$
begin
  perform cron.unschedule('daily-backup');
exception when others then null; end $$;
do $$
begin
  perform cron.unschedule('custom-reminder');
exception when others then null; end $$;

-- 1) 毎日 0:00 UTC（9:00 JST）— カスタム通知
--    関数側で通知ごとの送信日（day_of_month）が今日（JST）かを判定して送信する
select cron.schedule(
  'custom-reminder',
  '0 0 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/custom-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '<SECRET_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 2) 毎月1日 0:00 UTC（9:00 JST）— 月次レポート
select cron.schedule(
  'monthly-report',
  '0 0 1 * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/monthly-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '<SECRET_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 3) 毎日 16:00 UTC（翌 1:00 JST）— 自動バックアップ（Google Drive へ）
select cron.schedule(
  'daily-backup',
  '0 16 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/daily-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '<SECRET_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- プレースホルダの置換忘れを検知する（2026-07-25〜08-01: <PROJECT_REF> が未置換のまま
-- 3週間デプロイされ、月次レポート・カスタム通知・日次バックアップが全て黙って
-- URLの名前解決に失敗していた。cron.job_run_details 上は「成功」と記録されるため、
-- 手動でチェックするまで誰も気づけなかった）。
-- 注意: このガードは <PROJECT_REF> のような文字列を直接書かない。
-- 一括置換で本ファイル中の全ての <PROJECT_REF> を実際の値に置き換えると、
-- ガード自身の判定文字列まで書き換わってしまい、常に「未置換」と誤判定して
-- しまう（実際に一度これで失敗した）。山括弧の形（<英大文字_アンダースコア>）を
-- 正規表現で検出することで、一括置換の影響を受けないようにする。
do $$
begin
  if exists (
    select 1 from cron.job
    where command ~ ('<' || '[A-Z_]+' || '>')
  ) then
    raise exception 'cron.sql に未置換のプレースホルダ（山括弧 < > で囲まれた項目）が残っています。実際の値に置き換えてから再実行してください。';
  end if;
end $$;

-- 確認: select jobname, substring(command from 'url := ''([^'']+)''') as url from cron.job order by jobname;
