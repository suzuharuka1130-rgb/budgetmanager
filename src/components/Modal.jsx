import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

// 同時に開いているモーダルの数（複数の <Modal> が同時に open=true になっても、
// 最後の1つが閉じるまで背面のスクロールロックを維持するための参照カウント）。
let lockCount = 0

// モーダル表示中は背面ページのスクロールを止める。あわせて、スクロールバーが
// 消えることで生じる横幅のガタつきを、消えた分の幅を padding-right で埋めて防ぐ
// （通常のスクロールバーを使う環境向け。オーバーレイ式スクロールバーでは幅0）。
function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return
    lockCount += 1
    if (lockCount === 1) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
      document.body.style.overflow = 'hidden'
      if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`
    }
    return () => {
      lockCount -= 1
      if (lockCount === 0) {
        document.body.style.overflow = ''
        document.body.style.paddingRight = ''
      }
    }
  }, [active])
}

export default function Modal({ open, title, onClose, children }) {
  useBodyScrollLock(open)
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <div className="modal-header">
              <h3>{title}</h3>
              <button className="icon-btn" onClick={onClose} aria-label="閉じる">×</button>
            </div>
            <div className="modal-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
