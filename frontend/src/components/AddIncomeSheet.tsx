import { useState } from 'react'
import { inputClasses } from '../ui'
import { CloseIcon } from './icons'
import { Sheet } from './Sheet'

/** Mirrors AddTransactionSheet's shape — a global action from the header, not
 *  an edit of something on screen, so it rises in a Sheet rather than an
 *  inline disclosure. The one-time/recurring choice is a segmented pair
 *  rather than a checkbox: it's a fork in what the row means, not a toggle on
 *  an otherwise-identical row. `month` is the month in view, the default and
 *  only starting point for a new entry — a recurring income created while
 *  looking at a past month would otherwise silently start recurring before
 *  today. */
export function AddIncomeSheet({
  open,
  month,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean
  month: string
  error: string | null
  onClose: () => void
  onSubmit: (body: { source: string; amount: string; type: 'ONE_TIME' | 'RECURRING'; month: string }) => Promise<void>
}) {
  const [source, setSource] = useState('')
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<'ONE_TIME' | 'RECURRING'>('RECURRING')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!source.trim() || !amount.trim() || busy) return
    setBusy(true)
    try {
      await onSubmit({ source: source.trim(), amount: amount.trim(), type, month })
      setSource('')
      setAmount('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} labelledBy="add-income-title">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2 p-2">
        <div className="flex items-center justify-between px-1 pt-1">
          <h2 id="add-income-title" className="text-footnote font-semibold tracking-wide text-label-secondary uppercase">
            Add income
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

        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Source (e.g. Salary)"
          aria-label="Source"
          className={`${inputClasses} w-full`}
        />

        <div role="radiogroup" aria-label="Frequency" className="flex gap-2">
          {(['RECURRING', 'ONE_TIME'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={type === opt}
              onClick={() => setType(opt)}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-subheadline font-semibold transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                type === opt ? 'bg-accent/12 text-accent-text' : 'text-label-secondary hover:bg-surface-raised'
              }`}
            >
              {opt === 'RECURRING' ? 'Recurring' : 'One-time'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            aria-label="Amount"
            inputMode="decimal"
            className={`${inputClasses} flex-1 tabular-nums`}
          />
          <button
            type="submit"
            disabled={busy}
            className="flex min-h-11 w-24 shrink-0 items-center justify-center rounded-full bg-accent px-5 text-headline font-semibold text-on-accent transition-opacity duration-200 ease-out hover:opacity-90 active:opacity-75 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
          >
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>

        {error && (
          <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-footnote text-danger-text">
            {error}
          </p>
        )}

        {type === 'RECURRING' && (
          <p className="px-1 text-footnote text-label-tertiary">Starts this month and continues until edited or removed.</p>
        )}
      </form>
    </Sheet>
  )
}
