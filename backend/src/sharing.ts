import { prisma } from './prisma.ts'

/** "Any of these users is in an active share." Written as the predicate rather
 *  than as a query so the same clause runs against the plain client and inside
 *  a transaction without threading a client type through. Covered by
 *  `@@index([initiatorId])` and `@@index([partnerId])`.
 *
 *  Read-only, and **not** how the one-active-share-per-user rule is enforced.
 *  A user may sit in either column, so no unique index over `Share` expresses
 *  the rule, and a read like this one over rows that do not exist yet locks
 *  nothing — two concurrent redemptions would both pass it. Enforcement lives
 *  on `User.activeShareId`, which `POST /api/shares` claims with a conditional
 *  UPDATE against rows that always exist. This predicate is for answering
 *  "are they sharing right now", and for deciding which error a caller gets. */
export const activeShareWhere = (userIds: number[]) => ({
  revokedAt: null,
  OR: userIds.flatMap((id) => [{ initiatorId: id }, { partnerId: id }]),
})

/** The caller's active share, or null. A row's mere existence means
 *  "active" — the pending state lives in `Invite`, see schema.prisma. */
async function activeShare(userId: number) {
  return prisma.share.findFirst({
    where: { revokedAt: null, OR: [{ initiatorId: userId }, { partnerId: userId }] },
  })
}

/** Which user ids a caller's transaction queries should include. Unshared,
 *  that is just themself; under an active share, both members — this is
 *  the one change that makes two people see and edit the same transactions.
 *  Deliberately returns ids for an `IN` filter rather than resolving rows
 *  itself, so every call site stays a single indexed query. */
export async function visibleUserIds(userId: number): Promise<number[]> {
  const share = await activeShare(userId)
  if (!share) return [userId]
  return [share.initiatorId, share.partnerId]
}

/** Whose Category/Budget rows are canonical for this caller. Unshared, that
 *  is themself; under an active share, whichever member `budgetOwnerUserId`
 *  names — "there should only be one budget type" from a share, not two
 *  independent sets that happen to be visible to both people. */
export async function effectiveBudgetOwnerId(userId: number): Promise<number> {
  const share = await activeShare(userId)
  return share ? share.budgetOwnerUserId : userId
}
