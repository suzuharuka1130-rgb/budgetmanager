import { useEffect, useState, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { fetchRange, fetchAvailableYears } from '../lib/api'
import { currentYearMonth, formatYen, sumAmount, CARD_TYPES, netByMonthMap, buildBalanceSeries } from '../lib/helpers'
import { Loading, ErrorMsg } from '../components/Ui'

// 選択年の1月から、今年なら現在月まで・過去年なら12月までの {year, month} 配列
function monthsOfYear(year, cur) {
  const end = year === cur.year ? cur.month : 12
  return Array.from({ length: end }, (_, i) => ({ year, month: i + 1 }))
}

export default function Trends() {
  const cur = currentYearMonth()
  const [years, setYears] = useState([cur.year])
  const [year, setYear] = useState(cur.year)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // データのある年のみをドロップダウンに表示
  useEffect(() => {
    fetchAvailableYears()
      .then((ys) => {
        if (ys.length) {
          setYears(ys)
          setYear(ys.includes(cur.year) ? cur.year : ys[0])
        }
      })
      .catch(() => {})
  }, [cur.year])

  const months = monthsOfYear(year, cur)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchRange(monthsOfYear(year, cur)))
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  useEffect(() => { load() }, [load])

  let balanceSeries = []
  let cardSeries = []
  let variableSeries = []

  if (data) {
    const matchM = (rows, y, m) => rows.filter((r) => r.year === y && r.month === m)
    const netByKey = netByMonthMap(data.income, data.cards, data.others)
    balanceSeries = buildBalanceSeries(months, data.balance, netByKey).map(({ month, balance }) => ({
      name: `${month}月`,
      残高: balance === null ? null : Number(balance),
    }))
    cardSeries = months.map(({ year, month }) => ({
      name: `${month}月`,
      STARTS: sumAmount(matchM(data.cards, year, month).filter((r) => r.card_type === 'fixed')),
      Olive: sumAmount(matchM(data.cards, year, month).filter((r) => r.card_type === 'daily')),
      'Rakuten Pink': sumAmount(matchM(data.cards, year, month).filter((r) => r.card_type === 'other')),
    }))
    variableSeries = cardSeries.map((r) => ({ name: r.name, 'Rakuten Pink': r['Rakuten Pink'] }))
  }

  const yTick = (v) => '¥' + (v / 10000) + '万'

  return (
    <div className="page">
      <h2 className="page-title">トレンド</h2>
      <div className="selector-row">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}年</option>)}
        </select>
      </div>

      {loading ? <Loading /> : error ? <ErrorMsg error={error} /> : (
        <>
          <div className="chart-card">
            <h3 className="section-title">口座残高の推移</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={balanceSeries} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis tickFormatter={yTick} fontSize={11} width={56} />
                <Tooltip formatter={(v) => formatYen(v)} />
                <Line type="monotone" dataKey="残高" stroke="#0ea5e9" strokeWidth={2} connectNulls dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h3 className="section-title">カード別支出の推移</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={cardSeries} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis tickFormatter={yTick} fontSize={11} width={56} />
                <Tooltip formatter={(v) => formatYen(v)} />
                <Legend />
                <Line type="monotone" dataKey="STARTS" stroke={CARD_TYPES.fixed.color} strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="Olive" stroke={CARD_TYPES.daily.color} strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="Rakuten Pink" stroke={CARD_TYPES.other.color} strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h3 className="section-title">Rakuten Pink（変動費）の推移</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={variableSeries} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis tickFormatter={yTick} fontSize={11} width={56} />
                <Tooltip formatter={(v) => formatYen(v)} />
                <Line type="monotone" dataKey="Rakuten Pink" stroke={CARD_TYPES.other.color} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
