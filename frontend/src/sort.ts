import { cents } from './format'
import type { Transaction } from './api'

export type SortKey = 'date' | 'amount'
export type Sort = { key: SortKey; dir: 'asc' | 'desc' }

/** Sorting is done here rather than on the server: the list is already bounded
 *  to one month, so reordering is instant and costs no round trip, and the API
 *  keeps exactly one canonical order. **Move this server-side the day a month's
 *  rows get paginated** — nothing else in the code will hint at that. */
export function sortTransactions(list: Transaction[], sort: Sort) {
  const direction = sort.dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const primary =
      sort.key === 'amount' ? cents(a.amount) - cents(b.amount) : a.date.localeCompare(b.date)
    // Ties break on id descending, matching the server's order, so equal rows
    // do not shuffle between renders.
    return primary !== 0 ? primary * direction : b.id - a.id
  })
}
