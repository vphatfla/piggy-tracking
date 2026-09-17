import { Router } from 'express'
import { badRequest, HttpError, parseIdParam, requiredInt, requiredString } from '../http.ts'
import { authedUserId, requireAuth } from '../middleware/auth.ts'
import { prisma } from '../prisma.ts'

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

// POST /api/shares  { partnerEmail }
//
// Real and fully working — the invite *mechanism* (notifying, accepting) is
// not, so this creates an active share immediately. Whoever calls it becomes
// the initiator, and `budgetOwnerUserId` defaults to them.
sharesRouter.post('/', async (req, res, next) => {
  try {
    const userId = authedUserId(req)
    const partnerEmail = requiredString(req.body, 'partnerEmail')

    const partner = await prisma.user.findUnique({ where: { email: partnerEmail }, select: memberSelect })
    if (!partner) throw new HttpError(404, `No user with email ${partnerEmail}`)
    if (partner.id === userId) throw badRequest('You cannot share with yourself')

    // A user may have at most one active share — checked here rather than in
    // the schema, which cannot express it across these two columns.
    const existing = await prisma.share.findFirst({
      where: {
        revokedAt: null,
        OR: [{ initiatorId: userId }, { partnerId: userId }, { initiatorId: partner.id }, { partnerId: partner.id }],
      },
    })
    if (existing) throw new HttpError(409, 'One of these users is already in an active share')

    const share = await prisma.share.create({
      data: { initiatorId: userId, partnerId: partner.id, budgetOwnerUserId: userId },
      include: { initiator: { select: memberSelect }, partner: { select: memberSelect } },
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
