-- 未確定（confirmed=false）明細の編集機能のためのマイグレーション
-- Supabase の SQL Editor で1回実行してください。
-- card_expense_transactions.sql / other_expense_transactions.sql の実行後に適用してください。
--
-- 編集の保存は「明細本体の更新」＋「取引明細の全削除→再挿入」の3操作になる。
-- クライアントから順に呼ぶと、途中で失敗したときに本体だけ新しく取引明細は古いまま、
-- あるいは取引明細が丸ごと消えた状態が残ってしまう。1つのトランザクションで
-- 完結する関数にまとめて、失敗したら何も変わらないようにする。
--
-- security definer は付けない（＝invoker）。呼び出したユーザーの権限で実行されるので
-- 既存の RLS（household_isolation）がそのまま効き、他世帯の明細は参照も更新もできない。
-- 親明細が見つからない場合（他世帯・削除済み）と確定済みの場合はエラーにする。
--
-- 取引明細の挿入部分は2つの関数でほぼ同じだが、共通化すると対象テーブル名を引数に取る
-- 動的SQLになる。その関数を authenticated に開放すると任意のテーブルを指定できてしまうため、
-- あえて静的SQLのまま各関数に書く。

-- 初期版では取引明細だけを入れ替える関数を用意していたが、明細本体の更新まで
-- 同じトランザクションに含める必要があったため置き換えた。先に適用済みなら削除する。
drop function if exists replace_card_expense_transactions(bigint, jsonb);
drop function if exists replace_other_expense_transactions(bigint, jsonb);
drop function if exists replace_txn_rows(text, text, bigint, jsonb);

create or replace function update_pending_card_expense(
  p_id bigint,
  p_card_id uuid,
  p_amount numeric,
  p_note text,
  p_receipt_image_url text,
  p_rows jsonb
) returns void language plpgsql as $$
declare
  v_confirmed boolean;
begin
  select confirmed into v_confirmed from card_expenses where id = p_id for update;
  if not found then
    raise exception '明細が見つかりません。画面を更新してください。';
  end if;
  if v_confirmed then
    raise exception 'この明細はすでに確定済みです。画面を更新してください。';
  end if;

  update card_expenses
     set card_id = p_card_id,
         amount = p_amount,
         note = p_note,
         receipt_image_url = p_receipt_image_url
   where id = p_id;

  delete from card_expense_transactions where card_expense_id = p_id;

  -- household_id は trg_set_household トリガーが補完する
  insert into card_expense_transactions (card_expense_id, name, amount, txn_date, display_order)
  select
    p_id,
    coalesce(r ->> 'name', ''),
    coalesce((r ->> 'amount')::numeric, 0),
    nullif(r ->> 'txn_date', '')::date,
    (ord - 1)::int
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as t(r, ord);
end;
$$;

create or replace function update_pending_other_expense(
  p_id bigint,
  p_expense_type_id uuid,
  p_amount numeric,
  p_note text,
  p_rows jsonb
) returns void language plpgsql as $$
declare
  v_confirmed boolean;
begin
  select confirmed into v_confirmed from other_expenses where id = p_id for update;
  if not found then
    raise exception '明細が見つかりません。画面を更新してください。';
  end if;
  if v_confirmed then
    raise exception 'この明細はすでに確定済みです。画面を更新してください。';
  end if;

  update other_expenses
     set expense_type_id = p_expense_type_id,
         amount = p_amount,
         note = p_note
   where id = p_id;

  delete from other_expense_transactions where other_expense_id = p_id;

  insert into other_expense_transactions (other_expense_id, name, amount, txn_date, display_order)
  select
    p_id,
    coalesce(r ->> 'name', ''),
    coalesce((r ->> 'amount')::numeric, 0),
    nullif(r ->> 'txn_date', '')::date,
    (ord - 1)::int
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as t(r, ord);
end;
$$;

grant execute on function update_pending_card_expense(bigint, uuid, numeric, text, text, jsonb) to authenticated;
grant execute on function update_pending_other_expense(bigint, uuid, numeric, text, jsonb) to authenticated;

-- PostgREST のスキーマキャッシュを更新して、新しい関数をすぐ RPC から呼べるようにする
notify pgrst, 'reload schema';
