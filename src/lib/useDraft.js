import { useEffect, useRef, useState } from 'react'

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000 // 24時間
const SAVE_DEBOUNCE_MS = 400

// 登録モーダルの入力内容を localStorage に一時保存し、モーダルを閉じて（誤って
// タブを切り替えて等）再度開いたときに復元するためのフック。
// key ごとに独立して保存する（入金/カード支出/その他支出で別ドラフト）。
// 24時間を過ぎたドラフトは古すぎるとみなして破棄する。
function writeDraft(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }))
  } catch {
    // 容量超過などは無視（ドラフト保存は best-effort）
  }
}

export function loadDraft(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { savedAt, data } = JSON.parse(raw)
    if (!savedAt || Date.now() - savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(key)
      return null
    }
    return data
  } catch {
    return null
  }
}

// "YYYY-MM" 形式かを確認する。壊れた/手動編集された localStorage の値が
// fromMonthValue() や <input type="month"> にそのまま渡って NaN 送信・描画崩れを
// 起こさないようにするためのガード。
export function sanitizeMonthVal(value, fallback) {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value) ? value : fallback
}

// data が変化するたびに（デバウンスして）ドラフトを保存する。呼び出し元は保存成功後、
// 返り値の clear() を呼んでドラフトを破棄する。
export function useSaveDraft(key, data) {
  const dataRef = useRef(data)
  dataRef.current = data
  const timerRef = useRef(null)
  const suppressedRef = useRef(false)

  useEffect(() => {
    if (suppressedRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => writeDraft(key, dataRef.current), SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, JSON.stringify(data)])

  // モーダルを閉じる（=フォームがアンマウントされる）と AnimatePresence の退場アニメーション
  // がデバウンス時間より早く終わることがあり、保留中の保存がキャンセルされたままだと
  // 直前の入力が失われる。アンマウント時は保留分を即座に書き込んで確定させる。
  // ただし clear() 済み（＝保存成功後）の場合は書き戻さない。
  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current)
      if (suppressedRef.current) return
      writeDraft(key, dataRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  function clear() {
    suppressedRef.current = true
    clearTimeout(timerRef.current)
    try {
      localStorage.removeItem(key)
    } catch {
      // no-op
    }
  }

  return clear
}

// フォームの初期状態を、保存済みドラフトがあればそれで、なければ fallback で初期化する。
export function useDraftState(key, fallback) {
  const [restored] = useState(() => loadDraft(key))
  return restored ?? fallback
}
