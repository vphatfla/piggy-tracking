import { Router } from 'express'
import { badRequest, HttpError, parseIdParam, requiredCode, requiredInt } from '../http.ts'
import { invalidInvite } from '../invites.ts'
import { authedUserId, requireAuth } from '../middleware/auth.ts'
import { rateLimit } from '../middleware/rateLimit.ts'
import { prisma } from '../prisma.ts'
import { activeShareWhere } from '../sharing.ts'

export const sharesRouter = Router()

sharesRouter.use(requireAuth)

const memberSelect = { id: true, firstName: true, lastName: true, email: true } as const

type Member = { id: number; firstName: string; lastName: string; email: string }

/** Shapes a Share row for a specific caller — "partner" is always the other
 *  member, never a fixed column, since either the initiator or the partner
 *  can be the one asking. */
function serializeShare(
  share: { id: number; initiatorId: number; partnerId: number; budgetOwnerUserId: number },
  callerId: number,
  members: { initiator: Member; partner: Member },
) {
  const partner = share.initiatorId === callerId ? members.partner : members.initiator
  return {
    id: share.id,
    partner,
    budgetOwnerUserId: share.budgetOwnerUserId,
    isInitiator: share.initiatorId === callerId,
  }
}

// GET /api/shares/me
//
// The caller's active share, or null. Backs the Share settings page: no
// share means "show the invite option", a share means "show who it's with".
sharesRouter.get('/me', async (req, res, next) => {
  try {
    const userId = authedUserId(req)
    const share = await prisma.share.findFirst({
      where: { revokedAt: null, OR: [{ initiatorId: userId }, { partnerId: userId }] },
      include: { initiator: { select: memberSelect }, partner: { select: memberSelect } },
    })
    res.json(share ? serializeShare(share, userId, share) : null)
  } catch (err) {
    next(err)
  }
})

const HOUR_MS = 60 * 60 * 1000

// Five tries is generous for an 8-digit code a human was just handed, and the
// global cap is about an order of magnitude above any plausible real use of
// this app. Unlike every other limit here, this one is load-bearing: see
// docs/sharing.md and src/middleware/rateLimit.ts.
const redeemLimiter = rateLimit({ perUser: 5, global: 30, windowMs: HOUR_MS })

const alreadyShared = () => new HttpError(409, 'One of you is already sharing with someone else')

// The namespace half of the advisory lock key below. Reads as "a share
// involving this user id".
const LOCK_NS = 1

// POST /api/shares  { code }
//
// Redeems a household invite code and makes the share live. **This is the only
// way a Share is ever created.** It replaced a `{ partnerEmail }` form that
// created one immediately — no consent from the other person at all, and a 404
// on an unknown address that made it an email-enumeration oracle. Both of those
// are why it is gone, and being the sole creation path is what lets the lock
// below actually enforce one-active-share-per-user.
//
// Rate-limited, and that limiter is a security control rather than a courtesy:
// an 8-digit code is only 10^8 wide.
sharesRouter.post('/', redeemLimiter, async (req, res, next) => {
  try {
    const userId = authedUserId(req)
    const code = requiredCode(req.body, 'code')

    // Before the code is even looked at, for two reasons. A caller who is
    // already sharing gets a specific message instead of the opaque 404, since
    // their own state leaks nothing about anyone else's code — and a wrong
    // guess from such a caller never touches, let alone consumes, a real
    // invite. Re-checked under the lock below where it is race-free; this copy
    // is purely about which error comes back.
    if (await prisma.share.findFirst({ where: activeShareWhere([userId]) })) throw alreadyShared()

    const share = await prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findFirst({
        where: { code, expiresAt: { gt: new Date() } },
        select: { id: true, creatorId: true },
      })
      if (!invite) throw invalidInvite()
      // Safe to be specific: the caller necessarily holds their own live code,
      // so there is nothing left for them to probe.
      if (invite.creatorId === userId) throw badRequest('That is your own invite code')

      // One-active-share-per-user spans two columns, so no unique index can
      // express it (see sharing.ts) and the check has to be a read. But a read
      // over rows that do not exist proves nothing under READ COMMITTED, which
      // is what Prisma opens an interactive transaction with: two concurrent
      // redemptions naming the same person would both see no conflict and both
      // insert, leaving a user in two shares and `activeShare()` returning an
      // arbitrary one of them.
      //
      // So the lock is what enforces the invariant, not the read. One lock per
      // user id rather than one keyed on the pair — A+B and A+C are different
      // pairs and would not exclude each other, which is the subtle way to get
      // this wrong. Ascending order, so there is no cycle for a deadlock.
      const [lo, hi] = [invite.creatorId, userId].sort((a, b) => a - b)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NS}, ${lo})`
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NS}, ${hi})`

      if (await tx.share.findFirst({ where: activeShareWhere([userId, invite.creatorId]) })) {
        // Thrown before the invite is consumed on purpose: a sender whose
        // recipient turns out to be sharing already should not have to go and
        // generate a fresh code.
        throw alreadyShared()
      }

      // Single-use, as an atomic conditional delete rather than a
      // read-then-write — the same shape as consuming a refresh token, for the
      // same reason: the same code submitted twice at the same instant loses
      // the race here instead of producing two shares.
      const { count } = await tx.invite.deleteMany({ where: { id: invite.id } })
      if (count === 0) throw invalidInvite()

      // The sender's budgets stay canonical, matching the old behaviour of
      // defaulting to whoever initiated. Either member can change it after.
      return tx.share.create({
        data: { initiatorId: invite.creatorId, partnerId: userId, budgetOwnerUserId: invite.creatorId },
        include: { initiator: { select: memberSelect }, partner: { select: memberSelect } },
      })
    })

    res.status(201).json(serializeShare(share, userId, share))
  } catch (err) {
    next(err)
  }
})

// PATCH /api/shares/:id  { budgetOwnerUserId }
//
// Either member may change whose budgets are canonical — the initiator/
// partner asymmetry lives only in the default at creation, not here.
sharesRouter.patch('/:id', async (req, res, next) => {
  try {
    const userId = authedUserId(req)
    const id = parseIdParam(req.params.id)
    const budgetOwnerUserId = requiredInt(req.body, 'budgetOwnerUserId')

    const share = await prisma.share.findFirst({
      where: { id, revokedAt: null, OR: [{ initiatorId: userId }, { partnerId: userId }] },
    })
    if (!share) throw new HttpError(404, `No active share with id ${id}`)
    if (budgetOwnerUserId !== share.initiatorId && budgetOwnerUserId !== share.partnerId) {
      throw badRequest('budgetOwnerUserId must be one of the two members of this share')
    }

    const updated = await prisma.share.update({
      where: { id },
      data: { budgetOwnerUserId },
      include: { initiator: { select: memberSelect }, partner: { select: memberSelect } },
    })
    res.json(serializeShare(updated, userId, updated))
  } catch (err) {
    next(err)
  }
})

// DELETE /api/shares/:id
//
// Either member may end it. Soft-revoked, not deleted — same pattern as
// RefreshToken — and non-destructive on both sides: nothing was migrated
// when the share was created, so nothing needs to be undone here either.
sharesRouter.delete('/:id', async (req, res, next) => {
  try {
    const userId = authedUserId(req)
    const { count } = await prisma.share.updateMany({
      where: {
        id: parseIdParam(req.params.id),
        revokedAt: null,
        OR: [{ initiatorId: userId }, { partnerId: userId }],
      },
      data: { revokedAt: new Date() },
    })
    if (count === 0) throw new HttpError(404, `No active share with id ${req.params.id}`)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
