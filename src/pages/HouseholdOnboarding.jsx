import { useState } from 'react'
import { createHousehold, redeemInvite } from '../lib/api'
import { Button } from '../components/ui/button'

// 世帯未所属のユーザー向け: 招待コードで参加 or 新規作成
export default function HouseholdOnboarding({ onDone }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function join(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await redeemInvite(code.trim())
      await onDone()
    } catch {
      setError('招待コードが無効か、期限切れです。')
    } finally {
      setBusy(false)
    }
  }

  async function create(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await createHousehold(name.trim())
      await onDone()
    } catch (e2) {
      setError(e2.message || '作成に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-title">家計の設定</h1>
        <form className="entry-form" onSubmit={join}>
          <label className="field">
            <span>招待コードを入力してください</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="8桁のコード" />
          </label>
          <Button type="submit" className="w-full" disabled={busy || !code.trim()}>参加する</Button>
        </form>

        <div className="onboard-divider"><span>または</span></div>

        <form className="entry-form" onSubmit={create}>
          <label className="field">
            <span>新しい家計の名前（任意）</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 我が家" />
          </label>
          <Button type="submit" variant="outline" className="w-full" disabled={busy}>新しい家計を作成する</Button>
        </form>

        {error && <p className="form-error" style={{ marginTop: 12 }}>{error}</p>}
      </div>
    </div>
  )
}
