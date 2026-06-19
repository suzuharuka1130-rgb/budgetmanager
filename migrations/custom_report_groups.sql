-- レポートグループをラベル文字列に統一し、カスタムグループを使えるようにする。
-- Supabase の SQL Editor で実行してください。

-- 既存の internal 値をラベルへ変換
update cards set report_group = '家賃＆生活費' where report_group = 'housing';
update cards set report_group = '娯楽費'       where report_group = 'leisure';

-- その他支出タイプにもレポートグループを追加（既定は娯楽費＝従来の集計挙動を維持）
alter table other_expense_types add column if not exists report_group text not null default '娯楽費';

-- 新規世帯のシードもラベルベースに更新
create or replace function create_household(p_name text)
returns uuid language plpgsql security definer as $$
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
  return hid;
end $$;
grant execute on function create_household(text) to authenticated;
