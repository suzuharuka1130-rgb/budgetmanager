// 日付・通貨フォーマット等のユーティリティ

export const CARD_TYPES = {
  fixed: { label: 'STARTS（家賃・ガス・水道・電気）', short: 'STARTS', color: '#2563eb' }, // blue
  daily: { label: 'Olive（生活費）', short: 'Olive', color: '#16a34a' },                 // green
  other: { label: 'Rakuten Pink（変動費）', short: 'Rakuten Pink', color: '#ea580c' },    // orange
}

export const OTHER_EXPENSE_TYPES = {
  cash_withdrawal: { label: '現金引き出し' },
  transfer: { label: '振込' },
  other: { label: 'その他' },
}

export const OTHER_COLOR = '#6b7280' // gray

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

export function sumAmount(rows) {
  return (rows || []).reduce((acc, r) => acc + Number(r.amount || 0), 0)
}
