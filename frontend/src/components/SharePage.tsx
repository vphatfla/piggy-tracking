import { useEffect, useState } from 'react'
import type { Invite, Share, UserProfile } from '../api'
import { inputClasses } from '../ui'
import { CheckIcon, CloseIcon } from './icons'
import { Sheet } from './Sheet'

/** The "Share" screen, opened from AccountMenu. There is no router in this
 *  app (see frontend/CLAUDE.md), so this is a full-screen `Sheet` rather than
 *  a route — the same primitive AddTransactionSheet uses, chosen over an
 *  inline disclosure because this isn't editing anything already on screen.
 *
 *  Two states. An active share shows who it's with and which member's budgets
 *  are canonical, with a control to flip that and a way to leave. No share
 *  shows both halves of starting one: generate a code to hand over, or enter a
 *  code somebody handed you. Both live on this one screen rather than behind a
 *  second menu entry, so this stays the whole story of sharing.
 *
 *  Redeeming a code is what creates the Share — that is the consent, and it is
 *  the only path, which is why the old `{ partnerEmail }` endpoint is gone. */
export function SharePage({
  open,
  onClose,
  user,
  share,
  onChangeBudgetOwner,
  onLeaveShare,
  invite,
  inviteStatus,
  shareError,
  onCreateInvite,
  onCancelInvite,
  onJoinWithCode,
}: {
  open: boolean
  onClose: () => void
  user: UserProfile
  share: Share | null
  onChangeBudgetOwner: (budgetOwnerUserId: number) => Promise<void>
  onLeaveShare: () => Promise<void>
  invite: Invite | null
  inviteStatus: 'idle' | 'saving'
  shareError: string | null
  onCreateInvite: () => Promise<void>
  onCancelInvite: () => Promise<void>
  /** Resolves true when the share was created, so the form can clear itself
   *  only on success and leave a rejected code in place to be corrected. */
  onJoinWithCode: (code: string) => Promise<boolean>
}) {
  const [leaving, setLeaving] = useState(false)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [entering, setEntering] = useState(false)
  const [joining, setJoining] = useState(false)
  const [copied, setCopied] = useState(false)

  /** The Sheet stays mounted while closed (see its own comment), so every
   *  transient bit of state here outlives a dismissal unless it is cleared — a
   *  half-typed code, a stale "Copied", a confirmation already in progress.
   *  Done on the way out rather than in an effect watching `open`, because
   *  Sheet routes its scrim click and its Escape key through `onClose` too, so
   *  this one wrapper catches every path out.
   *
   *  `invite` is deliberately *not* cleared: it is server state, and it is
   *  refetched when the sheet reopens precisely because it expires on a clock. */
  function handleClose() {
    setCodeInput('')
    setEntering(false)
    setCopied(false)
    setConfirmingLeave(false)
    onClose()
  }

  // Held just long enough to read, then back — the in-button confirmation
  // idiom from the add form, since this app has no toasts.
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1200)
    return () => clearTimeout(id)
  }, [copied])

  async function handleLeave() {
    setLeaving(true)
    try {
      await onLeaveShare()
    } finally {
      setLeaving(false)
      setConfirmingLeave(false)
    }
  }

  async function handleCopy() {
    if (!invite) return
    // Not merely a rejected promise: `navigator.clipboard` is *undefined* in an
    // insecure context, and http://<lan-ip>:5173 from a phone is a normal way
    // to use this app. The code stays visible and select-all either way, so
    // Copy is pure enhancement and silence is an acceptable failure.
    try {
      await navigator.clipboard?.writeText(invite.code)
      setCopied(true)
    } catch {
      /* no confirmation, nothing lost */
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (codeInput.length !== 8 || joining) return
    setJoining(true)
    try {
      if (await onJoinWithCode(codeInput)) {
        setCodeInput('')
        setEntering(false)
      }
    } finally {
      setJoining(false)
    }
  }

  return (
    <Sheet open={open} onClose={handleClose} labelledBy="share-title">
      <div className="space-y-2 p-2">
        <div className="flex items-center justify-between px-1 pt-1">
          <h2 id="share-title" className="text-footnote font-semibold tracking-wide text-label-secondary uppercase">
            Share
          </h2>
          <button
            type="button"
            onClick={handleClose}
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
          <div className="space-y-2">
            <div className="overflow-hidden rounded-card bg-surface-raised px-4 py-5 text-center">
              <p className="text-subheadline text-label-secondary">
                Share your budget and transactions with someone in your household — you'll both see and edit
                the same spending.
              </p>

              {invite ? (
                <div className="mt-4">
                  <p className="text-footnote text-label-secondary">Give them this code</p>
                  {/* tabular-nums rather than font-mono: no mono family is
                      configured, and this is the token the month total uses.
                      select-all keeps the code copyable where the Clipboard
                      API is unavailable. */}
                  <p className="mt-1 text-title-2 font-semibold tracking-wide tabular-nums text-label select-all">
                    {invite.code.slice(0, 4)} {invite.code.slice(4)}
                  </p>
                  {/* Absolute, not a countdown. This sheet stays mounted while
                      closed, so a relative label would need a timer and would
                      still be read stale; a wall-clock time is correct whenever
                      it happens to be looked at. */}
                  <p className="mt-1 text-footnote text-label-tertiary">
                    Works until{' '}
                    {new Date(invite.expiresAt).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                  <div className="mt-3 flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopy()}
                      className="flex min-h-11 items-center rounded-full bg-accent/12 px-4 text-subheadline font-semibold text-accent-text transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    >
                      {copied ? (
                        <span className="flex items-center gap-1.5 motion-safe:animate-pop">
                          <CheckIcon /> Copied
                        </span>
                      ) : (
                        'Copy'
                      )}
                    </button>
                    {/* No "new code" alongside this: a code already passed to
                        someone must not stop working because its sender
                        reopened the screen. Removing it is the deliberate act. */}
                    <button
                      type="button"
                      onClick={() => void onCancelInvite()}
                      className="flex min-h-11 items-center rounded-full px-4 text-subheadline font-semibold text-danger-text transition-colors duration-200 ease-out hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={inviteStatus === 'saving'}
                  onClick={() => void onCreateInvite()}
                  className="mt-4 inline-flex min-h-11 items-center rounded-full bg-accent/12 px-5 text-headline font-semibold text-accent-text transition-opacity duration-200 ease-out disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                >
                  {inviteStatus === 'saving' ? 'Getting a code…' : 'Invite someone'}
                </button>
              )}
            </div>

            <div className="overflow-hidden rounded-card bg-surface-raised">
              {entering ? (
                <form onSubmit={(e) => void handleJoin(e)} className="space-y-2 p-4">
                  <label htmlFor="invite-code" className="block text-footnote text-label-secondary">
                    Enter the code they gave you
                  </label>
                  {/* type="text", never "number": a leading zero is
                      significant and a number input strips it, adds spinners,
                      and fights min-h-11. one-time-code is what lets a phone
                      offer the code from a message. */}
                  <input
                    id="invite-code"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    placeholder="12345678"
                    className={`${inputClasses} w-full text-center tracking-wide tabular-nums`}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEntering(false)
                        setCodeInput('')
                      }}
                      className="flex min-h-11 flex-1 items-center justify-center rounded-full text-subheadline font-semibold text-label-secondary transition-colors duration-200 ease-out hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={codeInput.length !== 8 || joining}
                      className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-accent/12 text-subheadline font-semibold text-accent-text transition-opacity duration-200 ease-out disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    >
                      {joining ? 'Joining…' : 'Join'}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setEntering(true)}
                  className="flex min-h-11 w-full items-center px-4 text-body text-accent-text transition-colors duration-200 ease-out hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                >
                  Have a code?
                </button>
              )}
            </div>
          </div>
        )}

        {shareError && (
          <p
            role="alert"
            className="rounded-control bg-danger/10 px-3 py-2 text-footnote text-danger-text"
          >
            {shareError}
          </p>
        )}
      </div>
    </Sheet>
  )
}
