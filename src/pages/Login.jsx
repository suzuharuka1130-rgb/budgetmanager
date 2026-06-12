import { useState } from 'react'
import { signIn, saveCredentials, getCredentials } from '../lib/supabase'
import { Button } from '../components/ui/button'

// Supabase 未設定時に表示する初期設定フォーム
function SetupForm({ onConnected }) {
  const initial = getCredentials()
  const [url, setUrl] = useState(initial.url)
  const [anonKey, setAnonKey] = useState(initial.anonKey)

  function handleSubmit(e) {
    e.preventDefault()
    saveCredentials(url, anonKey)
    onConnected()
  }

  return (
    <form className="entry-form" onSubmit={handleSubmit}>
      <p className="muted small">
        はじめに、ご自身の Supabase プロジェクトの接続情報を入力してください。
        プロジェクト設定 → API から取得できます。
      </p>
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
      <Button type="submit" className="w-full">接続する</Button>
    </form>
  )
}

// メール・パスワードによるログインフォーム
function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await signIn(email, password)
      // 成功時は onAuthStateChange により App 側で画面が切り替わる
    } catch {
      setError('メールアドレスまたはパスワードが正しくありません')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="entry-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>メールアドレス</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          autoComplete="email" placeholder="you@example.com" required />
      </label>
      <label className="field">
        <span>パスワード</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password" placeholder="••••••••" required />
      </label>
      {error && <p className="form-error">{error}</p>}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'ログイン中...' : 'ログイン'}
      </Button>
    </form>
  )
}

export default function Login({ connected, onConnected }) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-title">HarukaとChiChanの家計管理</h1>
        {connected
          ? <LoginForm />
          : <SetupForm onConnected={onConnected} />}
      </div>
    </div>
  )
}
