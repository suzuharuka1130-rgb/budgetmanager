import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { formatYen, monthLabel } from '../lib/helpers'
import {
  deleteIncome, deleteCardExpense, deleteOtherExpense,
  confirmIncome, confirmCardExpense, confirmOtherExpense,
  getReceiptSignedUrl, fetchCardExpenseTransactions, fetchOtherExpenseTransactions,
} from '../lib/api'
import { useMeta } from '../lib/meta'
import Modal from './Modal'
import { Button } from './ui/button'

export function StatCard({ label, value, color, accent, layout }) {
  const isRow = layout === 'row'
  return (
    <div className={`stat-card ${isRow ? 'row-layout' : ''}`} style={accent ? { borderBottomColor: color } : undefined}>
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
  const { cardName, cardColor, typeName, typeColor } = useMeta()
  const [deletingId, setDeletingId] = useState(null)
  const [confirmRow, setConfirmRow] = useState(null)
  const [deleteError, setDeleteError] = useState(null)
  const [confirmingId, setConfirmingId] = useState(null)
  const [details, setDetails] = useState(null) // { cardExpenseId, receiptPath, label, amount }

  const pending = (r) => r.confirmed === false
  const rows = [
    ...income.map((r) => ({ id: 'i' + r.id, dbId: r.id, table: 'income', kind: '入金', label: '入金', amount: r.amount, note: r.note, color: '#0ea5e9', sign: '+', pending: pending(r), sortDate: r.created_at, tieBreakDate: r.created_at })),
    ...cards.map((r) => ({ id: 'c' + r.id, dbId: r.id, table: 'cards', kind: 'カード支出', label: cardName(r.card_id), amount: r.amount, note: r.note, color: cardColor(r.card_id), sign: '-', pending: pending(r), receiptPath: r.receipt_image_url, expenseId: r.id, txnKind: 'card', detailable: !!r.has_transactions || !!r.receipt_image_url, sortDate: r.entry_date, tieBreakDate: r.created_at })),
    ...others.map((r) => ({ id: 'o' + r.id, dbId: r.id, table: 'others', kind: 'その他支出', label: typeName(r.expense_type_id), amount: r.amount, note: r.note, color: typeColor(r.expense_type_id), sign: '-', pending: pending(r), expenseId: r.id, txnKind: 'other', detailable: !!r.has_transactions, sortDate: r.entry_date, tieBreakDate: r.created_at })),
  ].sort((a, b) => {
    const diff = new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()
    return diff !== 0 ? diff : new Date(b.tieBreakDate).getTime() - new Date(a.tieBreakDate).getTime()
  })

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
          {rows.map((r, i) => {
            const clickable = (r.table === 'cards' || r.table === 'others') && r.detailable
            const openDetails = () => setDetails({ expenseId: r.expenseId, txnKind: r.txnKind, receiptPath: r.receiptPath, label: r.label, amount: r.amount })
            return (
            <motion.li
              key={r.id}
              className={'entry-item' + (r.pending ? ' pending' : '') + (clickable ? ' entry-item--clickable' : '')}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.025, 0.2) }}
              onClick={clickable ? openDetails : undefined}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetails() } } : undefined}
            >
              <span className="dot" style={{ background: r.color }} />
              <div className="entry-main">
                <div className="entry-head">
                  <span className="entry-label">{r.label}</span>
                  {r.pending && <span className="entry-badge">未確定</span>}
                </div>
                {r.note && <span className="entry-note muted">{r.note}</span>}
              </div>
              <span className="entry-amount" style={{ color: r.pending ? 'var(--muted)' : (r.sign === '+' ? '#0ea5e9' : 'var(--text)') }}>
                {r.sign}{formatYen(r.amount)}
              </span>
              {onRefresh && r.pending && (
                <button
                  type="button"
                  className="entry-confirm-btn"
                  onClick={(e) => { e.stopPropagation(); performConfirm(r) }}
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
                  onClick={(e) => { e.stopPropagation(); setDeleteError(null); setConfirmRow(r) }}
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
            )
          })}
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

      <TransactionDetailsModal
        open={!!details}
        onClose={() => setDetails(null)}
        expenseId={details?.expenseId}
        txnKind={details?.txnKind}
        receiptPath={details?.receiptPath}
        label={details?.label}
        amount={details?.amount}
      />
    </>
  )
}

// 'YYYY-MM-DD' を 'MM/DD' 表示に変換する
function formatTxnDate(isoDate) {
  if (!isoDate) return ''
  const [, m, d] = isoDate.split('-')
  return m && d ? `${m}/${d}` : isoDate
}

// カード支出・その他支出の取引一覧（＋カードのみスクリーンショット）を表示する（閲覧専用）モーダル
function TransactionDetailsModal({ open, onClose, expenseId, txnKind, receiptPath, label, amount }) {
  const [txns, setTxns] = useState(null) // null=未取得, []=空
  const [loadError, setLoadError] = useState(null)
  const [receipt, setReceipt] = useState(null) // { url, loading, error }

  useEffect(() => {
    if (!open || expenseId == null) return
    let alive = true
    setTxns(null)
    setLoadError(null)
    setReceipt(null)
    const fetchTxns = txnKind === 'other' ? fetchOtherExpenseTransactions : fetchCardExpenseTransactions
    fetchTxns(expenseId)
      .then((data) => { if (alive) setTxns(data) })
      .catch((err) => { if (alive) setLoadError(err.message || String(err)) })
    return () => { alive = false }
  }, [open, expenseId, txnKind])

  async function openReceipt() {
    setReceipt({ url: null, loading: true, error: null })
    try {
      const url = await getReceiptSignedUrl(receiptPath, 120)
      setReceipt({ url, loading: false, error: null })
    } catch (err) {
      setReceipt({ url: null, loading: false, error: err.message || String(err) })
    }
  }

  const total = (txns || []).reduce((s, t) => s + Number(t.amount || 0), 0)

  return (
    <Modal open={open} title={label || '取引明細'} onClose={onClose}>
      {loadError && <p className="form-error">取引明細の取得に失敗しました: {loadError}</p>}
      {!loadError && txns === null && <p className="muted">読み込み中...</p>}
      {!loadError && txns && txns.length === 0 && <p className="muted">明細記録はありません。</p>}
      {!loadError && txns && txns.length > 0 && (
        <table className="txn-table">
          <thead>
            <tr><th>内容</th><th>日付</th><th className="txn-amount-col">金額</th></tr>
          </thead>
          <tbody>
            {txns.map((t) => (
              <tr key={t.id}>
                <td>{t.name || '—'}</td>
                <td className="muted">{formatTxnDate(t.txn_date) || '—'}</td>
                <td className="txn-amount-col">{formatYen(t.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td>合計</td><td></td><td className="txn-amount-col">{formatYen(total)}</td></tr>
          </tfoot>
        </table>
      )}

      {receiptPath && (
        <div className="txn-receipt">
          {!receipt && (
            <button type="button" className="btn" onClick={openReceipt}>スクリーンショットを表示</button>
          )}
          {receipt?.loading && <p className="muted">読み込み中...</p>}
          {receipt?.error && <p className="form-error">画像の取得に失敗しました: {receipt.error}</p>}
          {receipt?.url && <img className="receipt-full" src={receipt.url} alt="明細画像" />}
        </div>
      )}
    </Modal>
  )
}

export function MonthHeading({ year, month }) {
  return <h2 className="month-heading">{monthLabel(year, month)}</h2>
}
