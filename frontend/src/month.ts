// A month is a "YYYY-MM" string. Every helper here does string/number
// arithmetic and never parses a date from a string: `new Date('2026-09-01')`
// is UTC midnight, which slides to the previous day west of Greenwich — the
// same trap `formatDate` in format.ts documents.

const pad = (n: number) => String(n).padStart(2, '0')

/** The month the *user* is in. Their clock is the only one that can answer it. */
export function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
}

export function addMonths(month: string, delta: number) {
  const [year, m] = month.split('-').map(Number)
  const zeroBased = year * 12 + (m - 1) + delta
  return `${Math.floor(zeroBased / 12)}-${pad((zeroBased % 12) + 1)}`
}

/** Inclusive bounds for the API's `from`/`to`. */
export function monthBounds(month: string) {
  const [year, m] = month.split('-').map(Number)
  // Day 0 of the next month is the last day of this one — and this Date is
  // built from components, so it is local and safe.
  const lastDay = new Date(year, m, 0).getDate()
  return { from: `${month}-01`, to: `${month}-${pad(lastDay)}` }
}

const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

export function formatMonthLabel(month: string) {
  const [year, m] = month.split('-').map(Number)
  return monthLabel.format(new Date(year, m - 1, 1))
}
