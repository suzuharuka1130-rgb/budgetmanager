import { useState, useEffect } from 'react'
import { currentYearMonth, toMonthValue, fromMonthValue } from '../lib/helpers'
import { addIncome, addCardExpense, addCardExpenseTransactions, addOtherExpense, setAccountBalance, uploadReceipt } from '../lib/api'
import { analyzeReceipt } from '../lib/supabase'
import { useMeta } from '../lib/meta'
import { TrashIcon } from './icons'

// 個別取引リストの合計金額（円）
function sumTxns(list) {
  return (list || []).reduce((s, t) => s + (Number(t.amount) || 0), 0)
}

// OCRが読み取った「日にち」と対象月（年・月）を組み合わせてYYYY-MM-DDを作る。
// 年・月はスクリーンショットに写っていなくても対象月から補える。
function buildDateFromDay(monthVal, day) {
  if (!day) return ''
  const { year, month } = fromMonthValue(monthVal)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// 画像を縮小して JPEG base64（プレフィックス除去）に変換する。
// スマホ写真は数MBあり、そのまま送ると Edge Function / Gemini で失敗しやすいため、
// 最大辺を maxDim に縮小して送信を軽量・高速・確実にする（OCR精度は十分維持）。
function downscaleImageToBase64(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (Math.max(width, height) > maxDim) {
        const scale = maxDim / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像の読み込みに失敗しました。')) }
    img.src = url
  })
}

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024 // 10MB

function useMonthState() {
  const cur = currentYearMonth()
  return useState(toMonthValue(cur.year, cur.month))
}

function FormShell({ onSubmit, submitting, error, children }) {
  return (
    <form className="entry-form" onSubmit={onSubmit}>
      {children}
      {error && <p className="form-error">{error}</p>}
      <button type="submit" className="btn primary" disabled={submitting}>
        {submitting ? '保存中...' : '保存'}
      </button>
    </form>
  )
}

function validateAmount(value) {
  const n = Number(value)
  if (!value || Number.isNaN(n) || n <= 0) return '金額は正の数で入力してください。'
  return null
}

function MonthField({ value, onChange }) {
  return (
    <label className="field">
      <span>対象月</span>
      <input type="month" value={value} onChange={(e) => onChange(e.target.value)} required />
    </label>
  )
}

function AmountField({ value, onChange, label = '金額（円）' }) {
  const displayValue = value === '-' ? '-' : (value ? Number(value).toLocaleString('ja-JP') : '')

  const handleChange = (e) => {
    const rawValue = e.target.value
    const cleaned = rawValue.replace(/(?!^-)[^\d]/g, '')
    onChange(cleaned)
  }

  return (
    <label className="field">
      <span>{label}</span>
      <input type="text" inputMode="numeric" value={displayValue}
        onChange={handleChange} placeholder="0" required />
    </label>
  )
}

function NoteField({ value, onChange }) {
  return (
    <label className="field">
      <span>メモ（任意）</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="" />
    </label>
  )
}

export function IncomeForm({ onSaved }) {
  const [monthVal, setMonthVal] = useMonthState()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const err = validateAmount(amount)
    if (err) return setError(err)
    setSubmitting(true)
    setError(null)
    try {
      const { year, month } = fromMonthValue(monthVal)
      await addIncome({ year, month, amount: Number(amount), note: note || null })
      onSaved()
    } catch (e2) {
      setError(e2.message || '保存に失敗しました。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormShell onSubmit={handleSubmit} submitting={submitting} error={error}>
      <MonthField value={monthVal} onChange={setMonthVal} />
      <AmountField value={amount} onChange={setAmount} label="入金額（円）" />
      <NoteField value={note} onChange={setNote} />
    </FormShell>
  )
}

export function CardExpenseForm({ onSaved }) {
  const { activeCards } = useMeta()
  const [monthVal, setMonthVal] = useMonthState()
  const [cardId, setCardId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiFilled, setAiFilled] = useState(false)
  const [warning, setWarning] = useState(null)
  const [txns, setTxns] = useState([]) // [{ name, amount(string), date }]
  const [amountManual, setAmountManual] = useState(false) // 金額を手入力したら true（自動合計を止める）

  // カード一覧読み込み後、未選択なら先頭を選択
  useEffect(() => {
    if (!cardId && activeCards.length) setCardId(activeCards[0].id)
  }, [activeCards, cardId])

  // 金額フィールドの手入力（AmountField.onChange はユーザー操作でのみ発火）
  function handleAmountInput(v) {
    setAmountManual(true)
    setAmount(v)
  }

  // 取引リスト変更時、手入力でなければ金額を合計に同期する
  function applyTxns(next) {
    setTxns(next)
    if (!amountManual) setAmount(sumTxns(next) ? String(sumTxns(next)) : '')
  }
  function updateTxn(i, patch) {
    applyTxns(txns.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  }
  function addTxn() {
    setTxns((prev) => [...prev, { name: '', amount: '', date: '' }])
  }
  function removeTxn(i) {
    applyTxns(txns.filter((_, idx) => idx !== i))
  }
  function resetAmountToSum() {
    setAmountManual(false)
    setAmount(sumTxns(txns) ? String(sumTxns(txns)) : '')
  }

  // 対象月を変更したら、既存の取引日の「日にち」部分は保ったまま年・月だけ差し替える
  useEffect(() => {
    const { year, month } = fromMonthValue(monthVal)
    const ym = `${year}-${String(month).padStart(2, '0')}`
    setTxns((prev) => prev.map((t) => (t.date ? { ...t, date: `${ym}-${t.date.slice(-2)}` } : t)))
  }, [monthVal])

  function handleFileChange(e) {
    setError(null)
    setWarning(null)
    const f = e.target.files?.[0]
    if (!f) return
    if (!['image/jpeg', 'image/png'].includes(f.type)) {
      setError('JPEGまたはPNG画像を選択してください。')
      return
    }
    if (f.size > MAX_RECEIPT_BYTES) {
      setError('画像サイズは10MBまでです。')
      return
    }
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
    setAiFilled(false)
    setTxns([])
    setAmountManual(false)
  }

  async function handleAnalyze() {
    if (!file) return
    setAnalyzing(true)
    setError(null)
    try {
      const base64 = await downscaleImageToBase64(file)
      const res = await analyzeReceipt(base64, 'image/jpeg')
      const list = (res.transactions || []).map((t) => ({
        name: t.name || '',
        amount: t.amount != null ? String(Math.round(Number(t.amount) || 0)) : '',
        date: buildDateFromDay(monthVal, t.day),
      }))
      setTxns(list)
      setNote(res.note || '')
      setAmountManual(false)
      const total = list.length ? sumTxns(list) : (res.total ?? res.amount ?? 0)
      setAmount(total ? String(Math.round(total)) : '')
      setAiFilled(true)
    } catch {
      setError('AI読み取りに失敗しました。手動で入力してください。')
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const err = validateAmount(amount)
    if (err) return setError(err)
    if (!cardId) return setError('カードを選択してください。')
    setSubmitting(true)
    setError(null)
    setWarning(null)
    try {
      const { year, month } = fromMonthValue(monthVal)
      let receiptPath = null
      if (file) {
        try {
          receiptPath = await uploadReceipt(file, { year, month, card_id: cardId })
        } catch {
          setWarning('画像のアップロードに失敗しました。明細のみ保存します。')
        }
      }
      const cardExpenseId = await addCardExpense({
        year, month, card_id: cardId, amount: Number(amount),
        note: note || null, receipt_image_url: receiptPath,
      })
      if (txns.length) {
        try {
          await addCardExpenseTransactions(cardExpenseId, txns)
        } catch {
          setWarning('取引明細の保存に一部失敗しました。合計は保存されました。')
        }
      }
      onSaved()
    } catch (e2) {
      setError(e2.message || '保存に失敗しました。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormShell onSubmit={handleSubmit} submitting={submitting} error={error}>
      <MonthField value={monthVal} onChange={setMonthVal} />
      <div className="field">
        <span>カード</span>
        <div className="chip-row">
          {activeCards.map((c) => (
            <button
              key={c.id}
              type="button"
              className={'chip' + (cardId === c.id ? ' selected' : '')}
              style={{ '--chip': c.color }}
              onClick={() => setCardId(c.id)}
            >
              <span className="chip-dot" style={{ background: c.color }} />
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>レシート/明細画像（任意・JPEG/PNG）</span>
        <input type="file" accept="image/jpeg,image/png" onChange={handleFileChange} />
        {previewUrl && (
          <div className="receipt-preview">
            <img src={previewUrl} alt="プレビュー" />
            <button type="button" className="btn" onClick={handleAnalyze} disabled={analyzing}>
              {analyzing ? '読み取り中...' : 'AIで読み取る'}
            </button>
          </div>
        )}
      </div>

      {aiFilled && <p className="ai-fill-label">AIが読み取った内容（確認・編集してください）</p>}
      <AmountField value={amount} onChange={handleAmountInput} />
      {amountManual && txns.length > 0 && (
        <button type="button" className="btn-link" onClick={resetAmountToSum}>取引の合計に戻す</button>
      )}

      {(aiFilled || txns.length > 0) && (
        <div className="field">
          <span>取引明細（編集可）</span>
          <div className="txn-editor">
            {txns.map((t, i) => (
              <div key={i} className="txn-row">
                <input
                  type="text"
                  className="txn-name"
                  value={t.name}
                  onChange={(e) => updateTxn(i, { name: e.target.value })}
                  placeholder="利用先"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  className="txn-amount"
                  value={t.amount === '' ? '' : Number(t.amount).toLocaleString('ja-JP')}
                  onChange={(e) => updateTxn(i, { amount: e.target.value.replace(/[^\d]/g, '') })}
                  placeholder="金額"
                />
                <input
                  type="date"
                  className="txn-date"
                  value={t.date}
                  onChange={(e) => updateTxn(i, { date: e.target.value })}
                />
                <button type="button" className="icon-btn sm" onClick={() => removeTxn(i)} title="削除">
                  <TrashIcon />
                </button>
              </div>
            ))}
            <button type="button" className="btn" onClick={addTxn}>＋ 取引を追加</button>
          </div>
        </div>
      )}

      <NoteField value={note} onChange={setNote} />
      {warning && <p className="form-warning">{warning}</p>}
    </FormShell>
  )
}

export function OtherExpenseForm({ onSaved }) {
  const { activeOtherTypes } = useMeta()
  const [monthVal, setMonthVal] = useMonthState()
  const [typeId, setTypeId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!typeId && activeOtherTypes.length) setTypeId(activeOtherTypes[0].id)
  }, [activeOtherTypes, typeId])

  async function handleSubmit(e) {
    e.preventDefault()
    const err = validateAmount(amount)
    if (err) return setError(err)
    if (!typeId) return setError('種別を選択してください。')
    setSubmitting(true)
    setError(null)
    try {
      const { year, month } = fromMonthValue(monthVal)
      await addOtherExpense({ year, month, expense_type_id: typeId, amount: Number(amount), note: note || null })
      onSaved()
    } catch (e2) {
      setError(e2.message || '保存に失敗しました。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormShell onSubmit={handleSubmit} submitting={submitting} error={error}>
      <MonthField value={monthVal} onChange={setMonthVal} />
      <label className="field">
        <span>種別</span>
        <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          {activeOtherTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>
      <AmountField value={amount} onChange={setAmount} />
      <NoteField value={note} onChange={setNote} />
    </FormShell>
  )
}

export function BalanceForm({ onSaved }) {
  const [monthVal, setMonthVal] = useMonthState()
  const [balance, setBalance] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (balance === '' || Number.isNaN(Number(balance))) return setError('残高を数値で入力してください。')
    setSubmitting(true)
    setError(null)
    try {
      const { year, month } = fromMonthValue(monthVal)
      await setAccountBalance({ year, month, balance: Number(balance) })
      onSaved()
    } catch (e2) {
      setError(e2.message || '保存に失敗しました。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormShell onSubmit={handleSubmit} submitting={submitting} error={error}>
      <MonthField value={monthVal} onChange={setMonthVal} />
      <AmountField value={balance} onChange={setBalance} label="実際の口座残高（円）" />
    </FormShell>
  )
}
