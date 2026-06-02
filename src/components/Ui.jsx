import { formatYen, CARD_TYPES, OTHER_EXPENSE_TYPES, monthLabel } from '../lib/helpers'

export function StatCard({ label, value, color, accent }) {
  return (
    <div className="stat-card" style={accent ? { borderBottomColor: color } : undefined}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
    </div>
  )
}

export function Loading({ text = '読み込み中...' }) {
  return <div className="state-msg">{text}</div>
}

export function ErrorMsg({ error }) {
  if (!error) return null
  return <div className="state-msg error">エラー: {error.message || String(error)}</div>
}

// 月内の全明細を1つのリストにまとめて表示
export function EntryList({ income = [], cards = [], others = [] }) {
  const rows = [
    ...income.map((r) => ({ id: 'i' + r.id, kind: '収入', label: '入金', amount: r.amount, note: r.note, color: '#0ea5e9', sign: '+' })),
    ...cards.map((r) => ({ id: 'c' + r.id, kind: 'カード支出', label: CARD_TYPES[r.card_type]?.label || r.card_type, amount: r.amount, note: r.note, color: CARD_TYPES[r.card_type]?.color, sign: '-' })),
    ...others.map((r) => ({ id: 'o' + r.id, kind: 'その他支出', label: OTHER_EXPENSE_TYPES[r.type]?.label || r.type, amount: r.amount, note: r.note, color: '#6b7280', sign: '-' })),
  ]

  if (rows.length === 0) return <p className="muted">明細はありません。</p>

  return (
    <ul className="entry-list">
      {rows.map((r) => (
        <li key={r.id}>
          <span className="dot" style={{ background: r.color }} />
          <span className="entry-kind">{r.kind}</span>
          <span className="entry-label">{r.label}</span>
          <span className="entry-note muted">{r.note || ''}</span>
          <span className="entry-amount" style={{ color: r.sign === '+' ? '#0ea5e9' : '#111' }}>
            {r.sign}{formatYen(r.amount)}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function MonthHeading({ year, month }) {
  return <h2 className="month-heading">{monthLabel(year, month)}</h2>
}
