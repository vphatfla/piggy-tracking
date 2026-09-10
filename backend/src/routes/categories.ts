import { Router } from 'express'
import { HttpError, parseIdParam, requiredString } from '../http.ts'
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

// PATCH /api/categories/:id  { name }
//
// Rename. The case-insensitive lookup below is the real uniqueness rule, same
// as on POST: @@unique([userId, name]) only catches exact duplicates, so
// renaming "Dining" to "groceries" while "Groceries" exists would otherwise
// create two categories the picker shows as the same thing. A concurrent pair
// of renames could still slip past it — the index then answers with P2002,
// which the error middleware already maps to the same 409.
categoriesRouter.patch('/:id', async (req, res, next) => {
  try {
    const userId = authedUserId(req)
    const id = parseIdParam(req.params.id)
    const name = requiredString(req.body, 'name')

    const clash = await prisma.category.findFirst({
      where: { userId, id: { not: id }, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    })
    if (clash) throw new HttpError(409, `You already have a category named "${name}"`)

    // updateMany, not update: the userId sits in the WHERE clause, so a caller
    // cannot rename another user's category by guessing its id.
    const { count } = await prisma.category.updateMany({ where: { id, userId }, data: { name } })
    if (count === 0) throw new HttpError(404, `No category with id ${id}`)

    res.json(await prisma.category.findUniqueOrThrow({ where: { id } }))
  } catch (err) {
    next(err)
  }
})

// DELETE /api/categories/:id
//
// Deletes the label, never the spending. The schema does the rest: this
// category's transactions survive with `categoryId` set to NULL (they surface
// as "Uncategorised" and stop counting against any limit), while its budget
// rows cascade away — in every month, not just the one the caller happens to
// be looking at. That asymmetry is deliberate; see backend/CLAUDE.md.
categoriesRouter.delete('/:id', async (req, res, next) => {
  try {
    // deleteMany for the same reason PATCH uses updateMany, above.
    const { count } = await prisma.category.deleteMany({
      where: { id: parseIdParam(req.params.id), userId: authedUserId(req) },
    })
    if (count === 0) throw new HttpError(404, `No category with id ${req.params.id}`)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
