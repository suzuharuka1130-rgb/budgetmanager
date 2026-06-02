import { useEffect, useState, useCallback } from 'react'
import { fetchMonth } from '../lib/api'
import { currentYearMonth, formatYen, monthLabel, sumAmount, CARD_TYPES, OTHER_COLOR } from '../lib/helpers'
import { StatCard, Loading, ErrorMsg, EntryList } from '../components/Ui'
import Modal from '../components/Modal'
import { IncomeForm, CardExpenseForm, OtherExpenseForm } from '../components/EntryForms'

export default function ThisMonth() {
  const { year, month } = currentYearMonth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null) // 'income' | 'card' | 'other'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchMonth(year, month))
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { load() }, [load])

  function handleSaved() {
    setModal(null)
    load()
  }

  if (loading) return <Loading />
  if (error) return <ErrorMsg error={error} />

  const totalIncome = sumAmount(data.income)
  const cardTotals = {
    fixed: sumAmount(data.cards.filter((c) => c.card_type === 'fixed')),
    daily: sumAmount(data.cards.filter((c) => c.card_type === 'daily')),
    other: sumAmount(data.cards.filter((c) => c.card_type === 'other')),
  }
  const totalCards = cardTotals.fixed + cardTotals.daily + cardTotals.other
  const totalOther = sumAmount(data.others)
  const remaining = totalIncome - totalCards - totalOther

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-month">{monthLabel(year, month)}</div>
        <div className="hero-remaining">
          <span>今月の残額</span>
          <strong style={{ color: remaining >= 0 ? '#16a34a' : '#dc2626' }}>{formatYen(remaining)}</strong>
        </div>
        <div className="hero-sub">収入 {formatYen(totalIncome)} − 支出 {formatYen(totalCards + totalOther)}</div>
      </div>

      <div className="quick-actions">
        <button className="btn primary" onClick={() => setModal('income')}>＋ 収入入力</button>
        <button className="btn" onClick={() => setModal('card')}>＋ カード支出</button>
        <button className="btn" onClick={() => setModal('other')}>＋ その他支出</button>
      </div>

      <h3 className="section-title">収入</h3>
      <div className="stat-grid">
        <StatCard label="今月の入金合計" value={formatYen(totalIncome)} color="#0ea5e9" accent />
      </div>

      <h3 className="section-title">支出内訳</h3>
      <div className="stat-grid">
        <StatCard label={CARD_TYPES.fixed.label} value={formatYen(cardTotals.fixed)} color={CARD_TYPES.fixed.color} accent />
        <StatCard label={CARD_TYPES.daily.label} value={formatYen(cardTotals.daily)} color={CARD_TYPES.daily.color} accent />
        <StatCard label={CARD_TYPES.other.label} value={formatYen(cardTotals.other)} color={CARD_TYPES.other.color} accent />
        <StatCard label="その他支出" value={formatYen(totalOther)} color={OTHER_COLOR} accent />
      </div>

      <h3 className="section-title">明細</h3>
      <EntryList income={data.income} cards={data.cards} others={data.others} />

      <Modal open={modal === 'income'} title="収入入力" onClose={() => setModal(null)}>
        <IncomeForm onSaved={handleSaved} />
      </Modal>
      <Modal open={modal === 'card'} title="カード支出入力" onClose={() => setModal(null)}>
        <CardExpenseForm onSaved={handleSaved} />
      </Modal>
      <Modal open={modal === 'other'} title="その他支出入力" onClose={() => setModal(null)}>
        <OtherExpenseForm onSaved={handleSaved} />
      </Modal>
    </div>
  )
}
