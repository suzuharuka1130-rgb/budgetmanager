import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { formatYen, CARD_TYPES, OTHER_EXPENSE_TYPES, monthLabel } from '../lib/helpers'
import {
  deleteIncome, deleteCardExpense, deleteOtherExpense,
  confirmIncome, confirmCardExpense, confirmOtherExpense,
} from '../lib/api'
import Modal from './Modal'
import { Button } from './ui/button'

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
  const [confirmingId, setConfirmingId] = useState(null)

  const pending = (r) => r.confirmed === false
  const rows = [
    ...income.map((r) => ({ id: 'i' + r.id, dbId: r.id, table: 'income', kind: '入金', label: '入金', amount: r.amount, note: r.note, color: '#0ea5e9', sign: '+', pending: pending(r) })),
    ...cards.map((r) => ({ id: 'c' + r.id, dbId: r.id, table: 'cards', kind: 'カード支出', label: CARD_TYPES[r.card_type]?.label || r.card_type, amount: r.amount, note: r.note, color: CARD_TYPES[r.card_type]?.color, sign: '-', pending: pending(r) })),
    ...others.map((r) => ({ id: 'o' + r.id, dbId: r.id, table: 'others', kind: 'その他支出', label: OTHER_EXPENSE_TYPES[r.type]?.label || r.type, amount: r.amount, note: r.note, color: '#6b7280', sign: '-', pending: pending(r) })),
  ]

  async function performConfirm(r) {
    setConfirmingId(r.id)
    try {
      if (r.table === 'income') {
        await confirmIncome(r.dbId)
      } else if (r.table === 'cards') {
        await confirmCardExpense(r.dbId)
      } else if (r.table === 'others') {
        await confirmOtherExpense(r.dbId)
      }
      if (onRefresh) onRefresh()
    } catch (err) {
      alert('確定に失敗しました: ' + (err.message || String(err)))
    } finally {
      setConfirmingId(null)
    }
  }

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
        <AnimatePresence initial={false}>
          {rows.map((r, i) => (
            <motion.li
              key={r.id}
              className={'entry-item' + (r.pending ? ' pending' : '')}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.025, 0.2) }}
            >
              <span className="dot" style={{ background: r.color }} />
              <div className="entry-main">
                <div className="entry-head">
                  <span className="entry-kind">{r.kind}</span>
                  <span className="entry-label">{r.label}</span>
                  {r.pending && <span className="entry-badge">未確定</span>}
                </div>
                {r.note && <span className="entry-note muted">{r.note}</span>}
              </div>
              <span className="entry-amount" style={{ color: r.pending ? '#9b9a97' : (r.sign === '+' ? '#0ea5e9' : '#111') }}>
                {r.sign}{formatYen(r.amount)}
              </span>
              {onRefresh && r.pending && (
                <button
                  type="button"
                  className="entry-confirm-btn"
                  onClick={() => performConfirm(r)}
                  disabled={confirmingId === r.id}
                  title="確定して口座残高に反映"
                >
                  {confirmingId === r.id ? '...' : '確定'}
                </button>
              )}
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
            </motion.li>
          ))}
        </AnimatePresence>
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
              <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmRow(null)} disabled={!!deletingId}>
                キャンセル
              </Button>
              <Button type="button" variant="danger" className="flex-1" onClick={() => performDelete(confirmRow)} disabled={!!deletingId}>
                {deletingId ? '削除中...' : '削除する'}
              </Button>
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
