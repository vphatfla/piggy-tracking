import type { Category, Receipt, Transaction } from '../api'
import { formatDate, formatMoney } from '../format'
import { ChevronDown } from './icons'
import { EditPanel } from './EditPanel'

/** One transaction: a tap-to-expand row plus its EditPanel. Shared by the
 *  flat List view and a budget drill-down, so the two never drift apart —
 *  extracted rather than duplicated. `index` is local to whichever list the
 *  row is rendered in (it only drives the i===0 top-border rule). */
export function TransactionRow({
  transaction,
  index,
  receipt,
  open,
  onToggle,
  token,
  categories,
  onAddCategory,
  onSaved,
  onDeleted,
}: {
  transaction: Transaction
  index: number
  receipt: Receipt | undefined
  open: boolean
  onToggle: () => void
  token: string
  categories: Category[]
  onAddCategory: (name: string) => Promise<Category>
  onSaved: (updated: Transaction) => void
  onDeleted: (id: number) => void
}) {
  const panelId = `txn-${transaction.id}-editor`

  return (
    // The separator sits on the inner row, not the <li>, so it is inset to
    // the text the way a grouped list is on iOS.
    <li className="pl-4">
      {/* A real <button>, not a div with onClick: Enter and Space then work
          with no extra code, and the row announces itself as expandable. The
          trailing chevron gives sighted users the same signal aria-expanded
          already gives assistive tech. */}
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
          <p className="truncate text-headline font-semibold text-label">{transaction.merchantName}</p>
          <p className="mt-0.5 truncate text-subheadline text-label-secondary">
            {formatDate(transaction.date)} · {transaction.category ?? 'Uncategorised'}
            {receipt && ' · Receipt'}
          </p>
        </div>
        <span className="shrink-0 text-headline tabular-nums text-label">
          {formatMoney(transaction.amount)}
        </span>
        <span
          className={`shrink-0 text-label-tertiary transition-transform duration-200 ease-out ${open ? 'rotate-180' : ''}`}
        >
          <ChevronDown />
        </span>
      </button>

      {open && (
        <EditPanel
          id={panelId}
          token={token}
          transaction={transaction}
          categories={categories}
          onAddCategory={onAddCategory}
          onSaved={onSaved}
          onDeleted={onDeleted}
          onCancel={onToggle}
        />
      )}
    </li>
  )
}
