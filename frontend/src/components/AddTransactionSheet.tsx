import type { RefObject } from 'react'
import type { Category } from '../api'
import type { AddStatus } from '../hooks/useDashboard'
import { inputClasses } from '../ui'
import { CategorySelect } from './CategorySelect'
import { CheckIcon, CloseIcon } from './icons'
import { Sheet } from './Sheet'

/** The manual-entry form, in `Sheet` chrome rather than appended after the
 *  Budgets/List section — it's a global action reachable from the header,
 *  not an edit of something already on screen, so it rises to meet the tap
 *  instead of waiting below the fold.
 *
 *  `status` drives the Add button through the whole submit: it disables while
 *  the write is in flight and becomes a tick when it lands, after which the
 *  sheet dismisses itself. */
export function AddTransactionSheet({
  open,
  status,
  onClose,
  onSubmit,
  merchantInputRef,
  merchant,
  setMerchant,
  amount,
  setAmount,
  date,
  setDate,
  categories,
  selectedCategory,
  setCategoryId,
  onAddCategory,
}: {
  open: boolean
  status: AddStatus
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
  merchantInputRef: RefObject<HTMLInputElement | null>
  merchant: string
  setMerchant: (v: string) => void
  amount: string
  setAmount: (v: string) => void
  date: string
  setDate: (v: string) => void
  categories: Category[]
  selectedCategory: number | null
  setCategoryId: (id: number) => void
  onAddCategory: (name: string) => Promise<Category>
}) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="add-transaction-title">
      <form onSubmit={onSubmit} className="space-y-2 p-2">
        {/* Announced, not just seen: the tick on the button is invisible to a
            screen reader, and the sheet closing is not by itself a success. */}
        <p role="status" aria-live="polite" className="sr-only">
          {status === 'saved' ? 'Transaction added' : ''}
        </p>
        <div className="flex items-center justify-between px-1 pt-1">
          <h2
            id="add-transaction-title"
            className="text-footnote font-semibold tracking-wide text-label-secondary uppercase"
          >
            Add transaction
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
          ref={merchantInputRef}
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          placeholder="Merchant"
          aria-label="Merchant"
          className={`${inputClasses} w-full`}
        />
        <CategorySelect
          categories={categories}
          value={selectedCategory}
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
            placeholder="0.00"
            aria-label="Amount"
            inputMode="decimal"
            className={`${inputClasses} w-24 text-right tabular-nums`}
          />
          {/* The button is the confirmation, which is the Apple idiom — no
              toast, and nothing else to dismiss. A tick, held just long
              enough to read, and then the sheet takes itself away (the timer
              lives in useDashboard). Disabling it while the write is in
              flight is also what stops a double tap entering the same
              spending twice. */}
          <button
            type="submit"
            disabled={status !== 'idle'}
            className="flex min-h-11 w-24 shrink-0 items-center justify-center rounded-full bg-accent px-5 text-headline font-semibold text-on-accent transition-opacity duration-200 ease-out hover:opacity-90 active:opacity-75 disabled:opacity-100 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
          >
            {status === 'saved' ? (
              <span className="motion-safe:animate-pop">
                <CheckIcon />
              </span>
            ) : (
              <span className={status === 'saving' ? 'opacity-60' : ''}>
                {status === 'saving' ? 'Adding…' : 'Add'}
              </span>
            )}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
