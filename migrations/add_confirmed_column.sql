-- 既存データベースに「確定（confirmed）」列を追加するマイグレーション
-- Supabase の SQL Editor で1回実行してください。
-- default true のため、既存の明細はすべて「確定済み」として扱われます。
-- 未来月で新規入力した明細のみ confirmed=false（確定待ち）になります。

alter table monthly_income add column if not exists confirmed boolean not null default true;
alter table card_expenses  add column if not exists confirmed boolean not null default true;
alter table other_expenses add column if not exists confirmed boolean not null default true;
