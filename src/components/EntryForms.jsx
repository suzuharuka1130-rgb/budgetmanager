import { useState } from 'react'
import { CARD_TYPES, OTHER_EXPENSE_TYPES, currentYearMonth, toMonthValue, fromMonthValue } from '../lib/helpers'
import { addIncome, addCardExpense, addOtherExpense, setAccountBalance } from '../lib/api'

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
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" inputMode="numeric" min="1" step="1" value={value}
        onChange={(e) => onChange(e.target.value)} placeholder="0" required />
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
  const [monthVal, setMonthVal] = useMonthState()
  const [cardType, setCardType] = useState('fixed')
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
      await addCardExpense({ year, month, card_type: cardType, amount: Number(amount), note: note || null })
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
        <span>カード</span>
        <select value={cardType} onChange={(e) => setCardType(e.target.value)}>
          {Object.entries(CARD_TYPES).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </label>
      <AmountField value={amount} onChange={setAmount} />
      <NoteField value={note} onChange={setNote} />
    </FormShell>
  )
}

export function OtherExpenseForm({ onSaved }) {
  const [monthVal, setMonthVal] = useMonthState()
  const [type, setType] = useState('cash_withdrawal')
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
      await addOtherExpense({ year, month, type, amount: Number(amount), note: note || null })
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
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(OTHER_EXPENSE_TYPES).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
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
