import { Router } from 'express'
import { Prisma } from '../generated/prisma/client.ts'
import {
  badRequest,
  HttpError,
  optionalDate,
  optionalInt,
  parseIdParam,
  requiredDate,
  requiredInt,
  requiredMoney,
  requiredString,
  serializeTransaction,
} from '../http.ts'
import { authedUserId, requireAuth } from '../middleware/auth.ts'
import { prisma } from '../prisma.ts'
import { effectiveBudgetOwnerId, visibleUserIds } from '../sharing.ts'

export const transactionsRouter = Router()

// See receipts.ts — userId comes from the access token, never the request.
transactionsRouter.use(requireAuth)

// GET /api/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// One inclusive range filter rather than a `?month=` endpoint: the month view is
// a preset over it, and a multi-month range is the same call with wider bounds.
// Two endpoints computing the same window would drift apart.
transactionsRouter.get('/', async (req, res, next) => {
  try {
    // optionalDate only indexes a field off an object, so it validates query
    // params unchanged — and a repeated ?from=a&from=b arrives as an array and
    // fails its typeof check with the same 400 as any other malformed input.
    const from = optionalDate(req.query, 'from')
    const to = optionalDate(req.query, 'to')
    if (from && to && from > to) throw badRequest('from must not be after to')

    const transactions = await prisma.transaction.findMany({
      where: {
        // Just the caller normally; both members' ids under an active
        // share, which is the one change that pools two people's spending
        // into one view.
        userId: { in: await visibleUserIds(authedUserId(req)) },
        // Omitted entirely when neither bound is given, so a bare GET still
        // means "everything".
        ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      // One query rather than a name lookup per row; serializeTransaction
      // flattens category to `category: string | null` and user to
      // `ownerName`, so a shared view can show whose row each one is.
      include: { category: { select: { name: true } }, user: { select: { firstName: true } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    })
    res.json(transactions.map(serializeTransaction))
  } catch (err) {
    next(err)
  }
})

// POST /api/transactions
transactionsRouter.post('/', async (req, res, next) => {
  try {
    const userId = authedUserId(req)
    const receiptId = optionalInt(req.body, 'receiptId')

    // Required here even though the column is nullable: every transaction the
    // app creates is categorised, while NULL is reserved for rows whose
    // category was later deleted. Checked against the share's canonical
    // budget owner, not the caller directly — a shared category belongs to
    // whichever member is `budgetOwnerUserId`, not necessarily the poster.
    const categoryId = requiredInt(req.body, 'categoryId')
    const category = await ownedCategory(await effectiveBudgetOwnerId(userId), categoryId)

    // receiptId is the one field that could still point across users, so it is
    // checked explicitly — the FK alone only proves the receipt exists. Widened
    // to the shared visible set: under an active share a transaction may
    // reference either member's receipt.
    let receipt: { id: number; date: Date } | null = null
    if (receiptId !== null) {
      receipt = await prisma.receipt.findFirst({
        where: { id: receiptId, userId: { in: await visibleUserIds(userId) } },
        select: { id: true, date: true },
      })
      if (!receipt) throw new HttpError(404, `No receipt with id ${receiptId}`)
    }

    // Required, except when a receipt supplies it — a receipt already carries
    // the day the money was spent. Defaulting to the server's "today" instead
    // would be a timezone guess about the user, which is the bug this column
    // exists to prevent.
    const date = optionalDate(req.body, 'date') ?? receipt?.date
    if (!date) throw badRequest('date is required (YYYY-MM-DD) unless receiptId supplies one')

    const transaction = await prisma.transaction.create({
      data: {
        userId,
        receiptId,
        date,
        merchantName: requiredString(req.body, 'merchantName'),
        amount: requiredMoney(req.body, 'amount'),
        categoryId,
      },
      include: { user: { select: { firstName: true } } },
    })
    // The category name is already in hand from the ownership check, so the
    // created row comes back in the same shape the list endpoint returns.
    res.status(201).json(serializeTransaction({ ...transaction, category }))
  } catch (err) {
    next(err)
  }
})

/** Resolves a category the caller is allowed to use, or throws. Shared by POST
 *  and PATCH: the foreign key proves the category exists, not whose it is. */
async function ownedCategory(userId: number, categoryId: number) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true, name: true },
  })
  if (!category) throw new HttpError(404, `No category with id ${categoryId}`)
  return category
}

// PATCH /api/transactions/:id
//
// Partial by design: only the fields actually present in the body are written.
// That is why every field is guarded by `in` rather than read through the
// `optional*` helpers — those return null both for an absent field and for an
// explicit null, which on POST mean the same thing but here do not. Omitting
// `receiptId` means "leave it alone"; sending `"receiptId": null` means
// "detach the receipt". Present fields go through the *same* validators a
// create uses, so an edited amount is checked exactly as a new one is.
transactionsRouter.patch('/:id', async (req, res, next) => {
  try {
    const userId = authedUserId(req)
    const ownerIds = await visibleUserIds(userId)
    const id = parseIdParam(req.params.id)
    const body = (req.body ?? {}) as Record<string, unknown>

    const data: Prisma.TransactionUncheckedUpdateInput = {}
    if ('merchantName' in body) data.merchantName = requiredString(body, 'merchantName')
    if ('amount' in body) data.amount = requiredMoney(body, 'amount')
    if ('date' in body) data.date = requiredDate(body, 'date')

    if ('categoryId' in body) {
      // null clears the category — the column is nullable precisely so a row can
      // outlive its label. Checked against the share's canonical budget owner,
      // same reasoning as POST.
      data.categoryId =
        body.categoryId === null
          ? null
          : (await ownedCategory(await effectiveBudgetOwnerId(userId), requiredInt(body, 'categoryId'))).id
    }

    if ('receiptId' in body) {
      const receiptId = optionalInt(body, 'receiptId')
      if (receiptId !== null) {
        const receipt = await prisma.receipt.findFirst({
          where: { id: receiptId, userId: { in: ownerIds } },
          select: { id: true },
        })
        if (!receipt) throw new HttpError(404, `No receipt with id ${receiptId}`)
      }
      data.receiptId = receiptId
    }

    // An empty patch is a caller mistake, not a no-op worth pretending to honour.
    if (Object.keys(data).length === 0) throw badRequest('No updatable fields in request body')

    // updateMany, not update: userId sits in the WHERE clause, so ownership is
    // part of the statement rather than a separate check with a window after
    // it. `in: ownerIds` is what lets a caller edit their share partner's
    // transaction — just the caller's own id when there is no active share.
    const { count } = await prisma.transaction.updateMany({ where: { id, userId: { in: ownerIds } }, data })
    if (count === 0) throw new HttpError(404, `No transaction with id ${id}`)

    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: { id },
      include: { category: { select: { name: true } }, user: { select: { firstName: true } } },
    })
    res.json(serializeTransaction(transaction))
  } catch (err) {
    next(err)
  }
})

// DELETE /api/transactions/:id
//
// Hard delete. A `deletedAt` flag would mean every query in the app forever
// after has to remember to exclude it, and the one that forgets puts a deleted
// transaction back into a total.
transactionsRouter.delete('/:id', async (req, res, next) => {
  try {
    // deleteMany for the same reason PATCH uses updateMany — see above.
    // `delete({ where: { id } })` deletes any user's row by id.
    const { count } = await prisma.transaction.deleteMany({
      where: { id: parseIdParam(req.params.id), userId: { in: await visibleUserIds(authedUserId(req)) } },
    })
    if (count === 0) throw new HttpError(404, `No transaction with id ${req.params.id}`)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
