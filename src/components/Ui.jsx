import { useState } from 'react'
import { formatYen, CARD_TYPES, OTHER_EXPENSE_TYPES, monthLabel } from '../lib/helpers'
import { deleteIncome, deleteCardExpense, deleteOtherExpense } from '../lib/api'
import Modal from './Modal'

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
  const [deletingId, setDeletingId] = useState(null)
  const [confirmRow, setConfirmRow] = useState(null)
  const [deleteError, setDeleteError] = useState(null)

  const rows = [
    ...income.map((r) => ({ id: 'i' + r.id, dbId: r.id, table: 'income', kind: '入金', label: '入金', amount: r.amount, note: r.note, color: '#0ea5e9', sign: '+' })),
    ...cards.map((r) => ({ id: 'c' + r.id, dbId: r.id, table: 'cards', kind: 'カード支出', label: CARD_TYPES[r.card_type]?.label || r.card_type, amount: r.amount, note: r.note, color: CARD_TYPES[r.card_type]?.color, sign: '-' })),
    ...others.map((r) => ({ id: 'o' + r.id, dbId: r.id, table: 'others', kind: 'その他支出', label: OTHER_EXPENSE_TYPES[r.type]?.label || r.type, amount: r.amount, note: r.note, color: '#6b7280', sign: '-' })),
  ]

  async function performDelete(r) {
    setDeletingId(r.id)
    setDeleteError(null)
    try {
      if (r.table === 'income') {
        await deleteIncome(r.dbId)
      } else if (r.table === 'cards') {
        await deleteCardExpense(r.dbId)
      } else if (r.table === 'others') {
        await deleteOtherExpense(r.dbId)
      }
      setConfirmRow(null)
      if (onRefresh) onRefresh()
    } catch (err) {
      setDeleteError(err.message || String(err))
    } finally {
      setDeletingId(null)
    }
  }

  if (rows.length === 0) return <p className="muted">明細はありません。</p>

  return (
    <>
      <ul className="entry-list">
        {rows.map((r) => (
          <li key={r.id} className="entry-item">
            <span className="dot" style={{ background: r.color }} />
            <div className="entry-main">
              <div className="entry-head">
                <span className="entry-kind">{r.kind}</span>
                <span className="entry-label">{r.label}</span>
              </div>
              {r.note && <span className="entry-note muted">{r.note}</span>}
            </div>
            <span className="entry-amount" style={{ color: r.sign === '+' ? '#0ea5e9' : '#111' }}>
              {r.sign}{formatYen(r.amount)}
            </span>
            {onRefresh && (
              <button
                type="button"
                className="entry-delete-btn"
                onClick={() => { setDeleteError(null); setConfirmRow(r) }}
                aria-label="削除"
                title="削除"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            )}
          </li>
        ))}
      </ul>

      <Modal open={!!confirmRow} title="削除の確認" onClose={() => deletingId ? null : setConfirmRow(null)}>
        {confirmRow && (
          <div className="confirm-body">
            <p>
              {confirmRow.kind}「{confirmRow.label}{confirmRow.note ? `（${confirmRow.note}）` : ''}」
              <br />{confirmRow.sign}{formatYen(confirmRow.amount)} を削除してもよろしいですか？
            </p>
            {deleteError && <p className="form-error">削除に失敗しました: {deleteError}</p>}
            <div className="confirm-actions">
              <button type="button" className="btn" onClick={() => setConfirmRow(null)} disabled={!!deletingId}>
                キャンセル
              </button>
              <button type="button" className="btn danger" onClick={() => performDelete(confirmRow)} disabled={!!deletingId}>
                {deletingId ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

export function MonthHeading({ year, month }) {
  return <h2 className="month-heading">{monthLabel(year, month)}</h2>
}
