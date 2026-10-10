-- Google ログイン用のリフレッシュトークン。設定画面が開くたびにプロフィール写真を取り直すために使う。
-- ブラウザからは読めない（RLS 有効・権限なし）。Edge Function が service role でのみ読み書きする。
-- Drive バックアップ用のトークンとは別物。

create table if not exists google_oauth_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table google_oauth_tokens enable row level security;

revoke all on google_oauth_tokens from anon, authenticated;
