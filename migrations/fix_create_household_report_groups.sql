-- 新規世帯の既定カードを日本語のレポートグループに戻す。
-- Supabase の SQL Editor で1回だけ実行してください（再実行しても安全）。
-- reminder_templates.sql の実行後に適用してください。
--
-- 背景:
--   reminder_templates.sql が create_household を再定義したとき、
--   custom_report_groups.sql より古いシード（housing / leisure）を持ち込んだ。
--   それ以降に新規作成された世帯の既定カード（固定費・生活費・変動費）が
--   英語ラベルになり、LINE 月次レポートの見出しと設定のグループ一覧に出る。
--
-- 適用前の確認（影響がある世帯だけ行が返る）:
--   select household_id, report_group, count(*)
--   from cards
--   where report_group in ('housing', 'leisure')
--   group by 1, 2;

create or replace function create_household(p_name text)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare hid uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  insert into households (name) values (coalesce(nullif(trim(p_name), ''), 'My Household')) returning id into hid;
  insert into household_members (household_id, user_id, role, email)
    values (hid, uid, 'owner', (select email from auth.users where id = uid));
  insert into cards (household_id, name, color, display_order, report_group) values
    (hid, '固定費', '#2563eb', 1, '家賃＆生活費'),
    (hid, '生活費', '#16a34a', 2, '家賃＆生活費'),
    (hid, '変動費', '#db2777', 3, '娯楽費');
  insert into other_expense_types (household_id, name, color, display_order, report_group) values
    (hid, '現金引き出し', '#6b7280', 1, '娯楽費'),
    (hid, '振込', '#6b7280', 2, '娯楽費'),
    (hid, 'その他', '#6b7280', 3, '娯楽費');
  insert into app_settings (household_id, key, value) values (hid, 'app_title', 'Kakeibo');
  -- 新規ユーザーの通知初期値: 月次レポートON / リマインダー2種はOFF
  insert into notification_preferences (user_id, monthly_report, monthly_reminder, credit_input_reminder)
    values (uid, true, false, false)
    on conflict (user_id) do nothing;
  return hid;
end $$;
grant execute on function create_household(text) to authenticated;

-- 既に英語ラベルで作られたカードを直す。other_expense_types は列の既定値が
-- '娯楽費' なので、report_group を省略した挿入でも正しい値になっている。
update cards set report_group = '家賃＆生活費' where report_group = 'housing';
update cards set report_group = '娯楽費' where report_group = 'leisure';
