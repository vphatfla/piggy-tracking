import { Router } from 'express'
import { Prisma } from '../generated/prisma/client.ts'
import {
  badRequest,
  HttpError,
  parseIdParam,
  requiredMoney,
  requiredMonth,
  requiredString,
  serializeIncome,
} from '../http.ts'
import { authedUserId, requireAuth } from '../middleware/auth.ts'
import { prisma } from '../prisma.ts'
import { visibleUserIds } from '../sharing.ts'

export const incomesRouter = Router()

// As everywhere else: userId comes from the access token, never the request.
incomesRouter.use(requireAuth)

const INCOME_INCLUDE = { user: { select: { firstName: true } } } as const

function requiredIncomeType(body: unknown, field: string): 'ONE_TIME' | 'RECURRING' {
  const value = (body as Record<string, unknown> | null)?.[field]
  if (value !== 'ONE_TIME' && value !== 'RECURRING') {
    throw badRequest(`${field} is required and must be "ONE_TIME" or "RECURRING"`)
  }
  return value
}

/** The month immediately before the given one — used to close a recurring row
 *  off (`endMonth`) the instant before the replacement row it's superseded by
 *  starts. Kept in string arithmetic, not a Date round-trip, for the same
 *  reason `month` is VARCHAR(7): no timezone to get wrong. */
function monthBefore(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const prevMonth = m === 1 ? 12 : m - 1
  const prevYear = m === 1 ? year - 1 : year
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`
}

// GET /api/incomes?month=YYYY-MM
//
// Income *effective* in that month, for every user visible to the caller —
// visibleUserIds, not effectiveBudgetOwnerId: income does not merge under a
// share the way Category/Budget do, it stays attributed and separate, only
// pooled for visibility (same rule Transaction uses).
incomesRouter.get('/', async (req, res, next) => {
  try {
    const month = requiredMonth(req.query, 'month')

    const rows = await prisma.income.findMany({
      where: {
        userId: { in: await visibleUserIds(authedUserId(req)) },
        OR: [
          { type: 'ONE_TIME', month },
          { type: 'RECURRING', month: { lte: month }, AND: [{ OR: [{ endMonth: null }, { endMonth: { gte: month } }] }] },
        ],
      },
      include: INCOME_INCLUDE,
      orderBy: [{ userId: 'asc' }, { id: 'asc' }],
    })

    res.json(rows.map(serializeIncome))
  } catch (err) {
    next(err)
  }
})

// POST /api/incomes  { source, amount, type, month, endMonth? }
//
// userId is always the caller, never derived from the share — an income row
// is authored by whoever entered it, same rule as Transaction.POST. endMonth
// only makes sense on a RECURRING row that's already been closed off by a
// later edit; a caller can't set one at creation.
incomesRouter.post('/', async (req, res, next) => {
  try {
    const userId = authedUserId(req)
    const type = requiredIncomeType(req.body, 'type')
    const amount = requiredMoney(req.body, 'amount')
    if (amount.isNegative()) throw badRequest('amount must not be negative')
    if ('endMonth' in (req.body ?? {}) && req.body.endMonth !== null) {
      throw badRequest('endMonth cannot be set on create')
    }

    const income = await prisma.income.create({
      data: {
        userId,
        source: requiredString(req.body, 'source'),
        amount,
        type,
        month: requiredMonth(req.body, 'month'),
      },
      include: INCOME_INCLUDE,
    })
    res.status(201).json(serializeIncome(income))
  } catch (err) {
    next(err)
  }
})

/** Resolves a row the caller owns, or throws. Deliberately `authedUserId`, not
 *  `visibleUserIds` — under a share a partner's income is visible but not
 *  editable, the one place Income's write path differs from Transaction's. */
async function ownedIncome(userId: number, id: number) {
  const income = await prisma.income.findFirst({ where: { id, userId } })
  if (!income) throw new HttpError(404, `No income with id ${id}`)
  return income
}

// PATCH /api/incomes/:id  { source? } | { amount, effectiveMonth }
//
// Two shapes: a plain field correction (source) updates in place — nothing
// about it implies a past month was scored wrong. An amount change on a
// RECURRING row requires effectiveMonth and is forward-only: it closes the
// current row at the month before and opens a new one from effectiveMonth,
// so a raise doesn't retroactively change what an earlier month compared
// spending against. A ONE_TIME row's amount has no history to preserve and
// updates in place.
incomesRouter.patch('/:id', async (req, res, next) => {
  try {
    const userId = authedUserId(req)
    const id = parseIdParam(req.params.id)
    const body = (req.body ?? {}) as Record<string, unknown>
    const existing = await ownedIncome(userId, id)

    if ('effectiveMonth' in body) {
      if (existing.type !== 'RECURRING') throw badRequest('effectiveMonth only applies to a RECURRING income')
      const effectiveMonth = requiredMonth(body, 'effectiveMonth')
      const amount = requiredMoney(body, 'amount')
      if (amount.isNegative()) throw badRequest('amount must not be negative')
      if (effectiveMonth <= existing.month) throw badRequest('effectiveMonth must be after the start month')

      const [, created] = await prisma.$transaction([
        prisma.income.update({ where: { id }, data: { endMonth: monthBefore(effectiveMonth) } }),
        prisma.income.create({
          data: { userId, source: existing.source, amount, type: 'RECURRING', month: effectiveMonth },
          include: INCOME_INCLUDE,
        }),
      ])
      res.json(serializeIncome(created))
      return
    }

    const data: { source?: string; amount?: Prisma.Decimal } = {}
    if ('source' in body) data.source = requiredString(body, 'source')
    if ('amount' in body) {
      const amount = requiredMoney(body, 'amount')
      if (amount.isNegative()) throw badRequest('amount must not be negative')
      data.amount = amount
    }
    if (Object.keys(data).length === 0) throw badRequest('No updatable fields in request body')

    const income = await prisma.income.update({ where: { id }, data, include: INCOME_INCLUDE })
    res.json(serializeIncome(income))
  } catch (err) {
    next(err)
  }
})

// DELETE /api/incomes/:id
incomesRouter.delete('/:id', async (req, res, next) => {
  try {
    // deleteMany, not delete: userId in the WHERE clause, never visibleUserIds
    // — a partner can see this row under a share but not delete it.
    const { count } = await prisma.income.deleteMany({
      where: { id: parseIdParam(req.params.id), userId: authedUserId(req) },
    })
    if (count === 0) throw new HttpError(404, `No income with id ${req.params.id}`)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
