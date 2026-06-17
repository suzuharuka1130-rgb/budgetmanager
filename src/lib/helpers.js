// 日付・通貨フォーマット等のユーティリティ
// カード/その他支出タイプは cards / other_expense_types テーブルで動的管理（meta.jsx 参照）

export const OTHER_COLOR = '#6b7280' // その他支出（集計）の色

export function formatYen(value) {
  const n = Number(value) || 0
  return '¥' + Math.round(n).toLocaleString('ja-JP')
}

export function currentYearMonth() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

// "2026-06" 形式の値とyear/monthの相互変換（input[type=month]用）
export function toMonthValue(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function fromMonthValue(value) {
  const [y, m] = value.split('-').map(Number)
  return { year: y, month: m }
}

export function monthLabel(year, month) {
  return `${year}年${month}月`
}

// 過去n ヶ月分の {year, month} 配列を古い順で返す
export function lastNMonths(n, from = currentYearMonth()) {
  const result = []
  let { year, month } = from
  for (let i = 0; i < n; i++) {
    result.unshift({ year, month })
    month -= 1
    if (month < 1) {
      month = 12
      year -= 1
    }
  }
  return result
}

// 明細が確定済みか（confirmed が明示的に false 以外なら確定とみなす）
export function isConfirmed(row) {
  return row?.confirmed !== false
}

// (year, month) が現在月より未来か（未来月の入力は確定待ちにする）
export function isFutureMonth(year, month, now = currentYearMonth()) {
  return year > now.year || (year === now.year && month > now.month)
}

// 合計（確定済みの明細のみ集計。未確定＝未来月の入力は除外）
export function sumAmount(rows) {
  return (rows || []).reduce((acc, r) => (isConfirmed(r) ? acc + Number(r.amount || 0) : acc), 0)
}

// 月キー（"2026-6"）。year/month から一意な文字列を作る。
export function monthKey(year, month) {
  return `${year}-${month}`
}

// startYear/startMonth から endYear/endMonth までの {year, month} 配列（両端含む・時系列順）
export function monthsInRange(startYear, startMonth, endYear, endMonth) {
  const result = []
  let y = startYear
  let m = startMonth
  while (y < endYear || (y === endYear && m <= endMonth)) {
    result.push({ year: y, month: m })
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return result
}

// 入金・カード支出・その他支出の配列から、月ごとの純増減（入金 − 支出）の Map を作る
export function netByMonthMap(income = [], cards = [], others = []) {
  const map = new Map()
  const add = (y, m, delta) => {
    const k = monthKey(y, m)
    map.set(k, (map.get(k) || 0) + delta)
  }
  // 口座残高の算出も確定済みの明細のみを対象にする
  for (const r of income) if (isConfirmed(r)) add(r.year, r.month, Number(r.amount || 0))
  for (const r of cards) if (isConfirmed(r)) add(r.year, r.month, -Number(r.amount || 0))
  for (const r of others) if (isConfirmed(r)) add(r.year, r.month, -Number(r.amount || 0))
  return map
}

// 手入力スナップショットを起点に、各月の口座残高の推移を算出する。
// スナップショットのある月はその値を採用（実測値）、無い月は前月残高 + 当月の純増減。
// months: 時系列順の [{year, month}]
export function buildBalanceSeries(months, snapshots = [], netByKey = new Map()) {
  const snapMap = new Map()
  for (const s of snapshots) {
    const k = monthKey(s.year, s.month)
    const prev = snapMap.get(k)
    if (!prev || (s.created_at || '') >= (prev.created_at || '')) snapMap.set(k, s)
  }
  let running = null
  return months.map(({ year, month }) => {
    const k = monthKey(year, month)
    if (snapMap.has(k)) {
      running = Number(snapMap.get(k).balance)
    } else if (running !== null) {
      running += netByKey.get(k) || 0
    }
    return { year, month, balance: running }
  })
}
