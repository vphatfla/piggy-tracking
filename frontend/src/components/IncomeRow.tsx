import { useState } from 'react'
import type { Income } from '../api'
import { cents, formatMoney } from '../format'
import { inputClasses } from '../ui'
import { ChevronDown } from './icons'

/** One income row: tap-to-expand, same idiom as TransactionRow. A RECURRING
 *  amount edit asks for the month it takes effect from — defaulting to the
 *  month in view — because it opens a new row rather than rewriting this one;
 *  a ONE_TIME row, or a plain source rename, updates in place. */
export function IncomeRow({
  income,
  index,
  month,
  open,
  onToggle,
  showOwner,
  onSaveField,
  onSaveRecurring,
  onDelete,
}: {
  income: Income
  index: number
  /** The month in view — the default `effectiveMonth` for a recurring edit. */
  month: string
  open: boolean
  onToggle: () => void
  showOwner: boolean
  onSaveField: (id: number, patch: Partial<{ source: string; amount: string }>) => Promise<void>
  onSaveRecurring: (id: number, body: { amount: string; effectiveMonth: string }) => Promise<void>
  onDelete: (id: number) => Promise<void>
}) {
  const panelId = `income-${income.id}-editor`
  const [source, setSource] = useState(income.source)
  const [amount, setAmount] = useState(income.amount)
  const [effectiveMonth, setEffectiveMonth] = useState(month)
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSave() {
    const patch: Partial<{ source: string; amount: string }> = {}
    if (source.trim() && source.trim() !== income.source) patch.source = source.trim()

    const next = cents(amount)
    const amountChanged = !Number.isNaN(next) && next !== cents(income.amount)

    setBusy(true)
    setError(null)
    try {
      if (amountChanged && income.type === 'RECURRING') {
        await onSaveRecurring(income.id, { amount: amount.trim(), effectiveMonth })
        return
      }
      if (amountChanged) patch.amount = amount.trim()
      if (Object.keys(patch).length === 0) {
        onToggle()
        return
      }
      await onSaveField(income.id, patch)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function onConfirmDelete() {
    setBusy(true)
    setError(null)
    try {
      await onDelete(income.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <li className="pl-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={`flex min-h-15 w-full items-center gap-3 py-3 pr-4 text-left transition-colors duration-150 ease-out active:bg-surface-raised focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
          index === 0 ? '' : 'border-t border-separator'
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-headline font-semibold text-label">{income.source}</p>
          <p className="mt-0.5 truncate text-subheadline text-label-secondary">
            {income.type === 'RECURRING' ? 'Recurring' : 'One-time'}
            {showOwner && ` · ${income.ownerName}`}
          </p>
        </div>
        <span className="shrink-0 text-headline tabular-nums text-success">
          {formatMoney(income.amount)}
        </span>
        <span
          className={`shrink-0 text-label-tertiary transition-transform duration-200 ease-out ${open ? 'rotate-180' : ''}`}
        >
          <ChevronDown />
        </span>
      </button>

      {open && (
        <div id={panelId} className="space-y-2 border-t border-separator py-3 pr-4">
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aria-label="Source"
            className={`${inputClasses} w-full`}
          />
          <div className="flex items-center gap-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Amount"
              inputMode="decimal"
              className={`${inputClasses} flex-1 tabular-nums`}
            />
            {income.type === 'RECURRING' && (
              <input
                type="month"
                value={effectiveMonth}
                onChange={(e) => setEffectiveMonth(e.target.value)}
                aria-label="Effective from"
                className={`${inputClasses} w-36`}
              />
            )}
          </div>
          {income.type === 'RECURRING' && (
            <p className="text-footnote text-label-tertiary">
              A changed amount applies from the month above onward — earlier months keep what they showed.
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-footnote text-danger-text">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => (armed ? void onConfirmDelete() : setArmed(true))}
              onBlur={() => setArmed(false)}
              disabled={busy}
              className="flex min-h-11 items-center rounded-control px-3 text-body font-semibold text-danger-text transition-opacity duration-200 ease-out hover:opacity-70 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              {armed ? 'Confirm delete?' : 'Delete'}
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={onToggle}
                disabled={busy}
                className="flex min-h-11 items-center rounded-control px-3 text-body text-label-secondary transition-opacity duration-200 ease-out hover:opacity-70 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onSave()}
                disabled={busy}
                className="flex min-h-11 items-center rounded-full bg-accent px-5 text-headline font-semibold text-on-accent transition-opacity duration-200 ease-out hover:opacity-90 active:opacity-75 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}
