-- セキュリティ強化（世帯間のデータ分離の穴を塞ぐ）
-- Supabase の SQL Editor で1回実行してください（再実行しても安全）。
-- multi_household.sql / add_receipt_image.sql の実行後に適用してください。
--
-- ⚠️ 適用順: 先にフロントエンド（uploadReceipt が「<世帯ID>/...」パスで保存する版）を
-- デプロイしてから実行すること。旧フロントのままこれを実行すると、旧形式パスでの
-- 新規アップロードが拒否され、レシート画像の添付が失敗する。

-- ===== 1) レシート画像: 世帯ごとに分離 =====
-- 旧ポリシーは bucket_id だけを見ていたため、ログイン済みなら誰でも全世帯の画像を
-- 一覧・閲覧・上書き・削除できた。
-- 新パス「<世帯ID>/<ファイル名>」は先頭フォルダで判定する。
-- 既存の旧形式パス（フォルダなし）は移動せず、自世帯の card_expenses から参照されている
-- 画像に限り閲覧・削除を許可する（既存明細の画像表示をそのまま維持するため）。
-- 新規アップロードは新パスのみ許可する。
create index if not exists idx_ce_receipt_image on card_expenses (receipt_image_url)
  where receipt_image_url is not null;

drop policy if exists "receipts authenticated all" on storage.objects;
drop policy if exists "receipts household read" on storage.objects;
drop policy if exists "receipts household delete" on storage.objects;
drop policy if exists "receipts household insert" on storage.objects;
drop policy if exists "receipts household update" on storage.objects;

create policy "receipts household read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts' and (
      (storage.foldername(name))[1] = get_my_household_id()::text
      or exists (
        select 1 from public.card_expenses ce
        where ce.receipt_image_url = storage.objects.name
          and ce.household_id = get_my_household_id()
      )
    )
  );

create policy "receipts household delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts' and (
      (storage.foldername(name))[1] = get_my_household_id()::text
      or exists (
        select 1 from public.card_expenses ce
        where ce.receipt_image_url = storage.objects.name
          and ce.household_id = get_my_household_id()
      )
    )
  );

create policy "receipts household insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = get_my_household_id()::text
  );

create policy "receipts household update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = get_my_household_id()::text
  )
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = get_my_household_id()::text
  );

-- ===== 2) household_members: 更新できる列を line_user_id のみに制限 =====
-- 旧ポリシー "update own membership" は行の所有者（user_id）しか見ていないため、
-- 自分の行の household_id を書き換えて他世帯へ移る・role を owner にする、が可能だった。
-- アプリが直接更新するのは設定画面の LINE ユーザーID（line_user_id）だけ。
-- LINE連携コードの発行（create_line_link_code）は SECURITY DEFINER、Webhook は
-- service role で動くため、この制限の影響を受けない。
revoke update on public.household_members from authenticated, anon;
grant update (line_user_id) on public.household_members to authenticated;

-- 確認:
--   select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects';
--   select grantee, privilege_type, column_name from information_schema.column_privileges
--     where table_name = 'household_members' and privilege_type = 'UPDATE';
