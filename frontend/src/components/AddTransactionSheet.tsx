import type { RefObject } from 'react'
import type { Category, Merchant } from '../api'
import type { AddStatus } from '../hooks/useDashboard'
import { inputClasses } from '../ui'
import { CategorySelect } from './CategorySelect'
import { CloseIcon } from './icons'
import { MerchantInput } from './MerchantInput'
import { MoneyInput } from './MoneyInput'
import { Sheet } from './Sheet'

/** The manual-entry form, in `Sheet` chrome rather than appended after the
 *  Budgets/List section — it's a global action reachable from the header,
 *  not an edit of something already on screen, so it rises to meet the tap
 *  instead of waiting below the fold.
 *
 *  `status` only disables the Add button here — the confirmation itself is
 *  `AddStatusOverlay`, a centered overlay rendered above this sheet (see
 *  Dashboard.tsx) once the write lands, since this sheet stays open and
 *  blurred underneath it until that overlay has run its course. */
export function AddTransactionSheet({
  open,
  status,
  onClose,
  onSubmit,
  merchantInputRef,
  merchant,
  setMerchant,
  merchants,
  onAcceptMerchant,
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
  merchants: Merchant[]
  onAcceptMerchant: (m: Merchant) => void
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
        <MerchantInput
          inputRef={merchantInputRef}
          value={merchant}
          onChange={setMerchant}
          onAccept={onAcceptMerchant}
          merchants={merchants}
          categories={categories}
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
          <MoneyInput
            value={amount}
            onChange={setAmount}
            placeholder="0.00"
            aria-label="Amount"
            className={`${inputClasses} w-24 text-right tabular-nums`}
          />
          {/* Disabling while the write is in flight is what stops a double
              tap entering the same spending twice. The confirmation itself
              is the overlay above this sheet, not this button — see
              AddStatusOverlay. */}
          <button
            type="submit"
            disabled={status !== 'idle'}
            className="flex min-h-11 w-24 shrink-0 items-center justify-center rounded-full bg-accent px-5 text-headline font-semibold text-on-accent transition-opacity duration-200 ease-out hover:opacity-90 active:opacity-75 disabled:opacity-100 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
          >
            <span className={status !== 'idle' ? 'opacity-60' : ''}>{status !== 'idle' ? 'Adding…' : 'Add'}</span>
          </button>
        </div>
      </form>
    </Sheet>
  )
}
