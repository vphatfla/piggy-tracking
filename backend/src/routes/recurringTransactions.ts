import { Router } from 'express'
import {
  badRequest,
  HttpError,
  parseIdParam,
  requiredDate,
  requiredInt,
  requiredMoney,
  requiredMonth,
  requiredString,
  serializeRecurringTransaction,
  serializeTransaction,
} from '../http.ts'
import { authedUserId, requireAuth } from '../middleware/auth.ts'
import { prisma } from '../prisma.ts'
import { monthBefore, occurrenceDate } from '../recurring.ts'
import { usableCategory } from './transactions.ts'

export const recurringTransactionsRouter = Router()

// As everywhere else: userId comes from the access token, never the request.
recurringTransactionsRouter.use(requireAuth)

const toMonth = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`

/** Resolves a series the caller owns, or throws. Always `authedUserId`, never
 *  `visibleUserIds` — a share partner's generated occurrences are visible
 *  (through Transaction's own sharing rule), but the series itself is not a
 *  partner's to edit or end, the same asymmetry Income's write routes have. */
async function ownedSeries(userId: number, id: number) {
  const series = await prisma.recurringTransaction.findFirst({ where: { id, userId } })
  if (!series) throw new HttpError(404, `No recurring transaction with id ${id}`)
  return series
}

// GET /api/recurring-transactions — the caller's own series, so the
// frontend's edit-scope prompt (EditPanel) knows a series' current amount/
// category/end date without guessing from one generated occurrence.
recurringTransactionsRouter.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.recurringTransaction.findMany({
      where: { userId: authedUserId(req) },
      orderBy: [{ id: 'asc' }],
    })
    res.json(rows.map(serializeRecurringTransaction))
  } catch (err) {
    next(err)
  }
})

// POST /api/recurring-transactions  { merchantName, amount, categoryId, date, endMonth? }
//
// Creates the series — day/startMonth derived from `date` — and its first
// occurrence as a real Transaction row, atomically: the current month's
// spending shouldn't wait on the next GET's generation sweep. Unlike
// Income's POST, endMonth MAY be set here: a lease or a financed purchase
// usually has a known end date up front, where an income source usually
// doesn't.
recurringTransactionsRouter.post('/', async (req, res, next) => {
  try {
    const userId = authedUserId(req)
    const categoryId = requiredInt(req.body, 'categoryId')
    await usableCategory(userId, categoryId)

    const date = requiredDate(req.body, 'date')
    const merchantName = requiredString(req.body, 'merchantName')
    const amount = requiredMoney(req.body, 'amount')
    if (amount.isNegative()) throw badRequest('amount must not be negative')

    const startMonth = toMonth(date)
    const day = date.getUTCDate()

    let endMonth: string | null = null
    if ('endMonth' in (req.body ?? {}) && req.body.endMonth !== null) {
      endMonth = requiredMonth(req.body, 'endMonth')
      if (endMonth < startMonth) throw badRequest('endMonth must not be before the start month')
    }

    // Returns both the series and its first occurrence — the frontend needs
    // the occurrence's own id (to scroll to / highlight it), not the series'.
    const { series, transaction } = await prisma.$transaction(async (tx) => {
      const series = await tx.recurringTransaction.create({
        data: { userId, merchantName, amount, categoryId, day, startMonth, endMonth, generatedThroughMonth: startMonth },
      })
      const transaction = await tx.transaction.create({
        data: { userId, recurringTransactionId: series.id, date, merchantName, amount, categoryId },
        include: { category: { select: { name: true } }, user: { select: { firstName: true } } },
      })
      return { series, transaction }
    })

    res.status(201).json({ series: serializeRecurringTransaction(series), transaction: serializeTransaction(transaction) })
  } catch (err) {
    next(err)
  }
})

// PATCH /api/recurring-transactions/:id
//
// Three shapes on one route, the same split incomes.ts's PATCH uses:
//
// { merchantName } alone — in-place. A plain correction, not a semantic
// change, but note it only affects FUTURE, not-yet-generated months: already-
// materialized Transaction rows hold their own copy of merchantName and are
// not retroactively touched. Fixing an already-generated occurrence is what
// PATCH /api/transactions/:id (editing the row directly) is for — the "just
// this transaction" half of the frontend's edit-scope choice, which needed no
// new code at all because of exactly this.
//
// { amount?, categoryId?, merchantName?, effectiveMonth } — "this and future
// months": closes this row at the month before effectiveMonth and opens a
// new one from effectiveMonth with the new values. Anything already
// generated at or after effectiveMonth was generated under the OLD values —
// it is reassigned to the new row and rewritten in place (range update on
// Transaction), not regenerated, so a receipt or a manual edit already on
// one of those rows survives.
//
// { endMonth } alone — "stop recurring after this month": closes the row
// with no replacement. Nothing to delete; future months were never
// pre-materialized in the first place.
recurringTransactionsRouter.patch('/:id', async (req, res, next) => {
  try {
    const userId = authedUserId(req)
    const id = parseIdParam(req.params.id)
    const body = (req.body ?? {}) as Record<string, unknown>
    const existing = await ownedSeries(userId, id)

    if ('endMonth' in body && !('effectiveMonth' in body)) {
      const endMonth = requiredMonth(body, 'endMonth')
      if (endMonth < existing.startMonth) throw badRequest('endMonth must not be before the start month')
      const updated = await prisma.recurringTransaction.update({
        where: { id },
        data: {
          endMonth,
          generatedThroughMonth: existing.generatedThroughMonth > endMonth ? endMonth : existing.generatedThroughMonth,
        },
      })
      res.json(serializeRecurringTransaction(updated))
      return
    }

    if ('effectiveMonth' in body) {
      const effectiveMonth = requiredMonth(body, 'effectiveMonth')
      if (effectiveMonth <= existing.startMonth) throw badRequest('effectiveMonth must be after the start month')

      const merchantName = 'merchantName' in body ? requiredString(body, 'merchantName') : existing.merchantName
      const amount = 'amount' in body ? requiredMoney(body, 'amount') : existing.amount
      if (amount.isNegative()) throw badRequest('amount must not be negative')
      let categoryId = existing.categoryId
      if ('categoryId' in body) {
        categoryId = body.categoryId === null ? null : (await usableCategory(userId, requiredInt(body, 'categoryId'))).id
      }

      const closedAt = monthBefore(effectiveMonth)
      // Whatever this row had already generated at or after effectiveMonth
      // moves to the new row below; closing can only ever move
      // generatedThroughMonth *down* to closedAt, never up.
      const reassignedThrough = existing.generatedThroughMonth > closedAt ? existing.generatedThroughMonth : closedAt

      const created = await prisma.$transaction(async (tx) => {
        await tx.recurringTransaction.update({
          where: { id },
          data: {
            endMonth: closedAt,
            generatedThroughMonth:
              existing.generatedThroughMonth < closedAt ? existing.generatedThroughMonth : closedAt,
          },
        })
        const row = await tx.recurringTransaction.create({
          data: {
            userId,
            merchantName,
            amount,
            categoryId,
            day: existing.day,
            startMonth: effectiveMonth,
            generatedThroughMonth: reassignedThrough,
          },
        })
        await tx.transaction.updateMany({
          where: { recurringTransactionId: existing.id, date: { gte: occurrenceDate(effectiveMonth, existing.day) } },
          data: { recurringTransactionId: row.id, merchantName, amount, categoryId },
        })
        return row
      })

      res.json(serializeRecurringTransaction(created))
      return
    }

    if ('merchantName' in body) {
      const updated = await prisma.recurringTransaction.update({
        where: { id },
        data: { merchantName: requiredString(body, 'merchantName') },
      })
      res.json(serializeRecurringTransaction(updated))
      return
    }

    throw badRequest('No updatable fields in request body')
  } catch (err) {
    next(err)
  }
})

// DELETE /api/recurring-transactions/:id
//
// Deletes the series only. Its generated Transaction rows survive with
// recurringTransactionId set to NULL (SetNull) — same rule category deletion
// already follows: the label can disappear, the spending that already
// happened does not.
recurringTransactionsRouter.delete('/:id', async (req, res, next) => {
  try {
    const { count } = await prisma.recurringTransaction.deleteMany({
      where: { id: parseIdParam(req.params.id), userId: authedUserId(req) },
    })
    if (count === 0) throw new HttpError(404, `No recurring transaction with id ${req.params.id}`)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
