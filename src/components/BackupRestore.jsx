import { useState, useEffect, useCallback } from 'react'
import Modal from './Modal'
import { Button } from './ui/button'
import { fetchBackupLogs, restoreHouseholdData } from '../lib/api'
import { runDailyBackup } from '../lib/supabase'

// 復元対象テーブル（プレビュー表示用ラベル）。households / household_members は世帯構造のため復元対象外。
const RESTORE_TABLES = [
  ['cards', 'カード'],
  ['other_expense_types', 'その他支出タイプ'],
  ['monthly_income', '入金'],
  ['card_expenses', 'カード支出'],
  ['other_expenses', 'その他支出'],
  ['account_balance', '口座残高'],
  ['app_settings', 'アプリ設定'],
]

const pad = (n) => String(n).padStart(2, '0')
function fmtDateTime(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fmtDate(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}
function fmtSize(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function BackupRestore({ connected }) {
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(true)

  const [backingUp, setBackingUp] = useState(false)
  const [backupResult, setBackupResult] = useState(null) // { ok, text }

  // 復元
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [parsed, setParsed] = useState(null) // { backup_date, tables }
  const [parseError, setParseError] = useState(null)
  const [confirmText, setConfirmText] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState(null)

  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      setLogs(await fetchBackupLogs(5))
    } catch {
      setLogs([])
    } finally {
      setLogsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (connected) loadLogs()
    else setLogsLoading(false)
  }, [connected, loadLogs])

  const lastSuccess = logs.find((l) => l.status === 'success')

  async function handleBackup() {
    setBackingUp(true)
    setBackupResult(null)
    try {
      const res = await runDailyBackup()
      setBackupResult({ ok: true, text: `バックアップしました（${res?.filename || ''} / ${fmtSize(res?.file_size)}）。` })
      await loadLogs()
    } catch (e) {
      setBackupResult({ ok: false, text: e.message || String(e) })
    } finally {
      setBackingUp(false)
    }
  }

  function resetRestore() {
    setParsed(null)
    setParseError(null)
    setConfirmText('')
    setRestoreError(null)
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    resetRestore()
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result))
        if (!obj || typeof obj !== 'object' || !obj.tables) {
          throw new Error('バックアップ形式が不正です（tables が見つかりません）。')
        }
        setParsed(obj)
      } catch (err) {
        setParseError(err.message || 'JSONの読み込みに失敗しました。')
      }
    }
    reader.onerror = () => setParseError('ファイルの読み込みに失敗しました。')
    reader.readAsText(file)
  }

  async function handleRestore() {
    if (!parsed || confirmText.trim() !== '復元') return
    setRestoring(true)
    setRestoreError(null)
    try {
      await restoreHouseholdData(parsed)
      // 成功: アプリを再読み込みして最新状態を反映
      window.location.reload()
    } catch (e) {
      setRestoreError(e.message || String(e))
      setRestoring(false)
    }
  }

  function closeRestore() {
    if (restoring) return
    setRestoreOpen(false)
    resetRestore()
  }

  return (
    <div className="card">
      <h3 className="section-title">バックアップ・復元</h3>
      <p className="muted small">
        毎日自動で全データを Google Drive にバックアップします（直近30件を保持）。
      </p>

      <p className="small" style={{ margin: '8px 0' }}>
        最終バックアップ：
        <strong>{lastSuccess ? fmtDateTime(lastSuccess.created_at) : '—'}</strong>
      </p>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={handleBackup} disabled={!connected || backingUp}>
          {backingUp ? 'バックアップ中...' : '今すぐバックアップ'}
        </button>
        <button className="btn danger" onClick={() => setRestoreOpen(true)} disabled={!connected}>
          バックアップから復元
        </button>
      </div>
      {backupResult && (
        <p className={backupResult.ok ? 'form-ok' : 'form-error'} style={{ marginTop: '8px' }}>
          {backupResult.text}
        </p>
      )}

      <h4 className="section-title" style={{ marginTop: '20px' }}>最新のバックアップ</h4>
      {logsLoading ? (
        <p className="muted small">読み込み中...</p>
      ) : logs.length === 0 ? (
        <p className="muted small">まだバックアップはありません。</p>
      ) : (
        <ul className="backup-log-list">
          {logs.slice(0, 1).map((l) => (
            <li key={l.id} className="backup-log-row">
              <span className="backup-log-status" aria-hidden="true">{l.status === 'success' ? '✅' : '❌'}</span>
              <span className="backup-log-date">{fmtDate(l.created_at)}</span>
              <span className="backup-log-size muted">{fmtSize(l.file_size)}</span>
            </li>
          ))}
        </ul>
      )}

      <Modal open={restoreOpen} title="バックアップから復元" onClose={closeRestore}>
        <div className="entry-form">
          <p className="form-error" style={{ lineHeight: 1.6 }}>
            ⚠️ 復元すると現在のすべてのデータが上書きされます。この操作は取り消せません。
          </p>

          <label className="field">
            <span>バックアップファイル（.json）</span>
            <input type="file" accept="application/json,.json" onChange={handleFile} disabled={restoring} />
          </label>

          {parseError && <p className="form-error">{parseError}</p>}

          {parsed && (
            <div className="backup-preview">
              <p className="small" style={{ margin: '0 0 6px' }}>
                バックアップ日：<strong>{parsed.backup_date || '不明'}</strong>
              </p>
              <ul className="backup-log-list">
                {RESTORE_TABLES.map(([key, label]) => (
                  <li key={key} className="backup-log-row">
                    <span className="backup-log-date" style={{ flex: 1 }}>{label}</span>
                    <span className="muted small">{(parsed.tables?.[key]?.length ?? 0)}件</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {parsed && (
            <label className="field">
              <span>確認のため「復元」と入力してください</span>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="復元"
                disabled={restoring}
              />
            </label>
          )}

          {restoreError && <p className="form-error">{restoreError}</p>}
          {restoring && <p className="form-warning">復元中です。完了までこの画面を閉じないでください...</p>}

          <div className="confirm-actions">
            <Button type="button" variant="outline" className="flex-1" onClick={closeRestore} disabled={restoring}>
              キャンセル
            </Button>
            <Button
              type="button"
              variant="danger"
              className="flex-1"
              onClick={handleRestore}
              disabled={restoring || !parsed || confirmText.trim() !== '復元'}
            >
              {restoring ? '復元中...' : '復元を実行する'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
