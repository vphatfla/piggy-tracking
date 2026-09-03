import { Router } from 'express'
import { requiredString } from '../http.ts'
import { authedUserId, requireAuth } from '../middleware/auth.ts'
import { prisma } from '../prisma.ts'

export const categoriesRouter = Router()

// As everywhere else: userId comes from the access token, so a caller can only
// ever see and create their own categories.
categoriesRouter.use(requireAuth)

// GET /api/categories
// Alphabetical, because this list is a picker rather than a feed — a user
// scanning for "Transport" wants it where the alphabet says it is, not wherever
// it happened to be created.
categoriesRouter.get('/', async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { userId: authedUserId(req) },
      orderBy: { name: 'asc' },
    })
    res.json(categories)
  } catch (err) {
    next(err)
  }
})

// POST /api/categories  { name }
//
// Find-or-create, not create: typing "groceries" when "Groceries" already
// exists should select the existing one, not fail with a 409 the user has no
// way to act on. 200 means "you already had this", 201 means "made you one".
//
// The case-insensitive lookup is the real uniqueness rule; the
// @@unique([userId, name]) index only catches exact duplicates. Two concurrent
// creates differing only in case could therefore both insert. For a
// single-user app driven by a dropdown that is not worth defending against —
// the fix, if it ever is, is a citext column rather than a lock.
categoriesRouter.post('/', async (req, res, next) => {
  try {
    const userId = authedUserId(req)
    const name = requiredString(req.body, 'name')

    const existing = await prisma.category.findFirst({
      where: { userId, name: { equals: name, mode: 'insensitive' } },
    })
    if (existing) {
      res.json(existing)
      return
    }

    const category = await prisma.category.create({ data: { userId, name } })
    res.status(201).json(category)
  } catch (err) {
    next(err)
  }
})
