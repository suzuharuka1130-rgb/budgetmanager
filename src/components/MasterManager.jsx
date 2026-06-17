import { useState } from 'react'
import Modal from './Modal'
import { Button } from './ui/button'

// カード / その他支出タイプ の共通管理UI（追加・編集・並べ替え・論理削除）
// props:
//  title, addLabel, items(アクティブのみ・order順),
//  api: { add({name,color}), update(id,{name,color}), deactivate(id), setOrder(id, order) },
//  refresh: () => Promise, deleteWarning: string
export default function MasterManager({ title, addLabel, items, api, refresh, deleteWarning }) {
  const [editing, setEditing] = useState(null) // null | {} (new) | item (edit)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#3b82f6')
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [busyId, setBusyId] = useState(null)

  function openNew() {
    setEditing({})
    setName('')
    setColor('#3b82f6')
    setFormError(null)
  }
  function openEdit(item) {
    setEditing(item)
    setName(item.name)
    setColor(item.color)
    setFormError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return setFormError('名前を入力してください。')
    const dup = items.some((i) => i.name === trimmed && i.id !== editing?.id)
    if (dup) return setFormError('同じ名前が既に存在します。')
    setSaving(true)
    setFormError(null)
    try {
      if (editing && editing.id) {
        await api.update(editing.id, { name: trimmed, color })
      } else {
        await api.add({ name: trimmed, color })
      }
      await refresh()
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
      await api.deactivate(confirmDelete.id)
      await refresh()
      setConfirmDelete(null)
    } catch (err) {
      alert('削除に失敗しました: ' + (err.message || String(err)))
    } finally {
      setBusyId(null)
    }
  }

  async function move(index, dir) {
    const a = items[index]
    const b = items[index + dir]
    if (!a || !b) return
    setBusyId(a.id)
    try {
      await api.setOrder(a.id, b.display_order)
      await api.setOrder(b.id, a.display_order)
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="card">
      <h3 className="section-title">{title}</h3>
      <ul className="master-list">
        {items.map((item, i) => (
          <li key={item.id} className="master-row">
            <span className="master-swatch" style={{ background: item.color }} />
            <span className="master-name">{item.name}</span>
            <div className="master-actions">
              <button className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0 || busyId} title="上へ">▲</button>
              <button className="icon-btn sm" onClick={() => move(i, 1)} disabled={i === items.length - 1 || busyId} title="下へ">▼</button>
              <button className="icon-btn sm" onClick={() => openEdit(item)} title="編集">✎</button>
              <button className="icon-btn sm" onClick={() => setConfirmDelete(item)} title="削除">🗑</button>
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="muted small" style={{ padding: '8px 0' }}>項目がありません。</li>}
      </ul>
      <button className="btn" onClick={openNew}>{addLabel}</button>

      <Modal open={!!editing} title={editing && editing.id ? '編集' : '追加'} onClose={() => !saving && setEditing(null)}>
        <form className="entry-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>名前</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            <span>色</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="color-input" />
          </label>
          {formError && <p className="form-error">{formError}</p>}
          <button type="submit" className="btn primary" disabled={saving}>{saving ? '保存中...' : '保存'}</button>
        </form>
      </Modal>

      <Modal open={!!confirmDelete} title="削除の確認" onClose={() => !busyId && setConfirmDelete(null)}>
        {confirmDelete && (
          <div className="confirm-body">
            <p>「{confirmDelete.name}」を削除しますか？</p>
            <p className="muted small">{deleteWarning}</p>
            <div className="confirm-actions">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)} disabled={!!busyId}>キャンセル</Button>
              <Button type="button" variant="danger" className="flex-1" onClick={handleDelete} disabled={!!busyId}>削除する</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
