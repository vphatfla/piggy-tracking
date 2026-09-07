import { useEffect, useRef, useState } from 'react'
import { deleteTransaction, updateTransaction, type Category, type Transaction } from '../api'
import { cents } from '../format'
import { inputClasses } from '../ui'
import { CategorySelect } from './CategorySelect'

/** The expanded editor. Rendered only while open, so mounting is what
 *  initialises the drafts from the transaction — which means Cancel, and
 *  closing the row, discard edits for free with no reset logic. */
export function EditPanel({
  token,
  transaction,
  categories,
  onAddCategory,
  onSaved,
  onDeleted,
  onCancel,
  id,
}: {
  token: string
  transaction: Transaction
  categories: Category[]
  onAddCategory: (name: string) => Promise<Category>
  onSaved: (updated: Transaction) => void
  onDeleted: (id: number) => void
  onCancel: () => void
  id: string
}) {
  const [merchant, setMerchant] = useState(transaction.merchantName)
  const [amount, setAmount] = useState(transaction.amount)
  const [date, setDate] = useState(transaction.date)
  const [categoryId, setCategoryId] = useState<number | null>(transaction.categoryId)
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Opening a row near the bottom of the list would otherwise put its fields
  // below the fold. Runs once, on mount, because the panel only exists while
  // the row is open.
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])

  async function onSave() {
    const patch: Parameters<typeof updateTransaction>[2] = {}
    if (merchant.trim() && merchant.trim() !== transaction.merchantName) {
      patch.merchantName = merchant.trim()
    }
    if (date && date !== transaction.date) patch.date = date
    if (categoryId !== transaction.categoryId) patch.categoryId = categoryId
    // Compared as cents, not strings, so retyping "9988" over "9988.00" is not
    // treated as an edit. A NaN falls through as a change on purpose — the
    // server owns the error message for a malformed amount.
    const next = cents(amount)
    if (Number.isNaN(next) || next !== cents(transaction.amount)) patch.amount = amount.trim()

    // Nothing changed: closing is not a write.
    if (Object.keys(patch).length === 0) {
      onCancel()
      return
    }

    setBusy(true)
    setError(null)
    try {
      // State is updated only once the server has confirmed. Updating
      // optimistically and then never refetching would leave a wrong value on
      // screen that looks saved and has nothing to correct it.
      onSaved(await updateTransaction(token, transaction.id, patch))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  async function onDelete() {
    setBusy(true)
    setError(null)
    try {
      await deleteTransaction(token, transaction.id)
      onDeleted(transaction.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div
      id={id}
      ref={panelRef}
      className="space-y-2 border-t border-separator py-3 pr-4"
    >
      <input
        value={merchant}
        onChange={(e) => setMerchant(e.target.value)}
        aria-label="Merchant"
        className={`${inputClasses} w-full`}
      />
      <CategorySelect
        categories={categories}
        value={categoryId}
        onChange={setCategoryId}
        onCreate={onAddCategory}
      />
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
          className={`${inputClasses} flex-1`}
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Amount"
          inputMode="decimal"
          className={`${inputClasses} w-24 text-right tabular-nums`}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-footnote text-danger-text">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        {/* Two-step rather than window.confirm: a native modal blocks the page,
            and a destructive action wants a deliberate second tap, not an OK. */}
        <button
          type="button"
          onClick={() => (armed ? void onDelete() : setArmed(true))}
          onBlur={() => setArmed(false)}
          disabled={busy}
          className="flex min-h-11 items-center rounded-control px-3 text-body font-semibold text-danger-text transition-opacity duration-200 ease-out hover:opacity-70 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          {armed ? 'Confirm delete?' : 'Delete'}
        </button>
        <div className="flex shrink-0 items-center gap-1">
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
            onClick={() => void onSave()}
            disabled={busy}
            className="flex min-h-11 items-center rounded-full bg-accent px-5 text-headline font-semibold text-on-accent transition-opacity duration-200 ease-out hover:opacity-90 active:opacity-75 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
