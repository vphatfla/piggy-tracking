import { Router } from 'express'
import { HttpError } from '../http.ts'
import { cancelInvite, createInvite, liveInvite } from '../invites.ts'
import { authedUserId, requireAuth } from '../middleware/auth.ts'
import { rateLimit } from '../middleware/rateLimit.ts'
import { prisma } from '../prisma.ts'
import { activeShareWhere } from '../sharing.ts'

export const invitesRouter = Router()

// As everywhere else: userId comes from the access token, never the request.
invitesRouter.use(requireAuth)

const HOUR_MS = 60 * 60 * 1000

// Metered mostly against churn rather than guessing — nothing is secret on the
// way out — but an unmetered creator could spin rows and chew through the code
// space. The global cap is pure DoS protection.
const createLimiter = rateLimit({ perUser: 10, global: 200, windowMs: HOUR_MS })

// POST /api/invites
//
// The caller's live code, minting one if they have none. Idempotent while a
// code is live: asking again returns the same code rather than replacing it,
// because a code already sent to someone must not stop working just because
// its sender reopened the screen. `DELETE /me` is how you get rid of one.
invitesRouter.post('/', createLimiter, async (req, res, next) => {
  try {
    const userId = authedUserId(req)

    // Nothing to invite anyone *to* while already sharing — and minting here
    // would hand out a code that could never be redeemed. The UI only offers
    // the button in the no-share state, but the Share sheet stays mounted
    // while closed, so a stale client is the likely caller, not an exotic one.
    const sharing = await prisma.share.findFirst({ where: activeShareWhere([userId]) })
    if (sharing) throw new HttpError(409, 'You are already sharing with someone')

    res.status(201).json(await createInvite(userId))
  } catch (err) {
    next(err)
  }
})

// GET /api/invites/me
//
// The caller's live code, or null. Includes the code itself: it is readable for
// its whole life by design, so the sender can reopen this screen and reread it.
invitesRouter.get('/me', async (req, res, next) => {
  try {
    res.json(await liveInvite(authedUserId(req)))
  } catch (err) {
    next(err)
  }
})

// DELETE /api/invites/me
//
// 204 whether or not there was anything to cancel. A singleton that is already
// gone is a success, not a 404 — the same call `DELETE /api/shares/:id` makes
// differently, and for a reason: that one takes an id which might not be yours.
invitesRouter.delete('/me', async (req, res, next) => {
  try {
    await cancelInvite(authedUserId(req))
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
