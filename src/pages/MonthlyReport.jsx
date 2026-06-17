import { useEffect, useState, useCallback } from 'react'
import { fetchMonth, fetchAvailableYears } from '../lib/api'
import { currentYearMonth, formatYen, sumAmount, OTHER_COLOR } from '../lib/helpers'
import { StatCard, Loading, ErrorMsg, EntryList } from '../components/Ui'
import { useMeta } from '../lib/meta'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export default function MonthlyReport() {
  const cur = currentYearMonth()
  const { cards } = useMeta()
  const [years, setYears] = useState([cur.year])
  const [year, setYear] = useState(cur.year)
  const [month, setMonth] = useState(cur.month)
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
      setData(await fetchMonth(year, month))
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { load() }, [load])

  const totalIncome = data ? sumAmount(data.income) : 0
  // データのあるカードのみ（過去の非アクティブカードも履歴として表示）
  const cardBreakdown = data
    ? cards
        .map((c) => ({ card: c, total: sumAmount(data.cards.filter((r) => r.card_id === c.id)), has: data.cards.some((r) => r.card_id === c.id) }))
        .filter((x) => x.has)
    : []
  const totalCards = data ? sumAmount(data.cards) : 0
  const totalOther = data ? sumAmount(data.others) : 0
  const net = totalIncome - totalCards - totalOther

  return (
    <div className="page">
      <h2 className="page-title">月次レポート</h2>
      <div className="selector-row">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}年</option>)}
        </select>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m) => <option key={m} value={m}>{m}月</option>)}
        </select>
      </div>

      {loading ? <Loading /> : error ? <ErrorMsg error={error} /> : (
        <>
          <h3 className="section-title">入金・残高</h3>
          <div className="stat-grid" style={{ marginBottom: '12px' }}>
            <StatCard label="入金合計" value={formatYen(totalIncome)} color="#0ea5e9" accent />
            <StatCard label="月間収支" value={formatYen(net)} color={net >= 0 ? '#16a34a' : '#dc2626'} accent />
          </div>

          <h3 className="section-title">支出内訳</h3>
          <div className="stat-grid" style={{ marginBottom: '12px' }}>
            {cardBreakdown.map(({ card, total }) => (
              <StatCard key={card.id} label={card.name} value={formatYen(total)} color={card.color} accent />
            ))}
            <StatCard label="その他支出" value={formatYen(totalOther)} color={OTHER_COLOR} accent />
          </div>

          <h3 className="section-title">明細</h3>
          <EntryList income={data.income} cards={data.cards} others={data.others} onRefresh={load} />
        </>
      )}
    </div>
  )
}
