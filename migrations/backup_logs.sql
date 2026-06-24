-- 自動バックアップのログ + 復元RPC
-- Supabase の SQL Editor で1回だけ実行してください。
-- マルチ世帯RLS（multi_household.sql）の実行後に適用してください。

-- ===== 1) バックアップログ =====
create table if not exists backup_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null,                 -- 'success' / 'error'
  filename text,
  file_size integer,                    -- バイト
  error_message text,
  household_id uuid references households(id) on delete cascade
);

create index if not exists idx_backup_logs_household on backup_logs (household_id, created_at desc);

-- insert 時に household_id を自動補完（フロントからの手動実行用）。
-- daily-backup Edge Function は service role で household_id を明示指定するためトリガーは発火しない。
drop trigger if exists trg_set_household on backup_logs;
create trigger trg_set_household before insert on backup_logs
  for each row execute function set_household_id();

-- ===== 2) RLS: 世帯分離（自世帯のログのみ閲覧可）=====
alter table backup_logs enable row level security;
do $$ begin
  drop policy if exists "household_isolation" on backup_logs;
  create policy "household_isolation" on backup_logs
    using (household_id = get_my_household_id())
    with check (household_id = get_my_household_id());
exception when duplicate_object then null; end $$;

-- ===== 3) 復元RPC（SECURITY DEFINER / 単一トランザクション）=====
-- バックアップJSON（{ tables: { ... } }）を受け取り、呼び出しユーザーの世帯の
-- データテーブルを「全削除 → 再投入」する。全行の household_id は現在の世帯に再割当て。
-- 関数全体が1トランザクションのため、途中でエラーが起きれば全てロールバックされる
-- （部分復元は発生しない）。
-- households / household_members / backup_logs は対象外（世帯構造を壊さないため）。
create or replace function restore_household_data(p_data jsonb)
returns jsonb language plpgsql security definer as $$
declare
  hid uuid := get_my_household_id();
  tbls jsonb := p_data->'tables';
  n_cards int; n_types int; n_inc int; n_ce int; n_oe int; n_ab int; n_as int;
begin
  if hid is null then raise exception 'no_household'; end if;
  if tbls is null then raise exception 'invalid_backup'; end if;

  -- 子テーブルから削除（FK制約順）
  delete from card_expenses where household_id = hid;
  delete from other_expenses where household_id = hid;
  delete from monthly_income where household_id = hid;
  delete from account_balance where household_id = hid;
  delete from app_settings where household_id = hid;
  delete from cards where household_id = hid;
  delete from other_expense_types where household_id = hid;

  -- 親テーブルから再投入（cards / other_expense_types はIDを保持して参照整合性を維持）
  insert into cards (id, name, color, display_order, is_active, report_group, household_id)
  select (e->>'id')::uuid, e->>'name', coalesce(e->>'color', '#6b7280'),
         coalesce((e->>'display_order')::int, 0), coalesce((e->>'is_active')::boolean, true),
         coalesce(e->>'report_group', 'leisure'), hid
  from jsonb_array_elements(coalesce(tbls->'cards', '[]'::jsonb)) e;
  get diagnostics n_cards = row_count;

  insert into other_expense_types (id, name, color, display_order, is_active, report_group, household_id)
  select (e->>'id')::uuid, e->>'name', coalesce(e->>'color', '#6b7280'),
         coalesce((e->>'display_order')::int, 0), coalesce((e->>'is_active')::boolean, true),
         coalesce(e->>'report_group', '娯楽費'), hid
  from jsonb_array_elements(coalesce(tbls->'other_expense_types', '[]'::jsonb)) e;
  get diagnostics n_types = row_count;

  -- 子テーブル（bigint identity の id は再生成させるため挿入しない）
  insert into monthly_income (year, month, amount, note, confirmed, created_at, household_id)
  select (e->>'year')::int, (e->>'month')::int, (e->>'amount')::numeric, e->>'note',
         coalesce((e->>'confirmed')::boolean, true),
         coalesce((e->>'created_at')::timestamptz, now()), hid
  from jsonb_array_elements(coalesce(tbls->'monthly_income', '[]'::jsonb)) e;
  get diagnostics n_inc = row_count;

  insert into card_expenses (year, month, card_id, amount, note, confirmed, receipt_image_url, created_at, household_id)
  select (e->>'year')::int, (e->>'month')::int, (e->>'card_id')::uuid, (e->>'amount')::numeric,
         e->>'note', coalesce((e->>'confirmed')::boolean, true), e->>'receipt_image_url',
         coalesce((e->>'created_at')::timestamptz, now()), hid
  from jsonb_array_elements(coalesce(tbls->'card_expenses', '[]'::jsonb)) e;
  get diagnostics n_ce = row_count;

  insert into other_expenses (year, month, expense_type_id, amount, note, confirmed, created_at, household_id)
  select (e->>'year')::int, (e->>'month')::int, (e->>'expense_type_id')::uuid, (e->>'amount')::numeric,
         e->>'note', coalesce((e->>'confirmed')::boolean, true),
         coalesce((e->>'created_at')::timestamptz, now()), hid
  from jsonb_array_elements(coalesce(tbls->'other_expenses', '[]'::jsonb)) e;
  get diagnostics n_oe = row_count;

  insert into account_balance (year, month, balance, created_at, household_id)
  select (e->>'year')::int, (e->>'month')::int, (e->>'balance')::numeric,
         coalesce((e->>'created_at')::timestamptz, now()), hid
  from jsonb_array_elements(coalesce(tbls->'account_balance', '[]'::jsonb)) e;
  get diagnostics n_ab = row_count;

  insert into app_settings (key, value, household_id)
  select e->>'key', e->>'value', hid
  from jsonb_array_elements(coalesce(tbls->'app_settings', '[]'::jsonb)) e;
  get diagnostics n_as = row_count;

  return jsonb_build_object(
    'cards', n_cards, 'other_expense_types', n_types, 'monthly_income', n_inc,
    'card_expenses', n_ce, 'other_expenses', n_oe, 'account_balance', n_ab, 'app_settings', n_as
  );
end $$;
grant execute on function restore_household_data(jsonb) to authenticated;
