import type { RefObject } from 'react'
import type { Category } from '../api'
import { inputClasses } from '../ui'
import { CategorySelect } from './CategorySelect'
import { CloseIcon } from './icons'
import { Sheet } from './Sheet'

/** The manual-entry form, in `Sheet` chrome rather than appended after the
 *  Budgets/List section — it's a global action reachable from the header,
 *  not an edit of something already on screen, so it rises to meet the tap
 *  instead of waiting below the fold. Internals are unchanged from before
 *  this move: same fields, same filled Add button. */
export function AddTransactionSheet({
  open,
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
          <button
            type="submit"
            className="flex min-h-11 shrink-0 items-center rounded-full bg-accent px-5 text-headline font-semibold text-on-accent transition-opacity duration-200 ease-out hover:opacity-90 active:opacity-75 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
          >
            Add
          </button>
        </div>
      </form>
    </Sheet>
  )
}
