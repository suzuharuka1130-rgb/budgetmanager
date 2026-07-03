-- カスタム通知に「アプリを開くボタン（Kakeiboを開く）」をLINEメッセージへ含めるかのフラグ。
-- custom_notifications.sql の実行後に適用してください。
alter table custom_notifications
  add column if not exists include_app_link boolean not null default false;
