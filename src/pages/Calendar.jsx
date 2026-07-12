import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { fetchMonthTransactions, fetchAvailableYears } from '../lib/api'
import { currentYearMonth, monthLabel } from '../lib/helpers'
import { Loading, ErrorMsg } from '../components/Ui'
import MonthlyCalendar from '../components/MonthlyCalendar'
import Modal from '../components/Modal'
import { ChevronLeftIcon, ChevronRightIcon } from '../components/icons'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
}

// year/month に delta ヶ月ぶんずらした {year, month} を返す
function stepMonth(year, month, delta) {
  const total = year * 12 + (month - 1) + delta
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

export default function CalendarPage() {
  const cur = currentYearMonth()
  const [years, setYears] = useState([cur.year])
  const [year, setYear] = useState(cur.year)
  const [month, setMonth] = useState(cur.month)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    fetchAvailableYears()
      .then((ys) => setYears(ys.length ? [...new Set([...ys, cur.year])].sort((a, b) => b - a) : [cur.year]))
      .catch(() => {})
  }, [cur.year])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setTransactions(await fetchMonthTransactions(year, month))
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { load() }, [load])

  function goPrev() {
    const n = stepMonth(year, month, -1)
    setYear(n.year)
    setMonth(n.month)
  }
  function goNext() {
    const n = stepMonth(year, month, 1)
    setYear(n.year)
    setMonth(n.month)
  }

  return (
    <div className="page">
      <h2 className="page-title">カレンダー</h2>
      <div className="cal-nav">
        <button type="button" className="icon-btn" onClick={goPrev} aria-label="前の月">
          <ChevronLeftIcon />
        </button>
        <button type="button" className="cal-nav-label" onClick={() => setPickerOpen(true)}>
          {monthLabel(year, month)}
        </button>
        <button type="button" className="icon-btn" onClick={goNext} aria-label="次の月">
          <ChevronRightIcon />
        </button>
      </div>

      <Modal open={pickerOpen} title="年月を選択" onClose={() => setPickerOpen(false)}>
        <div className="selector-row">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}年</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m) => <option key={m} value={m}>{m}月</option>)}
          </select>
        </div>
      </Modal>

      {loading ? <Loading /> : error ? <ErrorMsg error={error} /> : (
        <motion.div variants={containerVariants} initial="hidden" animate="show">
          <motion.div variants={itemVariants}>
            <MonthlyCalendar year={year} month={month} transactions={transactions} />
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
