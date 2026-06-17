import { useEffect, useState, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { fetchYear, fetchAvailableYears } from '../lib/api'
import { currentYearMonth, formatYen, sumAmount, OTHER_COLOR } from '../lib/helpers'
import { StatCard, Loading, ErrorMsg } from '../components/Ui'
import { useMeta } from '../lib/meta'

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
        <>
          <div className="chart-card">
            <h3 className="section-title">月別 入金 vs 支出（カード別内訳）</h3>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis tickFormatter={(v) => '¥' + (v / 10000) + '万'} fontSize={11} width={56} />
                <Tooltip formatter={(v) => formatYen(v)} />
                <Legend />
                <Bar dataKey="入金" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                {relevantCards.map((c) => (
                  <Bar key={c.id} dataKey={`c_${c.id}`} name={c.name} stackId="spend" fill={c.color} />
                ))}
                <Bar dataKey="その他" name="その他支出" stackId="spend" fill={OTHER_COLOR} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <h3 className="section-title">入金・貯蓄</h3>
          <div className="stat-grid" style={{ marginBottom: '12px' }}>
            <StatCard label="入金合計" value={formatYen(totalIncome)} color="#0ea5e9" accent />
            <StatCard label="年間収支" value={formatYen(netSavings)} color={netSavings >= 0 ? '#16a34a' : '#dc2626'} accent />
          </div>

          <h3 className="section-title">支出内訳</h3>
          <div className="stat-grid">
            {relevantCards.map((c) => (
              <StatCard key={c.id} label={c.name} value={formatYen(cardTotals[c.id] || 0)} color={c.color} accent />
            ))}
            <StatCard label="その他支出" value={formatYen(totalOther)} color={OTHER_COLOR} accent />
          </div>
        </>
      )}
    </div>
  )
}
