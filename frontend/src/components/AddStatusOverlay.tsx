import { useState } from 'react'
import type { AddStatus } from '../hooks/useDashboard'
import { CheckIcon } from './icons'

/** The add-transaction confirmation: a centered, backdrop-blurred card over
 *  the whole page, replacing the old button-tick-then-close flow. Modeled on
 *  Sheet.tsx's "stay mounted, animate via CSS opacity, `inert` while closed"
 *  idiom, but centered rather than bottom-anchored, and with
 *  `backdrop-blur` added to the scrim for the "blur the background" ask.
 *
 *  Not user-dismissible — no `onClose`, no Escape handling — it appears and
 *  disappears on its own, driven entirely by `status`. Sits above `Sheet`'s
 *  `z-20` so it covers the still-open add-transaction sheet while
 *  'saving'/'saved' (see useDashboard's onSubmit for why the sheet itself
 *  doesn't close until this has run its course). */
export function AddStatusOverlay({ status }: { status: AddStatus }) {
  const open = status !== 'idle'
  // Content is keyed off the last non-idle status so it doesn't go blank mid
  // fade-out when `status` flips back to 'idle' before the opacity
  // transition finishes. Adjusted during render off a `prevStatus` guard
  // (React's own pattern for "remember something from a previous render")
  // rather than a ref write, which only belongs in an effect or a handler.
  const [prevStatus, setPrevStatus] = useState(status)
  const [lastStatus, setLastStatus] = useState<'saving' | 'saved'>(status === 'idle' ? 'saving' : status)
  if (status !== prevStatus) {
    setPrevStatus(status)
    if (status !== 'idle') setLastStatus(status)
  }

  return (
    <div
      inert={!open}
      className={`fixed inset-0 z-30 flex items-center justify-center ${open ? '' : 'pointer-events-none'}`}
    >
      <div
        className={`absolute inset-0 bg-scrim backdrop-blur-md transition-opacity duration-300 ease-out ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      />
      <div
        role="status"
        aria-live="polite"
        className={`relative flex flex-col items-center gap-3 rounded-card bg-surface px-8 py-7 shadow-card transition-opacity duration-300 ease-out ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {lastStatus === 'saved' ? (
          <>
            <span className="text-success motion-safe:animate-pop">
              <CheckIcon />
            </span>
            <p className="text-headline font-semibold text-success">Successfully added</p>
          </>
        ) : (
          <>
            <span className="size-5 motion-safe:animate-spin text-label-tertiary">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="42 100"
                />
              </svg>
            </span>
            <p className="text-headline font-semibold text-label">Adding…</p>
          </>
        )}
      </div>
    </div>
  )
}
