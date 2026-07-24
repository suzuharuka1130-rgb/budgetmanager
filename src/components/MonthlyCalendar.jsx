import { useMemo, useState } from 'react'
import { formatYen } from '../lib/helpers'
import { useMeta } from '../lib/meta'
import Modal from './Modal'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
const MAX_CHIPS = 3

// 週配列（各週7マス。月初/月末の外側は null）を組み立てる
function buildWeeks(year, month) {
  const firstDow = new Date(year, month - 1, 1).getDay() // 0=日
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

// 月次レポートの日別カレンダー。個別取引（txn_date基準）をカード/タイプ別に色分け表示する。
export default function MonthlyCalendar({ year, month, transactions = [] }) {
  const { cardName, cardColor, typeName, typeColor } = useMeta()
  const [selectedDay, setSelectedDay] = useState(null)

  function groupInfo(t) {
    return t.kind === 'card'
      ? { name: cardName(t.groupId), color: cardColor(t.groupId) }
      : { name: typeName(t.groupId), color: typeColor(t.groupId) }
  }

  // 日付(YYYY-MM-DD)ごとに取引をまとめる
  const byDate = useMemo(() => {
    const map = new Map()
    for (const t of transactions) {
      if (!map.has(t.date)) map.set(t.date, [])
      map.get(t.date).push(t)
    }
    return map
  }, [transactions])

  const weeks = useMemo(() => buildWeeks(year, month), [year, month])

  // 当月に登場したカード/タイプの凡例（色 → 名前）
  const legendItems = useMemo(() => {
    const map = new Map()
    for (const t of transactions) {
      const key = t.kind + ':' + t.groupId
      if (!map.has(key)) map.set(key, { key, ...groupInfo(t) })
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    // groupInfo は meta 由来の cardName/cardColor 等に依存
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, cardName, cardColor, typeName, typeColor])

  function dateKey(day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // 指定日の取引をカード/タイプでグループ集計する（チップ表示・モーダル共通）
  function dayInfo(day) {
    const txns = byDate.get(dateKey(day)) || []
    if (!txns.length) return { groups: [], total: 0, txns: [] }
    const groups = new Map() // groupKey -> { name, color, amount }
    for (const t of txns) {
      const key = t.kind + ':' + t.groupId
      if (!groups.has(key)) groups.set(key, { ...groupInfo(t), amount: 0 })
      groups.get(key).amount += t.amount
    }
    const sorted = [...groups.values()].sort((a, b) => b.amount - a.amount)
    const total = txns.reduce((s, t) => s + t.amount, 0)
    return { groups: sorted, total, txns }
  }

  const selected = selectedDay !== null ? dayInfo(selectedDay) : null

  return (
    <div>
      <div className="cal-weekdays">
        {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
      </div>
      <div className="cal-grid">
        {weeks.map((week, wi) => week.map((day, di) => {
          if (day === null) {
            return <div key={`${wi}-${di}`} className="cal-day cal-day--outside" />
          }
          const { groups, txns } = dayInfo(day)
          const clickable = txns.length > 0
          const shown = groups.slice(0, MAX_CHIPS)
          const moreCount = groups.length - MAX_CHIPS
          const openDay = () => setSelectedDay(day)
          return (
            <div
              key={`${wi}-${di}`}
              className={'cal-day' + (clickable ? ' cal-day--clickable' : '')}
              onClick={clickable ? openDay : undefined}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDay() } } : undefined}
            >
              <span className="cal-daynum">{day}</span>
              {groups.length > 0 && (
                <div className="cal-chips">
                  {shown.map((g, i) => (
                    <span key={i} className="cal-chip" style={{ '--c': g.color }}>{formatYen(g.amount)}</span>
                  ))}
                  {moreCount > 0 && <span className="cal-chip cal-chip--more">{`+${moreCount}`}</span>}
                </div>
              )}
            </div>
          )
        }))}
      </div>

      {legendItems.length > 0 && (
        <ul className="cal-legend" aria-label="カテゴリ凡例">
          {legendItems.map((item) => (
            <li key={item.key} className="cal-legend-item">
              <span className="dot" style={{ background: item.color }} />
              <span>{item.name}</span>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={selectedDay !== null}
        title={selectedDay !== null ? `${year}年${month}月${selectedDay}日` : ''}
        onClose={() => setSelectedDay(null)}
      >
        {selected && (
          <>
            <div className="cal-txn-list">
              {selected.txns.map((t) => {
                const info = groupInfo(t)
                return (
                  <div key={t.id} className="cal-txn-row">
                    <span className="dot" style={{ background: info.color }} />
                    <span className="cal-cat-badge" style={{ '--c': info.color }}>{info.name}</span>
                    <span className="cal-txn-name">{t.name || '—'}</span>
                    <span className="cal-txn-amount">{formatYen(t.amount)}</span>
                  </div>
                )
              })}
            </div>
            <div className="cal-modal-total">
              <span>合計</span>
              <span>{formatYen(selected.total)}</span>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
