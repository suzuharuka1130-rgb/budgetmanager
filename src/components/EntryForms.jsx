import { useState, useEffect, useRef } from 'react'
import { currentYearMonth, toMonthValue, fromMonthValue } from '../lib/helpers'
import { addIncome, addCardExpense, addCardExpenseTransactions, addOtherExpense, addOtherExpenseTransactions, setAccountBalance, uploadReceipt } from '../lib/api'
import { analyzeReceipt } from '../lib/supabase'
import { useMeta } from '../lib/meta'
import { TrashIcon } from './icons'

// 個別取引リストの合計金額（円）
function sumTxns(list) {
  return (list || []).reduce((s, t) => s + (Number(t.amount) || 0), 0)
}

// year/month に対して delta ヶ月ぶんずらした {year, month} を返す
function addMonths(year, month, delta) {
  const total = year * 12 + (month - 1) + delta
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

// 'YYYY-MM-DD' を delta ヶ月ぶんずらす（日にちはそのまま）
function shiftDateByMonths(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const { year, month } = addMonths(y, m, delta)
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// OCRで抽出した取引一覧（新しい順を想定）から、実際の購入日を推定する。
// カードの利用代金は翌月に引き落とされるため、既定値は対象月の前月。
// 日にちが直前の取引より大きくなった時点で月をまたいだとみなし、1ヶ月遡る。
// Geminiが month/year を読み取れていれば、そちらを優先する。
function resolveExtractedDates(monthVal, rawTransactions) {
  const { year: targetYear, month: targetMonth } = fromMonthValue(monthVal)
  let { year: curYear, month: curMonth } = addMonths(targetYear, targetMonth, -1)
  let prevDay = null
  return (rawTransactions || []).map((t) => {
    const day = t.day ? Number(t.day) : null
    const explicitMonth = t.month ? Number(t.month) : null
    const explicitYear = t.year ? Number(t.year) : null
    if (explicitMonth && explicitYear) {
      curYear = explicitYear
      curMonth = explicitMonth
    } else if (day != null && prevDay != null && day > prevDay) {
      ;({ year: curYear, month: curMonth } = addMonths(curYear, curMonth, -1))
    }
    if (day != null) prevDay = day
    return {
      name: t.name || '',
      amount: t.amount != null ? String(Math.round(Number(t.amount) || 0)) : '',
      date: day != null ? `${curYear}-${String(curMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '',
    }
  })
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

function MonthField({ value, onChange, label = '引き落とし対象月' }) {
  return (
    <label className="field">
      <span>{label}</span>
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

// 明細（カード支出・その他支出）の取引リストと金額の連動を扱う共通フック。
// txns が空のまま保存すれば従来どおり単一の合計のみの入力として保存される。
// deferredBilling: true の場合（カード支出）、対象月を変更した際に取引日を「差分ヶ月」シフトする
// （複数月にまたがる取引の相対関係を保つ）。false（その他支出）なら従来どおり対象月に統一する。
function useTransactionEditor(monthVal, { deferredBilling = false, startWithBlankRow = false } = {}) {
  const [txns, setTxns] = useState(startWithBlankRow ? [{ name: '', amount: '', date: '' }] : []) // [{ name, amount(string), date }]
  const [amount, setAmountState] = useState('')
  const [amountManual, setAmountManual] = useState(false) // 金額を手入力したら true（自動合計を止める）
  const prevMonthValRef = useRef(monthVal)

  // 金額フィールドの手入力（AmountField.onChange はユーザー操作でのみ発火）
  function setAmount(v) {
    setAmountManual(true)
    setAmountState(v)
  }
  // 取引リスト変更時、手入力でなければ金額を合計に同期する
  function applyTxns(next) {
    setTxns(next)
    if (!amountManual) setAmountState(sumTxns(next) ? String(sumTxns(next)) : '')
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
    setAmountState(sumTxns(txns) ? String(sumTxns(txns)) : '')
  }
  // 取引リストをクリアする（金額はそのまま保持。例: 画像の選び直し時）
  function clearTxns() {
    setTxns([])
    setAmountManual(false)
  }
  // OCR等の抽出結果で取引リスト・金額をまとめて置き換える
  function fillFromExtraction(list, total) {
    setTxns(list)
    setAmountManual(false)
    setAmountState(total ? String(Math.round(total)) : '')
  }

  // 対象月を変更したら、既存の取引日を更新する。
  useEffect(() => {
    const prevMonthVal = prevMonthValRef.current
    prevMonthValRef.current = monthVal
    if (prevMonthVal === monthVal) return
    if (deferredBilling) {
      // 複数月にまたがる取引の相対関係を保ったまま、差分ヶ月だけ全取引日をシフトする
      const a = fromMonthValue(monthVal)
      const b = fromMonthValue(prevMonthVal)
      const delta = (a.year - b.year) * 12 + (a.month - b.month)
      setTxns((prev) => prev.map((t) => (t.date ? { ...t, date: shiftDateByMonths(t.date, delta) } : t)))
    } else {
      // 従来の挙動: 取引日の「日にち」部分は保ったまま年・月を対象月に統一する
      const { year, month } = fromMonthValue(monthVal)
      const ym = `${year}-${String(month).padStart(2, '0')}`
      setTxns((prev) => prev.map((t) => (t.date ? { ...t, date: `${ym}-${t.date.slice(-2)}` } : t)))
    }
  }, [monthVal, deferredBilling])

  return { txns, amount, amountManual, setAmount, updateTxn, addTxn, removeTxn, resetAmountToSum, clearTxns, fillFromExtraction }
}

// 取引明細の行編集UI（名前・金額・日付・削除 + 追加ボタン）。
function TransactionEditor({ txns, updateTxn, addTxn, removeTxn, namePlaceholder, label = '取引明細（任意・編集可）' }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="txn-editor">
        {txns.map((t, i) => (
          <div key={i} className="txn-row">
            <input
              type="text"
              className="txn-name"
              value={t.name}
              onChange={(e) => updateTxn(i, { name: e.target.value })}
              placeholder={namePlaceholder}
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
  )
}

// 金額フィールド + 「合計に戻す」リンク + 取引明細エディタをまとめたブロック。
// カード支出・その他支出フォームで共通利用する。
// showAmountField=false の場合（その他支出）、金額は取引明細の合計から自動算出され、
// 単独の金額フィールドは表示しない（二重入力を避けるため）。
function AmountAndTransactions({ editor, namePlaceholder, amountLabel, showAmountField = true, transactionsLabel }) {
  return (
    <>
      {showAmountField && (
        <>
          <AmountField value={editor.amount} onChange={editor.setAmount} label={amountLabel} />
          {editor.amountManual && editor.txns.length > 0 && (
            <button type="button" className="btn-link" onClick={editor.resetAmountToSum}>取引の合計に戻す</button>
          )}
        </>
      )}
      <TransactionEditor
        txns={editor.txns}
        updateTxn={editor.updateTxn}
        addTxn={editor.addTxn}
        removeTxn={editor.removeTxn}
        namePlaceholder={namePlaceholder}
        label={transactionsLabel}
      />
    </>
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
      <MonthField value={monthVal} onChange={setMonthVal} label="入金月" />
      <AmountField value={amount} onChange={setAmount} label="入金額（円）" />
      <NoteField value={note} onChange={setNote} />
    </FormShell>
  )
}

export function CardExpenseForm({ onSaved }) {
  const { activeCards } = useMeta()
  const [monthVal, setMonthVal] = useMonthState()
  const [cardId, setCardId] = useState('')
  const editor = useTransactionEditor(monthVal, { deferredBilling: true })
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiFilled, setAiFilled] = useState(false)
  const [warning, setWarning] = useState(null)

  // カード一覧読み込み後、未選択なら先頭を選択
  useEffect(() => {
    if (!cardId && activeCards.length) setCardId(activeCards[0].id)
  }, [activeCards, cardId])

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
    editor.clearTxns()
  }

  async function handleAnalyze() {
    if (!file) return
    setAnalyzing(true)
    setError(null)
    try {
      const base64 = await downscaleImageToBase64(file)
      const res = await analyzeReceipt(base64, 'image/jpeg')
      const list = resolveExtractedDates(monthVal, res.transactions)
      const total = list.length ? sumTxns(list) : (res.total ?? res.amount ?? 0)
      editor.fillFromExtraction(list, total)
      setNote(res.note || '')
      setAiFilled(true)
    } catch {
      setError('AI読み取りに失敗しました。手動で入力してください。')
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const err = validateAmount(editor.amount)
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
        year, month, card_id: cardId, amount: Number(editor.amount),
        note: note || null, receipt_image_url: receiptPath,
      })
      if (editor.txns.length) {
        try {
          await addCardExpenseTransactions(cardExpenseId, editor.txns)
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
      <AmountAndTransactions editor={editor} namePlaceholder="利用先" />

      <NoteField value={note} onChange={setNote} />
      {warning && <p className="form-warning">{warning}</p>}
    </FormShell>
  )
}

export function OtherExpenseForm({ onSaved }) {
  const { activeOtherTypes } = useMeta()
  const [monthVal, setMonthVal] = useMonthState()
  const [typeId, setTypeId] = useState('')
  const editor = useTransactionEditor(monthVal, { startWithBlankRow: true })
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [warning, setWarning] = useState(null)

  useEffect(() => {
    if (!typeId && activeOtherTypes.length) setTypeId(activeOtherTypes[0].id)
  }, [activeOtherTypes, typeId])

  async function handleSubmit(e) {
    e.preventDefault()
    const err = validateAmount(editor.amount)
    if (err) return setError(err)
    if (!typeId) return setError('種別を選択してください。')
    setSubmitting(true)
    setError(null)
    setWarning(null)
    try {
      const { year, month } = fromMonthValue(monthVal)
      const otherExpenseId = await addOtherExpense({
        year, month, expense_type_id: typeId, amount: Number(editor.amount), note: note || null,
      })
      if (editor.txns.length) {
        try {
          await addOtherExpenseTransactions(otherExpenseId, editor.txns)
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
      <label className="field">
        <span>種別</span>
        <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          {activeOtherTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>
      <AmountAndTransactions
        editor={editor}
        namePlaceholder="内容"
        showAmountField={false}
        transactionsLabel="取引明細"
      />

      <NoteField value={note} onChange={setNote} />
      {warning && <p className="form-warning">{warning}</p>}
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
