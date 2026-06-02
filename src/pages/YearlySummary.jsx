import { useEffect, useState, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { fetchYear, fetchAvailableYears } from '../lib/api'
import { currentYearMonth, formatYen, sumAmount, CARD_TYPES, OTHER_COLOR } from '../lib/helpers'
import { StatCard, Loading, ErrorMsg } from '../components/Ui'

export default function YearlySummary() {
  const cur = currentYearMonth()
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

  useEffect(() => { load() }, [load])

  let chartData = []
  let totals = { income: 0, fixed: 0, daily: 0, other: 0, otherExp: 0 }
  if (data) {
    chartData = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const income = sumAmount(data.income.filter((r) => r.month === m))
      const fixed = sumAmount(data.cards.filter((r) => r.month === m && r.card_type === 'fixed'))
      const daily = sumAmount(data.cards.filter((r) => r.month === m && r.card_type === 'daily'))
      const cother = sumAmount(data.cards.filter((r) => r.month === m && r.card_type === 'other'))
      const otherExp = sumAmount(data.others.filter((r) => r.month === m))
      const spending = fixed + daily + cother + otherExp
      totals.income += income
      totals.fixed += fixed
      totals.daily += daily
      totals.other += cother
      totals.otherExp += otherExp
      return { name: `${m}月`, 入金: income, 支出: spending }
    })
  }
  const totalSpending = totals.fixed + totals.daily + totals.other + totals.otherExp
  const netSavings = totals.income - totalSpending

  return (
    <div className="page">
      <h2 className="page-title">年次サマリー</h2>
      <div className="selector-row">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}年</option>)}
        </select>
      </div>

      {loading ? <Loading /> : error ? <ErrorMsg error={error} /> : (
        <>
          <div className="chart-card">
            <h3 className="section-title">月別 入金 vs 支出</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis tickFormatter={(v) => '¥' + (v / 10000) + '万'} fontSize={11} width={56} />
                <Tooltip formatter={(v) => formatYen(v)} />
                <Legend />
                <Bar dataKey="入金" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="支出" fill="#ea580c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <h3 className="section-title">入金・貯蓄</h3>
          <div className="stat-grid" style={{ marginBottom: '12px' }}>
            <StatCard label="入金合計" value={formatYen(totals.income)} color="#0ea5e9" accent />
            <StatCard label="年間収支" value={formatYen(netSavings)} color={netSavings >= 0 ? '#16a34a' : '#dc2626'} accent />
          </div>

          <h3 className="section-title">支出内訳</h3>
          <div className="stat-grid">
            <StatCard label={CARD_TYPES.fixed.label} value={formatYen(totals.fixed)} color={CARD_TYPES.fixed.color} accent />
            <StatCard label={CARD_TYPES.daily.label} value={formatYen(totals.daily)} color={CARD_TYPES.daily.color} accent />
            <StatCard label={CARD_TYPES.other.label} value={formatYen(totals.other)} color={CARD_TYPES.other.color} accent />
            <StatCard label="その他支出" value={formatYen(totals.otherExp)} color={OTHER_COLOR} accent />
          </div>
        </>
      )}
    </div>
  )
}
