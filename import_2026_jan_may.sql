-- 2026年1月〜5月の実績データ取込
-- Supabase の SQL Editor で1回だけ実行してください（複数回実行すると重複します）。
-- マッピング: スターツ=fixed / Olive=daily / 楽天Pink=other
--             現金引き出し=cash_withdrawal / その他引き落とし=other
--             account_balance は月末残高を記録

-- ===== 入金（monthly_income）=====
insert into monthly_income (year, month, amount, note) values
  (2026, 1, 150000, 'Haruka 入金額'),
  (2026, 1, 120000, 'Chichan 入金額'),
  (2026, 2, 140625, 'Haruka 入金額'),
  (2026, 2, 120000, 'Chichan 入金額'),
  (2026, 2,   5028, 'その他入金'),
  (2026, 3, 150000, 'Haruka 入金額'),
  (2026, 3, 120000, 'Chichan 入金額'),
  (2026, 3,   2700, 'その他入金'),
  (2026, 4, 165000, 'Haruka 入金額'),
  (2026, 4, 170000, 'Chichan 入金額'),
  (2026, 5, 190000, 'Haruka 入金額'),
  (2026, 5, 170000, 'Chichan 入金額');

-- ===== カード支出（card_expenses）=====
insert into card_expenses (year, month, card_type, amount, note) values
  -- 固定費（スターツ）
  (2026, 1, 'fixed', 158616, 'スターツ'),
  (2026, 2, 'fixed', 148190, 'スターツ'),
  (2026, 3, 'fixed', 167838, 'スターツ'),
  (2026, 4, 'fixed', 148190, 'スターツ'),
  (2026, 5, 'fixed', 165691, 'スターツ'),
  -- 生活費（Olive）
  (2026, 1, 'daily', 38857, 'Olive'),
  (2026, 2, 'daily', 29054, 'Olive'),
  (2026, 3, 'daily', 19685, 'Olive'),
  (2026, 4, 'daily', 35107, 'Olive'),
  (2026, 5, 'daily', 155755, 'Olive'),
  -- 娯楽費（楽天Pink）
  (2026, 1, 'other', 30913, '楽天Pink'),
  (2026, 2, 'other', 47815, '楽天Pink'),
  (2026, 3, 'other', 93019, '楽天Pink'),
  (2026, 4, 'other', 80882, '楽天Pink'),
  (2026, 5, 'other', 28798, '楽天Pink');

-- ===== その他支出（other_expenses）=====
insert into other_expenses (year, month, type, amount, note) values
  -- 現金引き出し
  (2026, 1, 'cash_withdrawal', 10000, '現金引き出し'),
  (2026, 2, 'cash_withdrawal', 20330, '現金引き出し'),
  (2026, 3, 'cash_withdrawal', 22330, '現金引き出し'),
  (2026, 4, 'cash_withdrawal', 40000, '現金引き出し'),
  (2026, 5, 'cash_withdrawal', 50660, '現金引き出し'),
  -- その他引き落とし（2月は0円のため無し）
  (2026, 1, 'other', 6630, 'その他引き落とし'),
  (2026, 3, 'other', 6044, 'その他引き落とし'),
  (2026, 4, 'other',  848, 'その他引き落とし'),
  (2026, 5, 'other',  719, 'その他引き落とし');

-- ===== 口座残高スナップショット（account_balance / 月末残高）=====
insert into account_balance (year, month, balance) values
  (2026, 1, 460099),
  (2026, 2, 480363),
  (2026, 3, 444147),
  (2026, 4, 474120),
  (2026, 5, 432497);
