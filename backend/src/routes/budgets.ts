import { Router } from 'express'
import {
  badRequest,
  HttpError,
  parseIdParam,
  requiredInt,
  requiredMoney,
  requiredMonth,
} from '../http.ts'
import { authedUserId, requireAuth } from '../middleware/auth.ts'
import { prisma } from '../prisma.ts'

export const budgetsRouter = Router()

// As everywhere else: userId comes from the access token, never the request.
budgetsRouter.use(requireAuth)

/** What a caller sees. `month` is the month the limit was *set* for, which is
 *  not always the month asked about — a bare amount would lose the difference
 *  between "set for September" and "carried over from March", and the UI needs
 *  it: editing an inherited limit inserts a new row, it does not edit history. */
type EffectiveBudget = {
  categoryId: number
  amount: string
  month: string
  inherited: boolean
}

/** Resolves a category the caller owns, or throws. Same reason as in
 *  transactions.ts: the foreign key proves the category exists, not whose it is. */
async function ownedCategory(userId: number, categoryId: number) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true },
  })
  if (!category) throw new HttpError(404, `No category with id ${categoryId}`)
  return category
}

// GET /api/budgets/exists
//
// Has this user ever set a budget, at all — independent of which month is
// being viewed. Used once at startup to decide whether to show the first-run
// nudge; unlike GET /?month=, which only proves a budget exists at-or-before
// whatever month is asked, this can't be fooled by stepping to a month before
// the user's first budget.
budgetsRouter.get('/exists', async (req, res, next) => {
  try {
    const budget = await prisma.budget.findFirst({
      where: { userId: authedUserId(req) },
      select: { id: true },
    })
    res.json({ exists: budget !== null })
  } catch (err) {
    next(err)
  }
})

// GET /api/budgets?month=YYYY-MM
//
// The *effective* limit per category, which is the row with the greatest
// `month <= ?month`. Categories whose first budget starts after the month asked
// about are absent rather than zero — "no limit set yet" is not "a limit of 0".
//
// Resolved in JS rather than in one clever query: the greatest-per-group is a
// Postgres DISTINCT ON, which Prisma's `distinct` is not, and the row count is
// one per category per time the user changed their mind. Revisit if that stops
// being tiny.
budgetsRouter.get('/', async (req, res, next) => {
  try {
    const month = requiredMonth(req.query, 'month')

    const rows = await prisma.budget.findMany({
      where: { userId: authedUserId(req), month: { lte: month } },
      // Ascending, so a later row for the same category simply overwrites the
      // earlier one in the map below and the last write wins.
      orderBy: { month: 'asc' },
      select: { categoryId: true, month: true, amount: true },
    })

    const effective = new Map<number, EffectiveBudget>()
    for (const row of rows) {
      effective.set(row.categoryId, {
        categoryId: row.categoryId,
        amount: row.amount.toFixed(2),
        month: row.month,
        inherited: row.month !== month,
      })
    }

    res.json([...effective.values()].sort((a, b) => a.categoryId - b.categoryId))
  } catch (err) {
    next(err)
  }
})

// PUT /api/budgets  { categoryId, month, amount }
//
// Upsert of exactly one (categoryId, month) row — PUT rather than POST because
// setting the same limit twice has to be the same as setting it once. Editing
// an inherited limit lands here with the *viewed* month, which inserts a new
// row and leaves the older one to keep scoring the months it applied to.
budgetsRouter.put('/', async (req, res, next) => {
  try {
    const userId = authedUserId(req)
    const categoryId = requiredInt(req.body, 'categoryId')
    const month = requiredMonth(req.body, 'month')
    const amount = requiredMoney(req.body, 'amount')
    // requiredMoney allows a negative — correct for a transaction (a refund),
    // meaningless for a limit.
    if (amount.isNegative()) throw badRequest('amount must not be negative')

    await ownedCategory(userId, categoryId)

    const budget = await prisma.budget.upsert({
      where: { userId_categoryId_month: { userId, categoryId, month } },
      update: { amount },
      create: { userId, categoryId, month, amount },
    })

    res.json({
      categoryId: budget.categoryId,
      amount: budget.amount.toFixed(2),
      month: budget.month,
      // A row that was just written for this month is never inherited.
      inherited: false,
    } satisfies EffectiveBudget)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/budgets/:categoryId?month=YYYY-MM
//
// Removes the limit set *for that exact month*, which is not the same as
// "remove the budget": the category falls back to whatever earlier row it
// inherits from, which may well be another number. Deleting a month that only
// ever inherited is a 404, not a silent success — there was nothing there.
budgetsRouter.delete('/:categoryId', async (req, res, next) => {
  try {
    const month = requiredMonth(req.query, 'month')
    // deleteMany, not delete: userId in the WHERE clause makes ownership part
    // of the statement rather than a check with a window after it.
    const { count } = await prisma.budget.deleteMany({
      where: {
        userId: authedUserId(req),
        categoryId: parseIdParam(req.params.categoryId, 'categoryId'),
        month,
      },
    })
    if (count === 0) throw new HttpError(404, `No budget for that category in ${month}`)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
