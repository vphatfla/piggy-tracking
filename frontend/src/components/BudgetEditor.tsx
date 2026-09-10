import { useState } from 'react'
import { deleteBudget, getBudgets, putBudget, type Budget, type Category } from '../api'
import { cents } from '../format'
import { addMonths, formatMonthLabel } from '../month'
import { inputClasses } from '../ui'
import { MinusCircleIcon } from './icons'
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
 *  missing from the list would be a limit you cannot add. It is also the only
 *  place a category can be renamed or removed, for the same reason: these rows
 *  are the app's one full list of them. */
export function BudgetEditor({
  token,
  month,
  categories,
  budgets,
  transactionCount,
  onRenameCategory,
  onDeleteCategory,
  onSaved,
  onCancel,
}: {
  token: string
  month: string
  categories: Category[]
  budgets: Budget[]
  /** How many of the viewed month's transactions are filed under a category —
   *  context for the delete confirmation, which is not limited to this month. */
  transactionCount: (categoryId: number) => number
  onRenameCategory: (id: number, name: string) => Promise<void>
  onDeleteCategory: (id: number) => Promise<void>
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
  // Names are drafts too, and follow the same rule as the amounts: an
  // untouched one is never written.
  const [names, setNames] = useState<Record<number, string>>(() =>
    Object.fromEntries(categories.map((c) => [c.id, c.name])),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Open only when at least one changed category has a previous value to
  // choose a treatment for — see hasChoice above.
  const [confirming, setConfirming] = useState(false)
  // The category whose deletion is awaiting confirmation, if any.
  const [deleting, setDeleting] = useState<Category | null>(null)

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
        // Renames go first and never through the forward/once choice below: a
        // name is not month-scoped, so there is nothing about it for a later
        // month to inherit or not inherit.
        const name = (names[c.id] ?? '').trim()
        if (name !== '' && name !== c.name) await onRenameCategory(c.id, name)

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

  /** Applied immediately rather than batched into Save: it removes the row
   *  being edited, so deferring it would mean carrying a tombstone through
   *  every draft above for no gain. The editor stays open — deleting one
   *  category is rarely the whole of what someone came here to do. */
  async function confirmDelete(category: Category) {
    setBusy(true)
    setError(null)
    setDeleting(null)
    try {
      // The leftover drafts for it are never read again — `categories` no
      // longer contains the id, and ids are not reused.
      await onDeleteCategory(category.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  return (
    <div className="mt-1 rounded-card bg-surface p-2 shadow-card">
      <ul>
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-1.5 px-1 py-1">
            {/* Leading red minus, iOS list-editing's own affordance — a second
                tap in a confirmation sheet is what actually deletes. */}
            <button
              type="button"
              onClick={() => setDeleting(c)}
              disabled={busy}
              aria-label={`Delete ${c.name}`}
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-danger-text transition-opacity duration-200 ease-out hover:opacity-70 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              <MinusCircleIcon />
            </button>
            <input
              value={names[c.id] ?? ''}
              onChange={(e) => setNames((n) => ({ ...n, [c.id]: e.target.value }))}
              aria-label={`Name of ${c.name}`}
              className={`${inputClasses} flex-1`}
            />
            <input
              value={drafts[c.id] ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
              placeholder="No limit"
              inputMode="decimal"
              aria-label={`Limit for ${c.name}`}
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

      {/* Destructive action sheet. It spells out what survives, because the
          honest answer is "the money, but not the label" — and that the reach
          of it is every month, not the one on screen. */}
      <Sheet open={deleting !== null} onClose={() => setDeleting(null)} labelledBy="confirm-delete-title">
        <div className="space-y-1 p-2 pb-1">
          <h2 id="confirm-delete-title" className="px-3 pt-2 text-headline font-semibold text-label">
            Delete {deleting?.name}?
          </h2>
          <p className="px-3 pb-1 text-subheadline text-label-secondary">
            Its transactions keep their amounts and move to Uncategorised
            {deleting && transactionCount(deleting.id) > 0
              ? ` (${transactionCount(deleting.id)} in ${formatMonthLabel(month)})`
              : ''}
            . Its limits are removed in every month.
          </p>
          <button
            type="button"
            onClick={() => deleting && void confirmDelete(deleting)}
            className="flex min-h-11 w-full items-center rounded-control px-3 text-body font-semibold text-danger-text transition-colors duration-150 ease-out active:bg-surface-raised"
          >
            Delete category
          </button>
          <button
            type="button"
            onClick={() => setDeleting(null)}
            className="flex min-h-11 w-full items-center rounded-control px-3 text-body text-label-secondary transition-colors duration-150 ease-out active:bg-surface-raised"
          >
            Cancel
          </button>
        </div>
      </Sheet>
    </div>
  )
}
