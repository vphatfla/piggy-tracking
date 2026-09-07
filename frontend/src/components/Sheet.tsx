import { useEffect, useState, type ReactNode } from 'react'

/** Generic bottom-sheet chrome: scrim + a panel that rises from the bottom
 *  edge. This is the app's one true overlay primitive, reserved for actions
 *  that aren't tied to any on-screen row — a global "new item" launched from
 *  the header, the way Calendar/Reminders present their own "new" flows.
 *  Everything else (EditPanel, BudgetEditor) stays an inline disclosure,
 *  because those are edits of something already on screen. Deliberately
 *  generic so a later Scan/Upload flow can reuse this chrome. */
export function Sheet({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean
  onClose: () => void
  labelledBy: string
  children: ReactNode
}) {
  // Starts false on every mount and flips true a frame later, so the panel
  // renders at translate-y-full first and the transition to translate-y-0
  // actually animates instead of snapping straight to open. Returning null
  // while closed (below) makes this a fresh mount each time the sheet opens,
  // so the slide-in replays every time.
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center">
      <div className="absolute inset-0 bg-scrim" onClick={onClose} aria-hidden="true" />
      {/* No focus trap: consistent with the popover menus elsewhere in the
          app, which also just close on outside click/Escape rather than
          trapping tab order. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative w-full max-w-xl rounded-t-card bg-surface shadow-card pb-[max(1rem,env(safe-area-inset-bottom))] transition-transform duration-300 ease-out ${
          shown ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-separator" aria-hidden="true" />
        {children}
      </div>
    </div>
  )
}
