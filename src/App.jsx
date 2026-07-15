import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { hasCredentials, getSession, onAuthChange } from './lib/supabase'
import { useMeta } from './lib/meta'
import { useHousehold } from './lib/household'
import HouseholdOnboarding from './pages/HouseholdOnboarding'
import ThisMonth from './pages/ThisMonth'
import MonthlyReport from './pages/MonthlyReport'
import YearlySummary from './pages/YearlySummary'
import Trends from './pages/Trends'
import CalendarPage from './pages/Calendar'
import Settings from './pages/Settings'
import Login from './pages/Login'

// 共通のラインアート風 SVG（ヘッダーロゴと同じスタイル）
function Svg({ children }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

const HomeIcon = () => (
  <Svg>
    <path d="M3 11 12 4l9 7" />
    <path d="M5 10v10h14V10" />
    <path d="M10 20v-6h4v6" />
  </Svg>
)
const CalendarIcon = () => (
  <Svg>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="8" y1="3" x2="8" y2="6" />
    <line x1="16" y1="3" x2="16" y2="6" />
  </Svg>
)
const BarIcon = () => (
  <Svg>
    <line x1="3" y1="21" x2="21" y2="21" />
    <rect x="5" y="12" width="3.2" height="8" />
    <rect x="10.4" y="8" width="3.2" height="12" />
    <rect x="15.8" y="14" width="3.2" height="6" />
  </Svg>
)
const TrendIcon = () => (
  <Svg>
    <path d="M3 17l5-5 4 3 8-8" />
    <path d="M16 4h5v5" />
  </Svg>
)
const CalendarDaysIcon = () => (
  <Svg>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="8" y1="3" x2="8" y2="6" />
    <line x1="16" y1="3" x2="16" y2="6" />
    <line x1="7" y1="13" x2="7" y2="13" />
    <line x1="12" y1="13" x2="12" y2="13" />
    <line x1="17" y1="13" x2="17" y2="13" />
    <line x1="7" y1="17" x2="7" y2="17" />
    <line x1="12" y1="17" x2="12" y2="17" />
  </Svg>
)
const GearIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="3.6" />
    <line x1="12" y1="2.5" x2="12" y2="5" />
    <line x1="12" y1="19" x2="12" y2="21.5" />
    <line x1="2.5" y1="12" x2="5" y2="12" />
    <line x1="19" y1="12" x2="21.5" y2="12" />
    <line x1="5.3" y1="5.3" x2="7" y2="7" />
    <line x1="17" y1="17" x2="18.7" y2="18.7" />
    <line x1="5.3" y1="18.7" x2="7" y2="17" />
    <line x1="17" y1="7" x2="18.7" y2="5.3" />
  </Svg>
)

const TABS = [
  { key: 'this', label: '今月', Icon: HomeIcon },
  { key: 'month', label: '月次', Icon: CalendarIcon },
  { key: 'year', label: '年次', Icon: BarIcon },
  { key: 'trend', label: 'トレンド', Icon: TrendIcon },
  { key: 'calendar', label: 'カレンダー', Icon: CalendarDaysIcon },
  { key: 'settings', label: '設定', Icon: GearIcon },
]

export default function App() {
  const [connected, setConnected] = useState(hasCredentials())
  const [session, setSession] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [tab, setTab] = useState('this')
  const meta = useMeta()
  const household = useHousehold()

  // 接続・ログインが整ったら世帯とマスタを読み込み直す
  useEffect(() => {
    if (connected && session) {
      household.refresh()
      meta.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, session])

  async function handleHouseholdJoined() {
    await household.refresh()
    await meta.refresh()
  }

  // 接続情報がある場合、ログイン状態を確認し変化を購読する
  useEffect(() => {
    if (!connected) {
      setAuthChecked(true)
      return
    }
    setAuthChecked(false)
    getSession()
      .then((s) => setSession(s))
      .catch(() => setSession(null))
      .finally(() => setAuthChecked(true))
    const unsubscribe = onAuthChange((s) => setSession(s))
    return unsubscribe
  }, [connected])

  function handleConnected() {
    setConnected(hasCredentials())
  }

  function renderPage() {
    switch (tab) {
      case 'this': return <ThisMonth />
      case 'month': return <MonthlyReport />
      case 'year': return <YearlySummary />
      case 'trend': return <Trends />
      case 'calendar': return <CalendarPage />
      case 'settings': return <Settings onCredentialsChange={handleConnected} />
      default: return null
    }
  }

  // ログイン前後で共通のヘッダー。title はログイン前の画面（認証確認中・ログイン・
  // 世帯確認中・世帯未所属）では固定で "Kakeibo"、アプリ本体では世帯ごとの設定値を使う。
  function renderHeader(title) {
    return (
      <header className="app-header">
        <svg className="app-logo" viewBox="0 0 64 64" fill="none" stroke="#166534"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {/* coin stack */}
          <ellipse cx="22" cy="13" rx="9" ry="3.2" />
          <path d="M13 13v6c0 1.8 4 3.2 9 3.2s9-1.4 9-3.2v-6" />
          <path d="M13 19v6c0 1.8 4 3.2 9 3.2s9-1.4 9-3.2v-6" />
          {/* house */}
          <path d="M10 34 32 18l22 16" />
          <path d="M16 32v22h32V32" />
          <rect x="27" y="40" width="10" height="14" />
          <rect x="38" y="38" width="7" height="7" />
        </svg>
        <h1>{title}</h1>
      </header>
    )
  }

  // 認証確認中
  if (connected && !authChecked) {
    return (
      <div className="app">
        {renderHeader('Kakeibo')}
        <main className="app-main"><div className="state-msg">読み込み中...</div></main>
      </div>
    )
  }

  // 未接続 or 未ログイン → ログイン画面（タブやコンテンツは表示しない）
  if (!connected || !session) {
    return (
      <div className="app">
        {renderHeader('Kakeibo')}
        <main className="app-main">
          <Login connected={connected} onConnected={handleConnected} />
        </main>
      </div>
    )
  }

  // 世帯の確認中
  if (household.loading || household.householdId === undefined) {
    return (
      <div className="app">
        {renderHeader('Kakeibo')}
        <main className="app-main"><div className="state-msg">読み込み中...</div></main>
      </div>
    )
  }

  // 世帯未所属 → 招待コード入力 or 新規作成
  if (!household.hasHousehold) {
    return (
      <div className="app">
        {renderHeader('Kakeibo')}
        <main className="app-main">
          <HouseholdOnboarding onDone={handleHouseholdJoined} />
        </main>
      </div>
    )
  }

  // ログイン済み・世帯あり → アプリ本体
  return (
    <div className="app">
      {renderHeader(meta.appTitle)}

      <main className="app-main">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="tab-bar">
        {TABS.map((t) => (
          <button key={t.key}
            className={'tab' + (tab === t.key ? ' active' : '')}
            onClick={() => setTab(t.key)}>
            {tab === t.key && (
              <motion.span className="tab-active-pill" layoutId="tab-active-pill"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
            )}
            <span className="tab-icon"><t.Icon /></span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
