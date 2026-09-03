// Money crosses the API as a string ("48.75") and stays one — see api.ts. These
// helpers are for *display only*; never feed their output back into a request.

// The API carries no currency code, so the app assumes one. Changing it, or
// making it per-user, starts here.
const CURRENCY = 'USD'

const money = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: CURRENCY,
})

export const formatMoney = (value: string | number) => money.format(Number(value))

/** Sums decimal strings for display. Cents can drift through float addition, so
 *  the arithmetic is done in integer cents and only then divided. */
export const sumMoney = (values: string[]) =>
  values.reduce((cents, v) => cents + Math.round(Number(v) * 100), 0) / 100

const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

/** Formats a "YYYY-MM-DD" calendar date for display.
 *  Built from split parts on purpose: `new Date('2026-09-02')` parses as UTC
 *  midnight, so formatting it anywhere west of Greenwich renders the previous
 *  day. Constructing from components keeps it local from the start. */
export function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return dayMonth.format(new Date(y, m - 1, d))
}

/** Today as "YYYY-MM-DD" in the *user's* timezone, which is the only timezone
 *  that can answer "what day is it" for a date the user is about to enter. */
export function todayIso() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
