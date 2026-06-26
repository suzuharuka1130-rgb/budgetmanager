-- リマインダー文面の世帯ごとカスタマイズ + 新規ユーザーの通知初期値
-- Supabase の SQL Editor で1回だけ実行してください。
-- multi_household.sql の実行後に適用してください。
--
-- 仕様:
--  - 支出入力 / クレジット入力リマインダーの文面を世帯ごとに app_settings へ保存
--    （key: reminder_monthly_text / reminder_credit_text）。文面が空の世帯は送信しない。
--  - 既存の初期世帯（はるか＆ちぃ）には現在のハードコード文面をそのまま投入（編集可能な初期値）。
--  - 新規ユーザーは通知を初期OFF（月次レポートのみON、リマインダー2種はOFF）。

-- ===== 1) 初期世帯のリマインダー文面をシード（現在のハードコード文面と同一）=====
do $$
declare hid uuid := (select id from households order by created_at limit 1);
begin
  if hid is null then return; end if;
  insert into app_settings (household_id, key, value) values
    (hid, 'reminder_monthly_text',
     E'📅 支出入力リマインダー\n今月の支出をアプリに入力しましょう！\nカードの引き落とし日が近づいています。忘れずに記録してください。\n入金額：\n多い月　はるか16万　ちぃ14万\n少ない月　はるか14万　ちぃ13万')
  on conflict (household_id, key) do nothing;
  insert into app_settings (household_id, key, value) values
    (hid, 'reminder_credit_text',
     E'💳 クレジット入力リマインダー\n今月使用したクレジット金額を入力してください。\n対象月を来月に設定して、各カードの来月引き落とし予定の金額を入力。')
  on conflict (household_id, key) do nothing;
end $$;

-- ===== 2) 新規世帯作成時に通知初期値を投入（レポートON / リマインダーOFF）=====
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
  -- 新規ユーザーの通知初期値: 月次レポートON / リマインダー2種はOFF
  insert into notification_preferences (user_id, monthly_report, monthly_reminder, credit_input_reminder)
    values (uid, true, false, false)
    on conflict (user_id) do nothing;
  return hid;
end $$;
grant execute on function create_household(text) to authenticated;

-- ===== 3) 招待参加時も同じ通知初期値を投入 =====
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
  -- 新規ユーザーの通知初期値: 月次レポートON / リマインダー2種はOFF
  insert into notification_preferences (user_id, monthly_report, monthly_reminder, credit_input_reminder)
    values (uid, true, false, false)
    on conflict (user_id) do nothing;
  update household_invites set used = true where id = inv.id;
  return inv.household_id;
end $$;
grant execute on function redeem_invite(text) to authenticated;
