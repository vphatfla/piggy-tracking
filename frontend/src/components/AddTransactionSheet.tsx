import type { RefObject } from 'react'
import type { Category, Merchant } from '../api'
import type { AddStatus } from '../hooks/useDashboard'
import { inputClasses } from '../ui'
import { CategorySelect } from './CategorySelect'
import { CloseIcon } from './icons'
import { MerchantInput } from './MerchantInput'
import { MoneyInput } from './MoneyInput'
import { Sheet } from './Sheet'

/** "1st"/"2nd"/"3rd"/"4th"... for the "posts on the Nth" helper text below. */
function ordinal(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return `${n}st`
  if (n % 10 === 2 && n % 100 !== 12) return `${n}nd`
  if (n % 10 === 3 && n % 100 !== 13) return `${n}rd`
  return `${n}th`
}

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
  recurringType,
  setRecurringType,
  recurringEndMonth,
  setRecurringEndMonth,
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
  /** One-time is the default here — the opposite emphasis from
   *  AddIncomeSheet, where most households' income actually is recurring;
   *  recurring is the opt-in case for a transaction. */
  recurringType: 'ONE_TIME' | 'RECURRING'
  setRecurringType: (t: 'ONE_TIME' | 'RECURRING') => void
  /** Optional — a lease or a financed purchase usually has a known end date
   *  up front, unlike Income's recurring amount, which never takes one at
   *  creation. Empty string means "ongoing", same as leaving it blank means
   *  on the wire (sent as null). */
  recurringEndMonth: string
  setRecurringEndMonth: (v: string) => void
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

        {/* Same segmented-pair idiom as AddIncomeSheet — a fork in what the
            row means, not a toggle on an otherwise-identical one. Defaulting
            to One-time here is the opposite call from Income on purpose: see
            the prop doc comment. */}
        <div role="radiogroup" aria-label="Frequency" className="flex gap-2">
          {(['ONE_TIME', 'RECURRING'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={recurringType === opt}
              onClick={() => setRecurringType(opt)}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-subheadline font-semibold transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                recurringType === opt ? 'bg-accent/12 text-accent-text' : 'text-label-secondary hover:bg-surface-raised'
              }`}
            >
              {opt === 'RECURRING' ? 'Recurring' : 'One-time'}
            </button>
          ))}
        </div>

        {recurringType === 'RECURRING' && (
          <>
            <div className="flex items-center gap-2">
              <label htmlFor="recurring-end-month" className="shrink-0 text-footnote text-label-secondary">
                Ends
              </label>
              <input
                id="recurring-end-month"
                type="month"
                value={recurringEndMonth}
                onChange={(e) => setRecurringEndMonth(e.target.value)}
                aria-label="Ends (optional)"
                className={`${inputClasses} flex-1`}
              />
            </div>
            <p className="px-1 text-footnote text-label-tertiary">
              Posts on the {ordinal(new Date(date).getUTCDate())} of every month
              {recurringEndMonth ? ` through ${recurringEndMonth}` : ', until ended'}.
            </p>
          </>
        )}
      </form>
    </Sheet>
  )
}
