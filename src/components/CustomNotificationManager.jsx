import { useEffect, useState } from 'react'
import Modal from './Modal'
import { Button } from './ui/button'
import { TrashIcon, EditIcon } from './icons'
import {
  fetchCustomNotifications, addCustomNotification, updateCustomNotification,
  deleteCustomNotification, fetchCustomNotificationPrefs, setCustomNotificationPref,
} from '../lib/api'

// 送信日の選択肢: 1日..31日 + 月末
const DAY_OPTIONS = [
  ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}日` })),
  { value: 'last', label: '月末' },
]
const dayLabel = (d) => (d === 'last' ? '月末' : `毎月${d}日`)
// 一覧表示用に先頭の絵文字を取り除く（保存されている本文自体は変更しない）
const previewText = (content) => content.split('\n')[0].replace(/^[\p{Extended_Pictographic}️\s]+/u, '')

// カスタム通知の管理UI（追加・編集・削除・自分への通知ON/OFF）
// 通知は世帯単位、ON/OFF はメンバー単位（行なし = ON）。
export default function CustomNotificationManager({ userId, connected }) {
  const [items, setItems] = useState([])
  const [prefs, setPrefs] = useState({}) // { notification_id: enabled }
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | {} (new) | item (edit)
  const [day, setDay] = useState('1')
  const [content, setContent] = useState('')
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [busyId, setBusyId] = useState(null)

  async function load() {
    try {
      const [rows, prefMap] = await Promise.all([
        fetchCustomNotifications(),
        userId ? fetchCustomNotificationPrefs(userId) : Promise.resolve({}),
      ])
      setItems(rows)
      setPrefs(prefMap)
    } catch {
      // 未接続時などは空のまま
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (!connected) { setLoading(false); return }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, userId])

  function openNew() {
    setEditing({})
    setDay('1')
    setContent('')
    setFormError(null)
  }
  function openEdit(item) {
    setEditing(item)
    setDay(item.day_of_month)
    setContent(item.content)
    setFormError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = content.trim()
    if (!trimmed) return setFormError('通知文面を入力してください。')
    setSaving(true)
    setFormError(null)
    try {
      if (editing && editing.id) {
        await updateCustomNotification(editing.id, { content: trimmed, day_of_month: day })
      } else {
        await addCustomNotification({ content: trimmed, day_of_month: day })
      }
      await load()
      setEditing(null)
    } catch (err) {
      setFormError(err.message || '保存に失敗しました。')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setBusyId(confirmDelete.id)
    try {
      await deleteCustomNotification(confirmDelete.id)
      await load()
      setConfirmDelete(null)
    } catch (err) {
      alert('削除に失敗しました: ' + (err.message || String(err)))
    } finally {
      setBusyId(null)
    }
  }

  async function handleToggle(item) {
    if (!userId) return
    const next = !(prefs[item.id] !== false)
    const prev = prefs
    setPrefs({ ...prefs, [item.id]: next }) // 楽観的更新
    try {
      await setCustomNotificationPref(userId, item.id, next)
    } catch {
      setPrefs(prev) // 失敗時は元に戻す
    }
  }

  return (
    <>
      {loading ? (
        <p className="muted small">読み込み中...</p>
      ) : (
        <ul className="master-list">
          {items.map((item) => (
            <li key={item.id} className="master-row">
              <span className="master-name">
                {previewText(item.content)}
                <span className="master-group">{dayLabel(item.day_of_month)}</span>
              </span>
              <div className="master-actions">
                <button className="icon-btn sm" onClick={() => openEdit(item)} title="編集"><EditIcon /></button>
                <button className="icon-btn sm" onClick={() => setConfirmDelete(item)} title="削除"><TrashIcon /></button>
              </div>
              <input
                type="checkbox"
                checked={prefs[item.id] !== false}
                onChange={() => handleToggle(item)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0 }}
                title="自分に通知"
              />
            </li>
          ))}
          {items.length === 0 && <li className="muted small" style={{ padding: '8px 0' }}>通知はありません。</li>}
        </ul>
      )}
      <button className="btn" onClick={openNew} disabled={!connected}>＋ 通知を追加</button>

      <Modal open={!!editing} title={editing && editing.id ? '通知を編集' : '通知を追加'} onClose={() => !saving && setEditing(null)}>
        <form className="entry-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>送信日（毎月）</span>
            <select value={day} onChange={(e) => setDay(e.target.value)}>
              {DAY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>通知文面</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="例: 今月の支出をアプリに入力しましょう！"
              required
            />
          </label>
          {formError && <p className="form-error">{formError}</p>}
          <button type="submit" className="btn primary" disabled={saving}>{saving ? '保存中...' : '保存'}</button>
        </form>
      </Modal>

      <Modal open={!!confirmDelete} title="削除の確認" onClose={() => !busyId && setConfirmDelete(null)}>
        {confirmDelete && (
          <div className="confirm-body">
            <p>「{previewText(confirmDelete.content)}」を削除しますか？</p>
            <p className="muted small">この通知はすべてのメンバーに送信されなくなります。</p>
            <div className="confirm-actions">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)} disabled={!!busyId}>キャンセル</Button>
              <Button type="button" variant="danger" className="flex-1" onClick={handleDelete} disabled={!!busyId}>削除する</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
