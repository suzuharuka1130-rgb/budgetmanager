-- 複数世帯（マルチテナント）対応 + RLS によるデータ分離
-- Supabase の SQL Editor で1回だけ実行してください。
-- 既存データはすべて初期世帯に割り当てられます。

-- ===== 1) 世帯テーブル =====
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text,
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,                        -- 表示用（join時に保存）
  role text not null default 'member',
  line_user_id text,                 -- このメンバーのLINEユーザーID（通知先）
  line_link_code text,               -- LINE自動連携用の一時コード
  line_link_expires timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create table if not exists household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  code text not null unique,
  created_by uuid references auth.users(id),
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

-- ===== 2) 初期世帯を作成し、既存ユーザーを全員リンク =====
do $$
declare hid uuid;
begin
  if not exists (select 1 from households) then
    insert into households (name) values ('Haruka & Chisato') returning id into hid;
    insert into household_members (household_id, user_id, role)
      select hid, id, 'owner' from auth.users
      on conflict (household_id, user_id) do nothing;
  end if;
  -- メール表示用をバックフィル
  update household_members hm set email = u.email from auth.users u where hm.user_id = u.id and hm.email is null;
  -- 既知ユーザーのLINE IDをシード（メール一致）
  update household_members hm set line_user_id = 'U06b5e2f11b0489be9c940e6862d7fec0'
    from auth.users u
    where hm.user_id = u.id and lower(u.email) = 'suzu.haruka1130@gmail.com'
      and hm.line_user_id is null;
end $$;

-- ===== 3) 既存テーブルに household_id を追加し、バックフィル =====
do $$
declare hid uuid := (select id from households order by created_at limit 1);
declare t text;
begin
  foreach t in array array['monthly_income','card_expenses','other_expenses','account_balance','cards','other_expense_types']
  loop
    execute format('alter table %I add column if not exists household_id uuid references households(id)', t);
    execute format('update %I set household_id = %L where household_id is null', t, hid);
    execute format('alter table %I alter column household_id set not null', t);
  end loop;
end $$;

-- app_settings は主キーを (household_id, key) に変更
alter table app_settings add column if not exists household_id uuid references households(id);
update app_settings set household_id = (select id from households order by created_at limit 1) where household_id is null;
alter table app_settings alter column household_id set not null;
do $$ begin
  alter table app_settings drop constraint if exists app_settings_pkey;
exception when others then null; end $$;
do $$ begin
  alter table app_settings add primary key (household_id, key);
exception when others then null; end $$;

create index if not exists idx_mi_household on monthly_income (household_id);
create index if not exists idx_ce_household on card_expenses (household_id);
create index if not exists idx_oe_household on other_expenses (household_id);
create index if not exists idx_ab_household on account_balance (household_id);
create index if not exists idx_cards_household on cards (household_id);
create index if not exists idx_oet_household on other_expense_types (household_id);

-- ===== 4) ヘルパー関数 =====
create or replace function get_my_household_id()
returns uuid language sql security definer stable as $$
  select household_id from household_members where user_id = auth.uid() limit 1;
$$;
grant execute on function get_my_household_id() to authenticated, anon;

-- insert 時に household_id を自動補完するトリガー
create or replace function set_household_id()
returns trigger language plpgsql security definer as $$
begin
  if new.household_id is null then new.household_id := get_my_household_id(); end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['monthly_income','card_expenses','other_expenses','account_balance','cards','other_expense_types','app_settings']
  loop
    execute format('drop trigger if exists trg_set_household on %I', t);
    execute format('create trigger trg_set_household before insert on %I for each row execute function set_household_id()', t);
  end loop;
end $$;

-- ===== 5) RLS: 世帯分離 =====
do $$
declare t text;
begin
  foreach t in array array['monthly_income','card_expenses','other_expenses','account_balance','cards','other_expense_types','app_settings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "allow all" on %I', t);
    execute format('drop policy if exists "household_isolation" on %I', t);
    execute format($f$create policy "household_isolation" on %I
      using (household_id = get_my_household_id())
      with check (household_id = get_my_household_id())$f$, t);
  end loop;
end $$;

-- households / members / invites の RLS
alter table households enable row level security;
alter table household_members enable row level security;
alter table household_invites enable row level security;

do $$ begin
  create policy "read own household" on households
    for select using (id = get_my_household_id());
  create policy "read household members" on household_members
    for select using (user_id = auth.uid() or household_id = get_my_household_id());
  create policy "update own membership" on household_members
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  create policy "manage household invites" on household_invites
    for all using (household_id = get_my_household_id()) with check (household_id = get_my_household_id());
exception when duplicate_object then null; end $$;

-- ===== 6) RPC（SECURITY DEFINER）=====
create or replace function create_household(p_name text)
returns uuid language plpgsql security definer as $$
declare hid uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  insert into households (name) values (coalesce(nullif(trim(p_name), ''), 'My Household')) returning id into hid;
  insert into household_members (household_id, user_id, role, email)
    values (hid, uid, 'owner', (select email from auth.users where id = uid));
  insert into cards (household_id, name, color, display_order, report_group) values
    (hid, '固定費', '#2563eb', 1, 'housing'),
    (hid, '生活費', '#16a34a', 2, 'housing'),
    (hid, '変動費', '#db2777', 3, 'leisure');
  insert into other_expense_types (household_id, name, color, display_order) values
    (hid, '現金引き出し', '#6b7280', 1),
    (hid, '振込', '#6b7280', 2),
    (hid, 'その他', '#6b7280', 3);
  insert into app_settings (household_id, key, value) values (hid, 'app_title', 'Kakeibo');
  return hid;
end $$;
grant execute on function create_household(text) to authenticated;

create or replace function redeem_invite(p_code text)
returns uuid language plpgsql security definer as $$
declare inv household_invites; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from household_invites
    where code = upper(trim(p_code)) and used = false and expires_at > now() limit 1;
  if inv.id is null then raise exception 'invalid_or_expired'; end if;
  insert into household_members (household_id, user_id, role, email)
    values (inv.household_id, uid, 'member', (select email from auth.users where id = uid))
    on conflict (household_id, user_id) do nothing;
  update household_invites set used = true where id = inv.id;
  return inv.household_id;
end $$;
grant execute on function redeem_invite(text) to authenticated;

create or replace function create_invite()
returns text language plpgsql security definer as $$
declare hid uuid := get_my_household_id(); c text; uid uuid := auth.uid();
begin
  if hid is null then raise exception 'no_household'; end if;
  c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  insert into household_invites (household_id, code, created_by, expires_at)
    values (hid, c, uid, now() + interval '7 days');
  return c;
end $$;
grant execute on function create_invite() to authenticated;

-- LINE自動連携用コードを発行（自分のメンバー行に保存）
create or replace function create_line_link_code()
returns text language plpgsql security definer as $$
declare hid uuid := get_my_household_id(); c text; uid uuid := auth.uid();
begin
  if hid is null then raise exception 'no_household'; end if;
  c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  update household_members set line_link_code = c, line_link_expires = now() + interval '30 minutes'
    where user_id = uid and household_id = hid;
  return c;
end $$;
grant execute on function create_line_link_code() to authenticated;
