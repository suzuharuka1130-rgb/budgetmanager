import { useState } from 'react'
import { getCredentials, saveCredentials, signOut } from '../lib/supabase'
import Modal from '../components/Modal'
import { BalanceForm } from '../components/EntryForms'

export default function Settings({ onCredentialsChange }) {
  const initial = getCredentials()
  const [url, setUrl] = useState(initial.url)
  const [anonKey, setAnonKey] = useState(initial.anonKey)
  const [saved, setSaved] = useState(false)
  const [showBalance, setShowBalance] = useState(false)

  function handleSave(e) {
    e.preventDefault()
    saveCredentials(url, anonKey)
    setSaved(true)
    onCredentialsChange?.()
    setTimeout(() => setSaved(false), 2500)
  }

  const connected = Boolean(initial.url && initial.anonKey)

  return (
    <div className="page">
      <h2 className="page-title">設定</h2>

      <div className="card">
        <h3 className="section-title">Supabase 接続情報</h3>
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
      </div>

      <div className="card">
        <h3 className="section-title">口座残高スナップショット</h3>
        <p className="muted small">
          実際の口座残高を手入力で記録します（トレンドの残高グラフに反映されます）。
          記録した月以降は、その残高を起点に毎月の「入金 − 支出」を自動で加算して残高を算出します。
        </p>
        <button className="btn" disabled={!connected} onClick={() => setShowBalance(true)}>
          口座残高を入力
        </button>
        {!connected && <p className="muted small">※ 先に Supabase 接続情報を保存してください。</p>}
      </div>

      <div className="card">
        <h3 className="section-title">アカウント</h3>
        <p className="muted small">ログアウトするとログイン画面に戻ります。</p>
        <button className="btn" onClick={() => signOut()}>ログアウト</button>
      </div>

      <Modal open={showBalance} title="口座残高の入力" onClose={() => setShowBalance(false)}>
        <BalanceForm onSaved={() => setShowBalance(false)} />
      </Modal>
    </div>
  )
}
