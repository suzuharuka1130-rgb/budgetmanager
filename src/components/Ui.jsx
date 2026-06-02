import { useState } from 'react'
import { formatYen, CARD_TYPES, OTHER_EXPENSE_TYPES, monthLabel } from '../lib/helpers'
import { deleteIncome, deleteCardExpense, deleteOtherExpense } from '../lib/api'

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
export function EntryList({ income = [], cards = [], others = [], onRefresh }) {
  const [activeRowId, setActiveRowId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const rows = [
    ...income.map((r) => ({ id: 'i' + r.id, dbId: r.id, table: 'income', kind: '入金', label: '入金', amount: r.amount, note: r.note, color: '#0ea5e9', sign: '+' })),
    ...cards.map((r) => ({ id: 'c' + r.id, dbId: r.id, table: 'cards', kind: 'カード支出', label: CARD_TYPES[r.card_type]?.label || r.card_type, amount: r.amount, note: r.note, color: CARD_TYPES[r.card_type]?.color, sign: '-' })),
    ...others.map((r) => ({ id: 'o' + r.id, dbId: r.id, table: 'others', kind: 'その他支出', label: OTHER_EXPENSE_TYPES[r.type]?.label || r.type, amount: r.amount, note: r.note, color: '#6b7280', sign: '-' })),
  ]

  async function handleDelete(e, r) {
    e.stopPropagation()
    const confirmation = window.confirm(`${r.kind}「${r.label}${r.note ? ` (${r.note})` : ''}」を削除してもよろしいですか？`)
    if (!confirmation) return

    setDeletingId(r.id)
    try {
      if (r.table === 'income') {
        await deleteIncome(r.dbId)
      } else if (r.table === 'cards') {
        await deleteCardExpense(r.dbId)
      } else if (r.table === 'others') {
        await deleteOtherExpense(r.dbId)
      }
      if (onRefresh) onRefresh()
    } catch (err) {
      alert('削除に失敗しました: ' + (err.message || String(err)))
    } finally {
      setDeletingId(null)
    }
  }

  function handleRowClick(id) {
    setActiveRowId((prev) => (prev === id ? null : id))
  }

  if (rows.length === 0) return <p className="muted">明細はありません。</p>

  return (
    <ul className="entry-list">
      {rows.map((r) => (
        <li
          key={r.id}
          className={`entry-item ${activeRowId === r.id ? 'active' : ''}`}
          onClick={() => handleRowClick(r.id)}
        >
          <span className="dot" style={{ background: r.color }} />
          <span className="entry-kind">{r.kind}</span>
          <span className="entry-label">{r.label}</span>
          <span className="entry-note muted">{r.note || ''}</span>
          <div className="entry-right">
            <span className="entry-amount" style={{ color: r.sign === '+' ? '#0ea5e9' : '#111' }}>
              {r.sign}{formatYen(r.amount)}
            </span>
            {onRefresh && (
              <button
                className="entry-delete-btn"
                onClick={(e) => handleDelete(e, r)}
                disabled={deletingId === r.id}
                title="削除"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function MonthHeading({ year, month }) {
  return <h2 className="month-heading">{monthLabel(year, month)}</h2>
}
