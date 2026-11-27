import { cents } from './format'
import type { Transaction } from './api'

/** Spending per category for the month in view, in integer cents, from rows
 *  already in memory — one month's transactions are all here, so a round trip
 *  to aggregate them would buy nothing.
 *
 *  The NULL key is not an oversight: rows whose category was deleted sit
 *  outside every budget line, and dropping them would make the per-category
 *  numbers quietly fail to sum to the month total. NULL is not the only key
 *  that can land outside those lines, though — see `hasBudgetRow` in
 *  useDashboard.ts, which is what decides. Keep this map keyed on the raw
 *  `categoryId` and let that predicate judge. **Move this to
 *  GET /api/transactions/summary the day a month's rows get paginated** — the
 *  same day sortTransactions has to move server-side, and for the same reason. */
export function spendByCategory(transactions: Transaction[]) {
  const spent = new Map<number | null, number>()
  for (const t of transactions) {
    spent.set(t.categoryId, (spent.get(t.categoryId) ?? 0) + cents(t.amount))
  }
  return spent
}

/** The budget-bar fill colour for one category's spend, as a 5-step spectrum
 *  rather than a plain under/over binary. Bands are unclamped — a row at
 *  300% of its limit is still "deep red", even though the bar's own width is
 *  clamped to 100% elsewhere so it doesn't render out of its track. The
 *  100% boundary matches `over = spent > limit` exactly: at or under the
 *  limit is still "orange", not yet "red". */
export function budgetBarColorClass(spent: number, limit: number): string {
  const ratio = limit > 0 ? (spent / limit) * 100 : 0
  if (ratio > 110) return 'bg-budget-red-deep'
  if (ratio > 100) return 'bg-danger'
  if (ratio >= 90) return 'bg-accent'
  if (ratio >= 70) return 'bg-budget-yellow'
  return 'bg-success'
}
