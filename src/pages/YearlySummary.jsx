import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { fetchYear, fetchAvailableYears } from '../lib/api'
import { currentYearMonth, formatYen, sumAmount, OTHER_COLOR } from '../lib/helpers'
import { StatCard, Loading, ErrorMsg } from '../components/Ui'
import { useMeta } from '../lib/meta'

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
}

export default function YearlySummary() {
  const cur = currentYearMonth()
  const { cards } = useMeta()
  const [years, setYears] = useState([cur.year])
  const [year, setYear] = useState(cur.year)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchAvailableYears()
      .then((ys) => setYears(ys.length ? [...new Set([...ys, cur.year])].sort((a, b) => b - a) : [cur.year]))
      .catch(() => {})
  }, [cur.year])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchYear(year))
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [year])

  const [showChart, setShowChart] = useState(false)
  useEffect(() => {
    if (!loading && data) {
      const t = setTimeout(() => setShowChart(true), 300)
      return () => clearTimeout(t)
    } else {
      setShowChart(false)
    }
  }, [loading, data])

  useEffect(() => { load() }, [load])

  // 表示対象カード: アクティブ または その年にデータがあるカード
  const relevantCards = data
    ? cards.filter((c) => c.is_active || data.cards.some((r) => r.card_id === c.id))
    : []

  let chartData = []
  const cardTotals = {} // card.id -> 年間合計
  let totalIncome = 0
  let totalOther = 0
  if (data) {
    for (const c of relevantCards) cardTotals[c.id] = 0
    chartData = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const income = sumAmount(data.income.filter((r) => r.month === m))
      const otherExp = sumAmount(data.others.filter((r) => r.month === m))
      totalIncome += income
      totalOther += otherExp
      const row = { name: `${m}月`, 入金: income, その他: otherExp }
      for (const c of relevantCards) {
        const v = sumAmount(data.cards.filter((r) => r.month === m && r.card_id === c.id))
        row[`c_${c.id}`] = v
        cardTotals[c.id] += v
      }
      return row
    })
  }
  const totalCards = Object.values(cardTotals).reduce((a, b) => a + b, 0)
  const netSavings = totalIncome - totalCards - totalOther

  return (
    <div className="page">
      <h2 className="page-title">年次サマリー</h2>
      <div className="selector-row">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}年</option>)}
        </select>
      </div>

      {loading ? <Loading /> : error ? <ErrorMsg error={error} /> : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          style={{ display: 'flex', flexDirection: 'column', gap: 'inherit' }}
        >
          <motion.div className="chart-card" variants={itemVariants}>
            <h3 className="section-title">月別 入金 vs 支出（カード別内訳）</h3>
            {showChart ? (
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="name" fontSize={12} interval={0} stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-axis)' }} />
                  <YAxis tickFormatter={(v) => '¥' + (v / 10000) + '万'} fontSize={11} width={56} stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-axis)' }} />
                  <Tooltip formatter={(v) => formatYen(v)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} labelStyle={{ color: 'var(--text)' }} itemStyle={{ color: 'var(--text)' }} />
                  <Legend />
                  <Bar dataKey="入金" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  {relevantCards.map((c) => (
                    <Bar key={c.id} dataKey={`c_${c.id}`} name={c.name} stackId="spend" fill={c.color} />
                  ))}
                  <Bar dataKey="その他" name="その他支出" stackId="spend" fill={OTHER_COLOR} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 340 }} />
            )}
          </motion.div>

          <motion.div variants={itemVariants}>
            <h3 className="section-title">入金・貯蓄</h3>
            <div className="stat-grid" style={{ marginBottom: '12px' }}>
              <StatCard label="入金合計" value={formatYen(totalIncome)} color="#0ea5e9" accent />
              <StatCard label="年間収支" value={formatYen(netSavings)} color={netSavings >= 0 ? '#16a34a' : '#dc2626'} accent />
            </div>
          </motion.div>

          <motion.div variants={itemVariants}>
            <h3 className="section-title">支出合計</h3>
            <div className="stat-grid" style={{ marginBottom: '4px' }}>
              <StatCard
                label="支出合計"
                value={formatYen(totalCards + totalOther)}
                color={OTHER_COLOR}
                accent
              />
            </div>
            <h4 className="subsection-title">内訳</h4>
            <div className="stat-grid">
              {relevantCards.map((c) => (
                <StatCard key={c.id} label={c.name} value={formatYen(cardTotals[c.id] || 0)} color={c.color} accent />
              ))}
              <StatCard label="その他支出" value={formatYen(totalOther)} color={OTHER_COLOR} accent />
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
