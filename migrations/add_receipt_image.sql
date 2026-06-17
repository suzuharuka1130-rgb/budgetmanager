-- レシート/明細画像アップロード機能のためのマイグレーション
-- Supabase の SQL Editor で1回実行してください。

-- 1) card_expenses に画像パス列を追加
alter table card_expenses add column if not exists receipt_image_url text;

-- 2) 非公開ストレージバケット receipts を作成
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- 3) ログイン済みユーザーが receipts バケットを読み書きできるポリシー
do $$ begin
  create policy "receipts authenticated all" on storage.objects
    for all to authenticated
    using (bucket_id = 'receipts')
    with check (bucket_id = 'receipts');
exception when duplicate_object then null; end $$;
