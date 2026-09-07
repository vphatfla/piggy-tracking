import { useState } from 'react'
import { deleteBudget, putBudget, type Budget, type Category } from '../api'
import { cents } from '../format'
import { inputClasses } from '../ui'

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

  async function save() {
    setBusy(true)
    setError(null)
    try {
      // Sequential rather than Promise.all: this is at most a handful of rows,
      // and a failure half way through leaves a partial save that the refetch
      // below reports honestly instead of a pile of parallel rejections.
      for (const c of categories) {
        const current = budgets.find((b) => b.categoryId === c.id)
        const draft = (drafts[c.id] ?? '').trim()

        if (draft === '') {
          // Clearing removes the row set for *this* month only. Blanking an
          // inherited value has nothing here to delete — that limit lives in an
          // earlier month, and a blank field is not a request to erase history.
          if (current && !current.inherited) await deleteBudget(token, c.id, month)
          continue
        }
        // Untouched values are not rewritten. That matters most for an
        // inherited one: re-saving it would pin the number to this month and
        // silently break the chain it was inheriting through.
        if (current && cents(current.amount) === cents(draft)) continue

        await putBudget(token, { categoryId: c.id, month, amount: draft })
      }
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
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
          onClick={() => void save()}
          disabled={busy}
          className="flex min-h-11 items-center rounded-full bg-accent px-5 text-headline font-semibold text-on-accent transition-opacity duration-200 ease-out hover:opacity-90 active:opacity-75 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
