-- その他支出の個別取引（1明細 = 複数取引。手動編集）
-- multi_household.sql の実行後に適用してください。
-- other_expenses.id は bigint identity のため、FK も bigint。

create table if not exists other_expense_transactions (
  id bigint generated always as identity primary key,
  other_expense_id bigint not null references other_expenses(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  name text not null default '',
  amount numeric not null default 0 check (amount >= 0),
  txn_date date,                     -- 未入力の場合は null
  display_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_oet_other_expense on other_expense_transactions (other_expense_id);
create index if not exists idx_oet_household on other_expense_transactions (household_id);

-- household_id 自動補完（multi_household.sql の set_household_id を再利用）
drop trigger if exists trg_set_household on other_expense_transactions;
create trigger trg_set_household before insert on other_expense_transactions
  for each row execute function set_household_id();

-- RLS: 世帯分離（既存イディオムと同一）
alter table other_expense_transactions enable row level security;
drop policy if exists "household_isolation" on other_expense_transactions;
create policy "household_isolation" on other_expense_transactions
  using (household_id = get_my_household_id())
  with check (household_id = get_my_household_id());
