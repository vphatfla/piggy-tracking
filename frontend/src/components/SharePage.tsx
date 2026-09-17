import { useState } from 'react'
import type { Share, UserProfile } from '../api'
import { CheckIcon, CloseIcon } from './icons'
import { Sheet } from './Sheet'

/** The "Share" screen, opened from AccountMenu. There is no router in this
 *  app (see frontend/CLAUDE.md), so this is a full-screen `Sheet` rather than
 *  a route — the same primitive AddTransactionSheet uses, chosen over an
 *  inline disclosure because this isn't editing anything already on screen.
 *
 *  Two states: an active share shows who it's with and which member's
 *  budgets are canonical, with a control to flip that and a way to leave.
 *  No share shows an "Invite" affordance that is a **true no-op** this
 *  round — the invite mechanism (notifying, accepting) isn't built yet, even
 *  though `POST /api/shares` underneath it is fully real and independently
 *  testable. Wiring this button to it is a deliberate follow-up, not an
 *  oversight. */
export function SharePage({
  open,
  onClose,
  user,
  share,
  onChangeBudgetOwner,
  onLeaveShare,
}: {
  open: boolean
  onClose: () => void
  user: UserProfile
  share: Share | null
  onChangeBudgetOwner: (budgetOwnerUserId: number) => Promise<void>
  onLeaveShare: () => Promise<void>
}) {
  const [leaving, setLeaving] = useState(false)
  const [confirmingLeave, setConfirmingLeave] = useState(false)

  async function handleLeave() {
    setLeaving(true)
    try {
      await onLeaveShare()
    } finally {
      setLeaving(false)
      setConfirmingLeave(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} labelledBy="share-title">
      <div className="space-y-2 p-2">
        <div className="flex items-center justify-between px-1 pt-1">
          <h2 id="share-title" className="text-footnote font-semibold tracking-wide text-label-secondary uppercase">
            Share
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 flex size-8 items-center justify-center rounded-full text-label-tertiary transition-colors duration-200 ease-out hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <CloseIcon />
          </button>
        </div>

        {share ? (
          <div className="overflow-hidden rounded-card bg-surface-raised">
            <div className="px-4 py-3">
              <p className="text-footnote text-label-secondary">Sharing with</p>
              <p className="mt-0.5 text-headline font-semibold text-label">
                {share.partner.firstName} {share.partner.lastName}
              </p>
              <p className="truncate text-footnote text-label-tertiary">{share.partner.email}</p>
            </div>

            <div className="mx-4 border-t border-separator" />

            <div className="px-4 py-3">
              <p className="text-footnote text-label-secondary">Budgets and categories come from</p>
              <div className="mt-2 flex gap-2">
                {[
                  { id: user.id, label: 'You' },
                  { id: share.partner.id, label: share.partner.firstName },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={share.budgetOwnerUserId === opt.id}
                    onClick={() => void onChangeBudgetOwner(opt.id)}
                    className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-subheadline font-semibold transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                      share.budgetOwnerUserId === opt.id
                        ? 'bg-accent/12 text-accent-text'
                        : 'text-label-secondary hover:bg-surface'
                    }`}
                  >
                    {share.budgetOwnerUserId === opt.id && <CheckIcon />}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mx-4 border-t border-separator" />

            <div className="px-2 py-2">
              {confirmingLeave ? (
                <div className="flex items-center justify-between gap-2 px-2">
                  <p className="text-subheadline text-label-secondary">Stop sharing with {share.partner.firstName}?</p>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingLeave(false)}
                      className="flex min-h-9 items-center rounded-full px-3 text-subheadline font-semibold text-label-secondary hover:bg-surface"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={leaving}
                      onClick={() => void handleLeave()}
                      className="flex min-h-9 items-center rounded-full bg-danger/12 px-3 text-subheadline font-semibold text-danger-text disabled:opacity-60"
                    >
                      {leaving ? 'Leaving…' : 'Leave'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingLeave(true)}
                  className="flex min-h-11 w-full items-center px-2 text-body text-danger-text transition-colors duration-200 ease-out hover:bg-surface"
                >
                  Stop sharing
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-card bg-surface-raised px-4 py-6 text-center">
            <p className="text-subheadline text-label-secondary">
              Share your budget and transactions with someone in your household — you'll both see and edit the
              same spending.
            </p>
            {/* True no-op: the invite mechanism isn't built yet, even though
                POST /api/shares underneath it already works. See this file's
                own comment. */}
            <button
              type="button"
              aria-disabled="true"
              className="mt-4 inline-flex min-h-11 items-center rounded-full bg-accent/12 px-5 text-headline font-semibold text-accent-text opacity-60"
            >
              Invite someone — coming soon
            </button>
          </div>
        )}
      </div>
    </Sheet>
  )
}
