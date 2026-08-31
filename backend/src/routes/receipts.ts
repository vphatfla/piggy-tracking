import { Router } from 'express'
import { optionalString, requiredDate, requiredMoney, serializeReceipt } from '../http.ts'
import { authedUserId, requireAuth } from '../middleware/auth.ts'
import { prisma } from '../prisma.ts'

export const receiptsRouter = Router()

// userId is never read from the query string or the body any more — it comes
// from the verified access token, so one user cannot read or write another's
// receipts by editing a parameter.
receiptsRouter.use(requireAuth)

// GET /api/receipts
receiptsRouter.get('/', async (req, res, next) => {
  try {
    const receipts = await prisma.receipt.findMany({
      where: { userId: authedUserId(req) },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    })
    res.json(receipts.map(serializeReceipt))
  } catch (err) {
    next(err)
  }
})

// POST /api/receipts
receiptsRouter.post('/', async (req, res, next) => {
  try {
    const receipt = await prisma.receipt.create({
      data: {
        userId: authedUserId(req),
        date: requiredDate(req.body, 'date'),
        totalAmount: requiredMoney(req.body, 'totalAmount'),
        receiptFileName: optionalString(req.body, 'receiptFileName'),
      },
    })
    res.status(201).json(serializeReceipt(receipt))
  } catch (err) {
    next(err)
  }
})
