import { Router } from 'express'
import { HttpError, parseIdParam, serializeUser } from '../http.ts'
import { authedUserId, requireAuth } from '../middleware/auth.ts'
import { prisma } from '../prisma.ts'

export const usersRouter = Router()

// Every route here is the caller's *own* record. There is no create route:
// users come into existence only through POST /api/auth/google, where the
// googleId is taken from a verified ID token rather than from the request body.
usersRouter.use(requireAuth)

// GET /api/users/me — the authenticated user, no id needed.
usersRouter.get('/me', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: authedUserId(req) } })
    if (!user) throw new HttpError(404, 'Authenticated user no longer exists')
    res.json(serializeUser(user))
  } catch (err) {
    next(err)
  }
})

// GET /api/users/:id — kept for compatibility, but only for yourself.
// 403 rather than 404 on someone else's id: the row's existence is not a secret
// worth an enumeration-proof lie here, and the honest status is clearer.
usersRouter.get('/:id', async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id)
    if (id !== authedUserId(req)) throw new HttpError(403, 'You can only read your own user')
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) throw new HttpError(404, `No user with id ${id}`)
    res.json(serializeUser(user))
  } catch (err) {
    next(err)
  }
})
