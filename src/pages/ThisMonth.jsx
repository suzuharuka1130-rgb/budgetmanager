import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { fetchMonth } from '../lib/api'
import { currentYearMonth, formatYen, monthLabel, sumAmount, OTHER_COLOR, EXPENSE_TOTAL_COLOR } from '../lib/helpers'
import { StatCard, Loading, ErrorMsg, EntryList } from '../components/Ui'
import Modal from '../components/Modal'
import { IncomeForm, CardExpenseForm, OtherExpenseForm } from '../components/EntryForms'
import { useMeta } from '../lib/meta'

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
}

export default function ThisMonth() {
  const { year, month } = currentYearMonth()
  const { activeCards } = useMeta()
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
  // 各アクティブカードの当月合計
  const cardBreakdown = activeCards.map((c) => ({
    card: c,
    total: sumAmount(data.cards.filter((row) => row.card_id === c.id)),
  }))
  const totalCards = sumAmount(data.cards)
  const totalOther = sumAmount(data.others)
  const remaining = totalIncome - totalCards - totalOther

  return (
    <motion.div
      className="page"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      <motion.div className="hero" variants={itemVariants}>
        <div className="hero-month">{monthLabel(year, month)}</div>
        <div className="hero-metrics">
          <div className="hero-remaining">
            <span>今月の収支</span>
            <strong style={{ color: remaining >= 0 ? '#16a34a' : '#dc2626' }}>{formatYen(remaining)}</strong>
          </div>
          <div className="hero-remaining">
            <span>口座残高</span>
            <strong>
              {data.balance ? formatYen(data.balance.balance) : '未入力'}
            </strong>
          </div>
        </div>
        <div className="hero-sub">入金 {formatYen(totalIncome)} − 支出 {formatYen(totalCards + totalOther)}</div>
      </motion.div>

      <motion.div className="quick-actions" variants={itemVariants}>
        <button className="btn primary" onClick={() => setModal('income')}>＋ 入金入力</button>
        <button className="btn" onClick={() => setModal('card')}>＋ カード支出</button>
        <button className="btn" onClick={() => setModal('other')}>＋ その他支出</button>
      </motion.div>

      <motion.div variants={itemVariants}>
        <h3 className="section-title">入金</h3>
        <StatCard label="今月の入金合計" value={formatYen(totalIncome)} color="#0ea5e9" accent layout="row" />
      </motion.div>

      <motion.div variants={itemVariants}>
        <h3 className="section-title">支出合計</h3>
        <StatCard
          label="今月の支出合計"
          value={formatYen(totalCards + totalOther)}
          color={EXPENSE_TOTAL_COLOR}
          accent
          layout="row"
        />
        <h4 className="subsection-title">内訳</h4>
        <div className="stat-grid">
          {cardBreakdown.map(({ card, total }) => (
            <StatCard key={card.id} label={card.name} value={formatYen(total)} color={card.color} accent />
          ))}
          <StatCard label="その他支出" value={formatYen(totalOther)} color={OTHER_COLOR} accent />
        </div>
      </motion.div>

      <motion.div variants={itemVariants}>
        <h3 className="section-title">明細</h3>
        <EntryList income={data.income} cards={data.cards} others={data.others} onRefresh={load} />
      </motion.div>

      <Modal open={modal === 'income'} title="入金入力" onClose={() => setModal(null)}>
        <IncomeForm onSaved={handleSaved} />
      </Modal>
      <Modal open={modal === 'card'} title="カード支出入力" onClose={() => setModal(null)}>
        <CardExpenseForm onSaved={handleSaved} />
      </Modal>
      <Modal open={modal === 'other'} title="その他支出入力" onClose={() => setModal(null)}>
        <OtherExpenseForm onSaved={handleSaved} />
      </Modal>
    </motion.div>
  )
}
