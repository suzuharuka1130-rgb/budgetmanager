-- 家計簿アプリ Supabase スキーマ
-- Supabase の SQL Editor で実行してください。

-- 月次入金
create table if not exists monthly_income (
  id bigint generated always as identity primary key,
  year int not null,
  month int not null check (month between 1 and 12),
  amount numeric not null check (amount >= 0),
  note text,
  created_at timestamptz not null default now()
);

-- カード支出
do $$ begin
  create type card_type as enum ('fixed', 'daily', 'other');
exception when duplicate_object then null; end $$;

create table if not exists card_expenses (
  id bigint generated always as identity primary key,
  year int not null,
  month int not null check (month between 1 and 12),
  card_type card_type not null,
  amount numeric not null check (amount >= 0),
  note text,
  created_at timestamptz not null default now()
);

-- その他支出
do $$ begin
  create type other_expense_type as enum ('cash_withdrawal', 'transfer', 'other');
exception when duplicate_object then null; end $$;

create table if not exists other_expenses (
  id bigint generated always as identity primary key,
  year int not null,
  month int not null check (month between 1 and 12),
  type other_expense_type not null,
  amount numeric not null check (amount >= 0),
  note text,
  created_at timestamptz not null default now()
);

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
create index if not exists idx_other_expenses_ym on other_expenses (year, month);
create index if not exists idx_account_balance_ym on account_balance (year, month);

-- RLS（匿名キーで読み書きする想定）。本番では適切なポリシーに変更してください。
alter table monthly_income enable row level security;
alter table card_expenses enable row level security;
alter table other_expenses enable row level security;
alter table account_balance enable row level security;

do $$ begin
  create policy "allow all" on monthly_income for all using (true) with check (true);
  create policy "allow all" on card_expenses for all using (true) with check (true);
  create policy "allow all" on other_expenses for all using (true) with check (true);
  create policy "allow all" on account_balance for all using (true) with check (true);
exception when duplicate_object then null; end $$;
