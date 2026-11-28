import { prisma } from './prisma.ts'

/** The month immediately before/after the given one — plain VARCHAR(7) string
 *  arithmetic, the same idiom `incomes.ts`'s own `monthBefore` uses: no Date
 *  round-trip, no timezone to get wrong. Exported because `recurringTransactions.ts`
 *  needs both for its forward-split PATCH, the same shape Income's PATCH uses. */
export function monthBefore(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const prevMonth = m === 1 ? 12 : m - 1
  const prevYear = m === 1 ? year - 1 : year
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`
}

export function monthAfter(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const nextMonth = m === 12 ? 1 : m + 1
  const nextYear = m === 12 ? year + 1 : year
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`
}

/** Every month strictly after `fromExclusive` up to and including
 *  `toInclusive` — empty when there is nothing in between. */
function monthsBetween(fromExclusive: string, toInclusive: string): string[] {
  const months: string[] = []
  let m = monthAfter(fromExclusive)
  while (m <= toInclusive) {
    months.push(m)
    m = monthAfter(m)
  }
  return months
}

/** The server's own "now", as a month. The only thing `ensureGenerated` needs
 *  this for is "don't materialize the future" — which side of a month
 *  turnover a given request lands on is harmless, since the sweep
 *  re-converges on every call regardless of server-vs-user timezone skew. */
function currentMonthUTC(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

/** A month's real last day, in UTC — day 0 of the next month is the last day
 *  of this one. Kept in UTC to match `requiredDate` in http.ts, which parses
 *  every other calendar date on this API as UTC midnight. */
function lastDayOfMonthUTC(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
}

/** The Date for one occurrence: `day` clamped to the month's real last day —
 *  day 31 in February posts on the 28th/29th, the clamp any billing system
 *  uses for a day-31 charge in a shorter month. */
export function occurrenceDate(month: string, day: number): Date {
  const [year, m] = month.split('-').map(Number)
  const clamped = Math.min(day, lastDayOfMonthUTC(year, m))
  return new Date(Date.UTC(year, m - 1, clamped))
}

/** Materializes every un-generated month, for every RecurringTransaction
 *  `userId` owns, up through the real calendar month or the series' own
 *  `endMonth` — whichever is sooner, so a future month's occurrence is never
 *  created before that month actually arrives. The only place generation
 *  happens: called from `GET /api/transactions`. This repo deliberately has
 *  no cron/background-job infra, so there is nowhere else for this to run.
 *
 *  Idempotent twice over: `generatedThroughMonth` only ever advances, so an
 *  already-generated month is never revisited, and the upsert's `update: {}`
 *  means an occurrence a user has since edited by hand is never clobbered. */
export async function ensureGenerated(userId: number): Promise<void> {
  const now = currentMonthUTC()
  const series = await prisma.recurringTransaction.findMany({
    where: { userId, startMonth: { lte: now } },
  })

  for (const s of series) {
    const through = s.endMonth !== null && s.endMonth < now ? s.endMonth : now
    if (through <= s.generatedThroughMonth) continue

    const months = monthsBetween(s.generatedThroughMonth, through)
    await prisma.$transaction([
      ...months.map((month) =>
        prisma.transaction.upsert({
          where: {
            recurringTransactionId_date: { recurringTransactionId: s.id, date: occurrenceDate(month, s.day) },
          },
          update: {},
          create: {
            userId: s.userId,
            recurringTransactionId: s.id,
            date: occurrenceDate(month, s.day),
            merchantName: s.merchantName,
            amount: s.amount,
            categoryId: s.categoryId,
          },
        }),
      ),
      prisma.recurringTransaction.update({ where: { id: s.id }, data: { generatedThroughMonth: through } }),
    ])
  }
}
