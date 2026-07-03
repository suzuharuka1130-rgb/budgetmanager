-- 家計簿アプリ Supabase スキーマ
-- Supabase の SQL Editor で実行してください。

-- 月次入金
create table if not exists monthly_income (
  id bigint generated always as identity primary key,
  year int not null,
  month int not null check (month between 1 and 12),
  amount numeric not null check (amount >= 0),
  note text,
  confirmed boolean not null default true, -- 未来月の入力は false（確定待ち）
  created_at timestamptz not null default now()
);

-- カード（ユーザー管理。is_active で論理削除）
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#6b7280',
  display_order integer not null default 0,
  is_active boolean not null default true,
  report_group text not null default 'leisure', -- LINEレポート: 'housing' / 'leisure'
  created_at timestamptz not null default now()
);

-- その他支出タイプ（ユーザー管理）
create table if not exists other_expense_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#6b7280',
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- アプリ全体設定（key/value）
create table if not exists app_settings (
  key text primary key,
  value text
);

-- カード支出
create table if not exists card_expenses (
  id bigint generated always as identity primary key,
  year int not null,
  month int not null check (month between 1 and 12),
  card_id uuid not null references cards(id),
  amount numeric not null check (amount >= 0),
  note text,
  confirmed boolean not null default true, -- 未来月の入力は false（確定待ち）
  receipt_image_url text,                  -- レシート画像のStorageパス（任意）
  created_at timestamptz not null default now()
);

-- カード明細の個別取引（1明細 = 複数取引。OCRで抽出／手動編集）
-- 世帯分離RLS・household_id補完トリガーは migrations/card_expense_transactions.sql を参照。
create table if not exists card_expense_transactions (
  id bigint generated always as identity primary key,
  card_expense_id bigint not null references card_expenses(id) on delete cascade,
  household_id uuid,
  name text not null default '',
  amount numeric not null default 0 check (amount >= 0),
  txn_date date,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

-- その他支出
create table if not exists other_expenses (
  id bigint generated always as identity primary key,
  year int not null,
  month int not null check (month between 1 and 12),
  expense_type_id uuid not null references other_expense_types(id),
  amount numeric not null check (amount >= 0),
  note text,
  confirmed boolean not null default true, -- 未来月の入力は false（確定待ち）
  created_at timestamptz not null default now()
);

-- 初期データ（既存の表示名・色）
insert into cards (id, name, color, display_order, report_group) values
  ('11111111-1111-1111-1111-111111111111', 'STARTS（家賃・ガス・水道・電気）', '#2563eb', 1, 'housing'),
  ('22222222-2222-2222-2222-222222222222', 'Olive（生活費）',                 '#16a34a', 2, 'housing'),
  ('33333333-3333-3333-3333-333333333333', 'Rakuten Pink（変動費）',          '#db2777', 3, 'leisure')
on conflict (id) do nothing;

insert into other_expense_types (id, name, color, display_order) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '現金引き出し', '#6b7280', 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '振込',         '#6b7280', 2),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'その他',       '#6b7280', 3)
on conflict (id) do nothing;

insert into app_settings (key, value) values ('app_title', 'Haruka ChiChan Kakeibo')
on conflict (key) do nothing;

-- 口座残高スナップショット（手入力）
create table if not exists account_balance (
  id bigint generated always as identity primary key,
  year int not null,
  month int not null check (month between 1 and 12),
  balance numeric not null,
  created_at timestamptz not null default now()
);

-- インデックス
create index if not exists idx_monthly_income_ym on monthly_income (year, month);
create index if not exists idx_card_expenses_ym on card_expenses (year, month);
create index if not exists idx_card_expenses_card_id on card_expenses (card_id);
create index if not exists idx_other_expenses_ym on other_expenses (year, month);
create index if not exists idx_other_expenses_type_id on other_expenses (expense_type_id);
create index if not exists idx_account_balance_ym on account_balance (year, month);

-- RLS（匿名キーで読み書きする想定）。本番では適切なポリシーに変更してください。
alter table monthly_income enable row level security;
alter table card_expenses enable row level security;
alter table other_expenses enable row level security;
alter table account_balance enable row level security;
alter table cards enable row level security;
alter table other_expense_types enable row level security;
alter table app_settings enable row level security;

do $$ begin
  create policy "allow all" on monthly_income for all using (true) with check (true);
  create policy "allow all" on card_expenses for all using (true) with check (true);
  create policy "allow all" on other_expenses for all using (true) with check (true);
  create policy "allow all" on account_balance for all using (true) with check (true);
  create policy "allow all" on cards for all using (true) with check (true);
  create policy "allow all" on other_expense_types for all using (true) with check (true);
  create policy "allow all" on app_settings for all using (true) with check (true);
exception when duplicate_object then null; end $$;

-- レシート画像用の非公開ストレージバケット
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

do $$ begin
  create policy "receipts authenticated all" on storage.objects
    for all to authenticated
    using (bucket_id = 'receipts')
    with check (bucket_id = 'receipts');
exception when duplicate_object then null; end $$;

-- LINE通知設定（ユーザーごと）
create table if not exists notification_preferences (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  monthly_report boolean not null default true,
  monthly_reminder boolean not null default true,
  credit_input_reminder boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table notification_preferences enable row level security;

do $$ begin
  create policy "users can read own prefs" on notification_preferences
    for select using (auth.uid() = user_id);
  create policy "users can insert own prefs" on notification_preferences
    for insert with check (auth.uid() = user_id);
  create policy "users can update own prefs" on notification_preferences
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
