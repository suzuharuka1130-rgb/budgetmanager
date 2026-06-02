import { useState } from 'react'
import { hasCredentials } from './lib/supabase'
import ThisMonth from './pages/ThisMonth'
import MonthlyReport from './pages/MonthlyReport'
import YearlySummary from './pages/YearlySummary'
import Trends from './pages/Trends'
import Settings from './pages/Settings'

const TABS = [
  { key: 'this', label: '今月', icon: '🏠' },
  { key: 'month', label: '月次', icon: '📅' },
  { key: 'year', label: '年次', icon: '📊' },
  { key: 'trend', label: 'トレンド', icon: '📈' },
  { key: 'settings', label: '設定', icon: '⚙️' },
]

export default function App() {
  const [connected, setConnected] = useState(hasCredentials())
  const [tab, setTab] = useState(connected ? 'this' : 'settings')

  function handleCredentialsChange() {
    setConnected(hasCredentials())
  }

  function renderPage() {
    if (!connected && tab !== 'settings') {
      return (
        <div className="page">
          <div className="notice">
            <h2>ようこそ 👋</h2>
            <p>はじめに「設定」タブから Supabase の接続情報を入力してください。</p>
            <button className="btn primary" onClick={() => setTab('settings')}>設定を開く</button>
          </div>
        </div>
      )
    }
    switch (tab) {
      case 'this': return <ThisMonth />
      case 'month': return <MonthlyReport />
      case 'year': return <YearlySummary />
      case 'trend': return <Trends />
      case 'settings': return <Settings onCredentialsChange={handleCredentialsChange} />
      default: return null
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-logo">💴</span>
        <h1>共有家計簿</h1>
      </header>

      <main className="app-main">{renderPage()}</main>

      <nav className="tab-bar">
        {TABS.map((t) => (
          <button key={t.key}
            className={'tab' + (tab === t.key ? ' active' : '')}
            onClick={() => setTab(t.key)}>
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
