-- 招待コード・LINE連携コードの乱数強化 + SECURITY DEFINER 関数の search_path 固定
-- Supabase の SQL Editor で1回実行してください（再実行しても安全）。
-- multi_household.sql / backup_logs.sql の実行後に適用してください。
-- フロントエンド・Edge Functions の変更は不要で、適用順の制約もありません。

-- ===== 1) コード生成を暗号学的に安全な乱数へ =====
-- 旧実装の md5(random()::text || clock_timestamp()::text) は random() が暗号用途向けでなく
-- 推測されうる。gen_random_uuid()（v4, 暗号学的乱数）の先頭12桁は全て乱数なので、
-- そこから必要な桁数を切り出す。桁数は画面表示（招待「8桁」/ LINE 6桁）に合わせて据え置き。
create or replace function create_invite()
returns text language plpgsql security definer
set search_path = public, pg_temp as $$
declare hid uuid := get_my_household_id(); c text; uid uuid := auth.uid();
begin
  if hid is null then raise exception 'no_household'; end if;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into household_invites (household_id, code, created_by, expires_at)
    values (hid, c, uid, now() + interval '7 days');
  return c;
end $$;
grant execute on function create_invite() to authenticated;

create or replace function create_line_link_code()
returns text language plpgsql security definer
set search_path = public, pg_temp as $$
declare hid uuid := get_my_household_id(); c text; uid uuid := auth.uid();
begin
  if hid is null then raise exception 'no_household'; end if;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  update household_members set line_link_code = c, line_link_expires = now() + interval '30 minutes'
    where user_id = uid and household_id = hid;
  return c;
end $$;
grant execute on function create_line_link_code() to authenticated;

-- ===== 2) 残りの SECURITY DEFINER 関数の search_path を固定 =====
-- search_path が未固定だと、関数内の非修飾テーブル名が呼び出し側の search_path で
-- 解決され、別スキーマの同名オブジェクトにすり替えられる余地がある（Supabase の
-- Security Advisor が警告する項目）。本体は変更せず属性だけを付与する。
-- 未作成の関数（該当マイグレーション未適用）はスキップする。
do $$
declare f text;
begin
  foreach f in array array[
    'public.get_my_household_id()',
    'public.set_household_id()',
    'public.create_household(text)',
    'public.redeem_invite(text)',
    'public.restore_household_data(jsonb)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('alter function %s set search_path = public, pg_temp', f);
    end if;
  end loop;
end $$;

-- 確認（7件すべてに search_path=public, pg_temp が付いていること）:
--   select proname, proconfig from pg_proc
--   where pronamespace = 'public'::regnamespace and prosecdef order by proname;
