import { Router } from 'express'
import {
  HttpError,
  optionalInt,
  requiredMoney,
  requiredString,
  serializeTransaction,
} from '../http.ts'
import { authedUserId, requireAuth } from '../middleware/auth.ts'
import { prisma } from '../prisma.ts'

export const transactionsRouter = Router()

// See receipts.ts — userId comes from the access token, never the request.
transactionsRouter.use(requireAuth)

// GET /api/transactions
transactionsRouter.get('/', async (req, res, next) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { userId: authedUserId(req) },
      orderBy: { id: 'desc' },
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

    // receiptId is the one field that could still point across users, so it is
    // checked explicitly — the FK alone only proves the receipt exists.
    if (receiptId !== null) {
      const receipt = await prisma.receipt.findFirst({
        where: { id: receiptId, userId },
        select: { id: true },
      })
      if (!receipt) throw new HttpError(404, `No receipt with id ${receiptId}`)
    }

    const transaction = await prisma.transaction.create({
      data: {
        userId,
        receiptId,
        merchantName: requiredString(req.body, 'merchantName'),
        amount: requiredMoney(req.body, 'amount'),
        category: requiredString(req.body, 'category'),
      },
    })
    res.status(201).json(serializeTransaction(transaction))
  } catch (err) {
    next(err)
  }
})
