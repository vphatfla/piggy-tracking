import { useEffect, type ReactNode } from 'react'

/** Generic bottom-sheet chrome: scrim + a panel that rises from the bottom
 *  edge. This is the app's one true overlay primitive, reserved for actions
 *  that aren't tied to any on-screen row — a global "new item" launched from
 *  the header, the way Calendar/Reminders present their own "new" flows.
 *  Everything else (EditPanel, BudgetEditor) stays an inline disclosure,
 *  because those are edits of something already on screen. Deliberately
 *  generic so a later Scan/Upload flow can reuse this chrome.
 *
 *  **The panel stays mounted while closed**, parked at `translate-y-full`
 *  behind a transparent scrim. That is what gives it a real dismissal: a sheet
 *  that returns `null` when closed cannot animate out, because the element it
 *  would animate is already gone. Staying mounted also means both directions
 *  are pure CSS off one class — no rAF, no timers, and no state here at all.
 *
 *  `inert` is what makes that safe: while closed the whole subtree is out of
 *  the a11y tree and unfocusable, so an off-screen form can't be tabbed into
 *  or read out. `pointer-events-none` covers the same ground for the scrim,
 *  which matters most under `prefers-reduced-motion` — index.css collapses
 *  every transition to 0.01ms there, and an invisible scrim that still ate
 *  taps would be worse than no animation at all. */
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
  // No listener while closed — the same shape every other dismissible surface
  // in this app uses.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  return (
    <div
      inert={!open}
      className={`fixed inset-0 z-20 flex items-end justify-center ${open ? '' : 'pointer-events-none'}`}
    >
      <div
        className={`absolute inset-0 bg-scrim transition-opacity duration-300 ease-out ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* No focus trap: consistent with the popover menus elsewhere in the
          app, which also just close on outside click/Escape rather than
          trapping tab order. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative w-full max-w-xl rounded-t-card bg-surface shadow-card pb-[max(1rem,env(safe-area-inset-bottom))] transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-separator" aria-hidden="true" />
        {children}
      </div>
    </div>
  )
}
