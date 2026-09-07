import { useState } from 'react'
import { deleteBudget, getBudgets, putBudget, type Budget, type Category } from '../api'
import { cents } from '../format'
import { addMonths, formatMonthLabel } from '../month'
import { inputClasses } from '../ui'
import { Sheet } from './Sheet'

/** A changed field with something to fall back to — the only case where
 *  "this month onward" and "only this month" actually differ. A brand-new
 *  limit has no previous value for a later month to revert to, so it's
 *  written the same way regardless of which choice the user would make. */
function hasChoice(categories: Category[], budgets: Budget[], drafts: Record<number, string>) {
  return categories.some((c) => {
    const current = budgets.find((b) => b.categoryId === c.id)
    const draft = (drafts[c.id] ?? '').trim()
    return draft !== '' && current && cents(current.amount) !== cents(draft)
  })
}

/** The edit mode of the budgets section. Every category gets a field, including
 *  ones with no limit — this is the only place a budget is set, so a category
 *  missing from the list would be a limit you cannot add. */
export function BudgetEditor({
  token,
  month,
  categories,
  budgets,
  onSaved,
  onCancel,
}: {
  token: string
  month: string
  categories: Category[]
  budgets: Budget[]
  onSaved: () => Promise<void>
  onCancel: () => void
}) {
  // Initialised on mount, so Cancel discards edits for free — same trick as
  // EditPanel. An inherited limit is seeded as a real value rather than a
  // placeholder: it *is* the number in force, and it should read as one.
  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      categories.map((c) => [c.id, budgets.find((b) => b.categoryId === c.id)?.amount ?? '']),
    ),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Open only when at least one changed category has a previous value to
  // choose a treatment for — see hasChoice above.
  const [confirming, setConfirming] = useState(false)

  async function save(mode: 'forward' | 'once') {
    setBusy(true)
    setError(null)
    setConfirming(false)
    try {
      const nextMonth = addMonths(month, 1)
      // Only fetched for "once", and once for the whole save rather than per
      // category: tells us which categories already have their own explicit
      // row at nextMonth, which "once" must leave alone rather than
      // overwrite with the pre-edit value.
      const nextMonthBudgets = mode === 'once' ? await getBudgets(token, nextMonth) : []

      // Sequential rather than Promise.all: this is at most a handful of rows
      // (times up to two writes each in "once" mode), and a failure half way
      // through leaves a partial save that the refetch below reports honestly
      // instead of a pile of parallel rejections.
      for (const c of categories) {
        const current = budgets.find((b) => b.categoryId === c.id)
        const draft = (drafts[c.id] ?? '').trim()

        if (draft === '') {
          // Clearing removes the row set for *this* month only. Blanking an
          // inherited value has nothing here to delete — that limit lives in an
          // earlier month, and a blank field is not a request to erase history.
          // This is "this month reverts to whatever it inherits" already, so
          // it never goes through the forward/once choice below.
          if (current && !current.inherited) await deleteBudget(token, c.id, month)
          continue
        }
        // Untouched values are not rewritten. That matters most for an
        // inherited one: re-saving it would pin the number to this month and
        // silently break the chain it was inheriting through.
        if (current && cents(current.amount) === cents(draft)) continue

        await putBudget(token, { categoryId: c.id, month, amount: draft })

        // "Only this month": pin next month to whatever this category scored
        // before this edit, so the new number doesn't silently become the
        // baseline forever after. Skipped when there's no previous value
        // (nothing to revert to — see hasChoice) or when next month already
        // has its own explicit row (already unaffected by this change).
        if (mode === 'once' && current) {
          const nextExplicit = nextMonthBudgets.find((b) => b.categoryId === c.id && !b.inherited)
          if (!nextExplicit) {
            await putBudget(token, { categoryId: c.id, month: nextMonth, amount: current.amount })
          }
        }
      }
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  function onSavePress() {
    if (hasChoice(categories, budgets, drafts)) setConfirming(true)
    else void save('forward')
  }

  return (
    <div className="mt-1 rounded-card bg-surface p-2 shadow-card">
      <ul>
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-2 py-1">
            <label htmlFor={`budget-${c.id}`} className="min-w-0 flex-1 truncate text-body text-label">
              {c.name}
            </label>
            <input
              id={`budget-${c.id}`}
              value={drafts[c.id] ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
              placeholder="No limit"
              inputMode="decimal"
              className={`${inputClasses} w-28 shrink-0 text-right tabular-nums`}
            />
          </li>
        ))}
        {categories.length === 0 && (
          <li className="px-2 py-3 text-center text-subheadline text-label-secondary">
            Add a category first — budgets are set per category.
          </li>
        )}
      </ul>

      {error && (
        <p role="alert" className="mx-2 mt-2 rounded-control bg-danger/10 px-3 py-2 text-footnote text-danger-text">
          {error}
        </p>
      )}

      <div className="mt-1 flex items-center justify-end gap-1 px-2 pb-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex min-h-11 items-center rounded-control px-3 text-body text-label-secondary transition-opacity duration-200 ease-out hover:opacity-70 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSavePress}
          disabled={busy}
          className="flex min-h-11 items-center rounded-full bg-accent px-5 text-headline font-semibold text-on-accent transition-opacity duration-200 ease-out hover:opacity-90 active:opacity-75 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Calendar's own "This event / All future events" prompt is the model
          here: a save that would change what a later month scores against
          needs the user to say whether that's the point or a one-off. */}
      <Sheet open={confirming} onClose={() => setConfirming(false)} labelledBy="confirm-budget-title">
        <div className="space-y-1 p-2 pb-1">
          <h2
            id="confirm-budget-title"
            className="px-2 pt-1 text-footnote font-semibold tracking-wide text-label-secondary uppercase"
          >
            Apply changes
          </h2>
          <button
            type="button"
            onClick={() => void save('forward')}
            className="flex min-h-11 w-full items-center rounded-control px-3 text-body text-label transition-colors duration-150 ease-out active:bg-surface-raised"
          >
            This month onward
          </button>
          <button
            type="button"
            onClick={() => void save('once')}
            className="flex min-h-11 w-full items-center rounded-control px-3 text-body text-label transition-colors duration-150 ease-out active:bg-surface-raised"
          >
            Only {formatMonthLabel(month)}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="flex min-h-11 w-full items-center rounded-control px-3 text-body text-label-secondary transition-colors duration-150 ease-out active:bg-surface-raised"
          >
            Cancel
          </button>
        </div>
      </Sheet>
    </div>
  )
}
