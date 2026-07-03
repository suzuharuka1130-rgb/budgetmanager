-- カスタム通知（統合モデル）
-- 既定の2リマインダー（支出入力25日・クレジット入力月末）を custom_notifications へ移行し、
-- ユーザーが日付・文面を自由に設定できる通知として一元管理する。
-- multi_household.sql / reminder_templates.sql の実行後に適用してください。

-- ===== 1) カスタム通知テーブル =====
create table if not exists custom_notifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  content text not null,
  day_of_month text not null default '1',   -- '1'..'31' または 'last'（月末）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_cn_day check (
    day_of_month = 'last'
    or (day_of_month ~ '^[0-9]+$' and day_of_month::int between 1 and 31)
  )
);
create index if not exists idx_cn_household on custom_notifications (household_id);

-- household_id 自動補完トリガー（multi_household.sql の set_household_id を再利用）
drop trigger if exists trg_set_household on custom_notifications;
create trigger trg_set_household before insert on custom_notifications
  for each row execute function set_household_id();

-- RLS: 世帯分離（既存イディオムと同一）
alter table custom_notifications enable row level security;
drop policy if exists "household_isolation" on custom_notifications;
create policy "household_isolation" on custom_notifications
  using (household_id = get_my_household_id())
  with check (household_id = get_my_household_id());

-- ===== 2) ユーザーごとのオプトイン設定（行なし = ON） =====
create table if not exists custom_notification_prefs (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id uuid not null references custom_notifications(id) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);

alter table custom_notification_prefs enable row level security;
drop policy if exists "own prefs" on custom_notification_prefs;
create policy "own prefs" on custom_notification_prefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== 3) 既定リマインダーの移行（文面が設定済みの世帯のみ） =====
-- 支出入力リマインダー（毎月25日）
with migrated as (
  insert into custom_notifications (household_id, content, day_of_month)
    select household_id, value, '25'
    from app_settings
    where key = 'reminder_monthly_text' and coalesce(trim(value), '') <> ''
  returning id, household_id
)
insert into custom_notification_prefs (user_id, notification_id, enabled)
  select np.user_id, m.id, false
  from migrated m
  join household_members hm on hm.household_id = m.household_id
  join notification_preferences np on np.user_id = hm.user_id
  where np.monthly_reminder = false
on conflict (user_id, notification_id) do nothing;

-- クレジット入力リマインダー（月末）
with migrated as (
  insert into custom_notifications (household_id, content, day_of_month)
    select household_id, value, 'last'
    from app_settings
    where key = 'reminder_credit_text' and coalesce(trim(value), '') <> ''
  returning id, household_id
)
insert into custom_notification_prefs (user_id, notification_id, enabled)
  select np.user_id, m.id, false
  from migrated m
  join household_members hm on hm.household_id = m.household_id
  join notification_preferences np on np.user_id = hm.user_id
  where np.credit_input_reminder = false
on conflict (user_id, notification_id) do nothing;

-- ===== 4) 旧キーの削除（移行済みのため不要） =====
delete from app_settings where key in ('reminder_monthly_text', 'reminder_credit_text');
