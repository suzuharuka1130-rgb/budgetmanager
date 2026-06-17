-- 動的カード / その他支出タイプ / アプリ設定への移行
-- Supabase の SQL Editor で1回だけ実行してください。
-- 既存の card_expenses.card_type / other_expenses.type を新FKへマップしてから旧列を削除します。

-- ===== 新テーブル =====
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#6b7280',
  display_order integer not null default 0,
  is_active boolean not null default true,
  -- LINEレポートのグループ: 'housing'(家賃＆生活費) / 'leisure'(娯楽費)
  report_group text not null default 'leisure',
  created_at timestamptz not null default now()
);
alter table cards add column if not exists report_group text not null default 'leisure';

create table if not exists other_expense_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#6b7280',
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists app_settings (
  key text primary key,
  value text
);

-- ===== シード（既存表示名・色を維持。固定UUIDでLINEレポートのグルーピングに利用）=====
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

-- ===== card_expenses: card_type ENUM -> card_id FK =====
alter table card_expenses add column if not exists card_id uuid;
update card_expenses set card_id = case card_type
  when 'fixed' then '11111111-1111-1111-1111-111111111111'::uuid
  when 'daily' then '22222222-2222-2222-2222-222222222222'::uuid
  when 'other' then '33333333-3333-3333-3333-333333333333'::uuid
end
where card_id is null;

do $$ begin
  alter table card_expenses
    add constraint card_expenses_card_id_fkey foreign key (card_id) references cards(id);
exception when duplicate_object then null; end $$;

alter table card_expenses drop column if exists card_type;
alter table card_expenses alter column card_id set not null;
create index if not exists idx_card_expenses_card_id on card_expenses (card_id);

-- ===== other_expenses: type ENUM -> expense_type_id FK =====
alter table other_expenses add column if not exists expense_type_id uuid;
update other_expenses set expense_type_id = case type
  when 'cash_withdrawal' then 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
  when 'transfer'        then 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid
  when 'other'           then 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid
end
where expense_type_id is null;

do $$ begin
  alter table other_expenses
    add constraint other_expenses_type_fkey foreign key (expense_type_id) references other_expense_types(id);
exception when duplicate_object then null; end $$;

alter table other_expenses drop column if exists type;
alter table other_expenses alter column expense_type_id set not null;
create index if not exists idx_other_expenses_type_id on other_expenses (expense_type_id);

-- ===== RLS（既存と同じ allow all 方針）=====
alter table cards enable row level security;
alter table other_expense_types enable row level security;
alter table app_settings enable row level security;

do $$ begin
  create policy "allow all" on cards for all using (true) with check (true);
  create policy "allow all" on other_expense_types for all using (true) with check (true);
  create policy "allow all" on app_settings for all using (true) with check (true);
exception when duplicate_object then null; end $$;
