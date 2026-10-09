import { useState, useEffect } from 'react'
import { signIn, signInWithGoogle, takeAuthRedirectError, saveCredentials, getCredentials } from '../lib/supabase'
import { Button } from '../components/ui/button'

// Google ログインから戻ってきた際のエラーを表示用メッセージに変換
function googleErrorMessage({ error, code }) {
  // 新規登録を無効にしているため、未登録のメールアドレスの Google アカウントは signup_disabled になる
  if (code === 'signup_disabled') {
    return 'このGoogleアカウントは登録されていません。登録済みのメールアドレスのGoogleアカウントでログインしてください。'
  }
  if (error === 'access_denied') return 'Googleログインがキャンセルされました。'
  return 'Googleログインに失敗しました。もう一度お試しください。'
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

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

// メール・パスワード / Google によるログインフォーム
function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    const redirectError = takeAuthRedirectError()
    if (redirectError) setError(googleErrorMessage(redirectError))
    // Google の画面からブラウザの「戻る」で bfcache 復元された場合、ボタンが無効のまま残るのを防ぐ
    const onPageShow = (e) => { if (e.persisted) setRedirecting(false) }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  async function handleGoogle() {
    setRedirecting(true)
    setError(null)
    try {
      await signInWithGoogle()
      // 成功時は Google の画面へ遷移するため、ここでは redirecting のままにする
    } catch {
      setError('Googleログインを開始できませんでした。もう一度お試しください。')
      setRedirecting(false)
    }
  }

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
    <>
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
        <Button type="submit" className="w-full" disabled={submitting || redirecting}>
          {submitting ? 'ログイン中...' : 'ログイン'}
        </Button>
      </form>
      <div className="onboard-divider"><span>または</span></div>
      <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}
        disabled={submitting || redirecting}>
        <GoogleIcon />
        {redirecting ? 'Googleに移動中...' : 'Googleでログイン'}
      </Button>
    </>
  )
}

export default function Login({ connected, onConnected }) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-title">Kakeibo Login</h1>
        {connected
          ? <LoginForm />
          : <SetupForm onConnected={onConnected} />}
      </div>
    </div>
  )
}
