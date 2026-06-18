import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { getCredentials, saveCredentials, signOut, hasEnvCredentials, sendMonthlyReport, getSession } from '../lib/supabase'
import {
  fetchNotificationPreferences, upsertNotificationPreferences, setAppSetting,
  addCard, updateCard, deactivateCard, setCardOrder,
  addOtherExpenseType, updateOtherExpenseType, deactivateOtherExpenseType, setOtherExpenseTypeOrder,
} from '../lib/api'
import Modal from '../components/Modal'
import { BalanceForm } from '../components/EntryForms'
import MasterManager from '../components/MasterManager'
import { useMeta } from '../lib/meta'

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
}

export default function Settings({ onCredentialsChange }) {
  const initial = getCredentials()
  const meta = useMeta()
  const [url, setUrl] = useState(initial.url)
  const [anonKey, setAnonKey] = useState(initial.anonKey)
  const [saved, setSaved] = useState(false)
  const [showBalance, setShowBalance] = useState(false)
  const [lineSending, setLineSending] = useState(false)
  const [lineResult, setLineResult] = useState(null) // { ok, text }

  // アプリ名
  const [titleInput, setTitleInput] = useState(meta.appTitle)
  const [titleSaved, setTitleSaved] = useState(false)
  useEffect(() => { setTitleInput(meta.appTitle) }, [meta.appTitle])

  async function handleTitleSave(e) {
    e.preventDefault()
    try {
      await setAppSetting('app_title', titleInput.trim() || 'Kakeibo')
      await meta.refresh()
      setTitleSaved(true)
      setTimeout(() => setTitleSaved(false), 2500)
    } catch {
      // ignore
    }
  }

  // Notification preferences
  const [notifyPrefs, setNotifyPrefs] = useState({
    monthly_report: true,
    monthly_reminder: true,
    credit_input_reminder: true,
  })
  const [notifyLoading, setNotifyLoading] = useState(true)
  const [notifySaving, setNotifySaving] = useState(false)

  useEffect(() => {
    async function loadPrefs() {
      try {
        const session = await getSession()
        if (!session?.user?.id) return
        const prefs = await fetchNotificationPreferences(session.user.id)
        if (prefs) {
          setNotifyPrefs({
            monthly_report: prefs.monthly_report,
            monthly_reminder: prefs.monthly_reminder,
            credit_input_reminder: prefs.credit_input_reminder,
          })
        }
      } catch {
        // use defaults
      } finally {
        setNotifyLoading(false)
      }
    }
    loadPrefs()
  }, [])

  async function handleNotifyToggle(key) {
    const updated = { ...notifyPrefs, [key]: !notifyPrefs[key] }
    setNotifyPrefs(updated)
    setNotifySaving(true)
    try {
      const session = await getSession()
      if (!session?.user?.id) return
      await upsertNotificationPreferences(session.user.id, updated)
    } catch {
      setNotifyPrefs(notifyPrefs)
    } finally {
      setNotifySaving(false)
    }
  }

  function handleSave(e) {
    e.preventDefault()
    saveCredentials(url, anonKey)
    setSaved(true)
    onCredentialsChange?.()
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleLineTest() {
    setLineSending(true)
    setLineResult(null)
    try {
      await sendMonthlyReport()
      setLineResult({ ok: true, text: 'LINEに月次レポートを送信しました。' })
    } catch (e) {
      setLineResult({ ok: false, text: e.message || String(e) })
    } finally {
      setLineSending(false)
    }
  }

  const connected = Boolean(initial.url && initial.anonKey)

  return (
    <motion.div
      className="page"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      <h2 className="page-title">設定</h2>

      <motion.div className="card" variants={itemVariants}>
        <h3 className="section-title">アプリ名設定</h3>
        <form className="entry-form" onSubmit={handleTitleSave}>
          <label className="field">
            <span>アプリ名（ヘッダーに表示）</span>
            <input type="text" value={titleInput} onChange={(e) => setTitleInput(e.target.value)} required />
          </label>
          <button type="submit" className="btn primary" disabled={!connected}>保存</button>
          {titleSaved && <p className="form-ok">保存しました。</p>}
        </form>
      </motion.div>

      <motion.div variants={itemVariants}>
        <MasterManager
          title="カード管理"
          addLabel="＋ カードを追加"
          items={meta.activeCards}
          api={{ add: addCard, update: updateCard, deactivate: deactivateCard, setOrder: setCardOrder }}
          refresh={meta.refresh}
          deleteWarning="既存の支出記録はこのカードを参照したまま残ります（履歴は表示されます）が、新規入力では選択できなくなります。"
          groupOptions={[
            { value: 'housing', label: '家賃＆生活費' },
            { value: 'leisure', label: '娯楽費' },
          ]}
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <MasterManager
          title="その他支出タイプ管理"
          addLabel="＋ タイプを追加"
          items={meta.activeOtherTypes}
          api={{ add: addOtherExpenseType, update: updateOtherExpenseType, deactivate: deactivateOtherExpenseType, setOrder: setOtherExpenseTypeOrder }}
          refresh={meta.refresh}
          deleteWarning="既存の記録はこのタイプを参照したまま残ります（履歴は表示されます）が、新規入力では選択できなくなります。"
        />
      </motion.div>

      <motion.div className="card" variants={itemVariants}>
        <h3 className="section-title">LINE通知</h3>
        <p className="muted small">受け取るLINE通知を選択してください。</p>
        {notifyLoading ? (
          <p className="muted small">読み込み中...</p>
        ) : (
          <div className="notify-toggles">
            <label className="notify-toggle-row">
              <span>月次レポート（毎月1日）</span>
              <input
                type="checkbox"
                checked={notifyPrefs.monthly_report}
                onChange={() => handleNotifyToggle('monthly_report')}
                disabled={notifySaving}
              />
            </label>
            <label className="notify-toggle-row">
              <span>支出入力リマインダー（毎月25日）</span>
              <input
                type="checkbox"
                checked={notifyPrefs.monthly_reminder}
                onChange={() => handleNotifyToggle('monthly_reminder')}
                disabled={notifySaving}
              />
            </label>
            <label className="notify-toggle-row">
              <span>クレジット入力リマインダー（月末）</span>
              <input
                type="checkbox"
                checked={notifyPrefs.credit_input_reminder}
                onChange={() => handleNotifyToggle('credit_input_reminder')}
                disabled={notifySaving}
              />
            </label>
          </div>
        )}

        <h4 className="section-title" style={{ marginTop: '20px' }}>LINE通知テスト送信</h4>
        <p className="muted small">
          月次レポートを送信してプレビューできます。
        </p>
        <button className="btn" disabled={!connected || lineSending} onClick={handleLineTest}>
          {lineSending ? '送信中...' : 'LINE通知テスト送信'}
        </button>
        {lineResult && (
          <p className={lineResult.ok ? 'form-ok' : 'form-error'}>{lineResult.text}</p>
        )}
      </motion.div>

      <motion.div className="card" variants={itemVariants}>
        <h3 className="section-title">口座残高スナップショット</h3>
        <p className="muted small">
          実際の口座残高を手入力で記録します（トレンドの残高グラフに反映されます）。
          記録した月以降は、その残高を起点に毎月の「入金 − 支出」を自動で加算して残高を算出します。
        </p>
        <button className="btn" disabled={!connected} onClick={() => setShowBalance(true)}>
          口座残高を入力
        </button>
        {!connected && <p className="muted small">※ 先に Supabase 接続情報を保存してください。</p>}
      </motion.div>

      <motion.div className="card" variants={itemVariants}>
        <h3 className="section-title">Supabase 接続情報</h3>
        {hasEnvCredentials() ? (
          <p className="muted small">
            接続情報は環境変数（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）から読み込まれています。
            すべての端末で自動的に接続されるため、ここでの入力は不要です。
          </p>
        ) : (
          <>
            <p className="muted small">
              ご自身の Supabase プロジェクトに接続します。入力した値はこのブラウザの localStorage に保存されます。
              プロジェクト設定 → API から URL と anon public キーをコピーしてください。
              初回はリポジトリ内の <code>supabase_schema.sql</code> を Supabase の SQL Editor で実行してテーブルを作成してください。
            </p>
            <form className="entry-form" onSubmit={handleSave}>
              <label className="field">
                <span>Supabase URL</span>
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://xxxxx.supabase.co" required />
              </label>
              <label className="field">
                <span>anon public キー</span>
                <input type="text" value={anonKey} onChange={(e) => setAnonKey(e.target.value)}
                  placeholder="eyJhbGci..." required />
              </label>
              <button type="submit" className="btn primary">保存</button>
              {saved && <p className="form-ok">保存しました。</p>}
            </form>
          </>
        )}
      </motion.div>

      <motion.div className="card" variants={itemVariants}>
        <h3 className="section-title">アカウント</h3>
        <p className="muted small">ログアウトするとログイン画面に戻ります。</p>
        <button className="btn" onClick={() => signOut()}>ログアウト</button>
      </motion.div>

      <Modal open={showBalance} title="口座残高の入力" onClose={() => setShowBalance(false)}>
        <BalanceForm onSaved={() => setShowBalance(false)} />
      </Modal>
    </motion.div>
  )
}
