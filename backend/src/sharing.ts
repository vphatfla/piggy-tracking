import { prisma } from './prisma.ts'

/** "Any of these users is in an active share." Written as the predicate rather
 *  than as a query so the same clause runs against the plain client and inside
 *  a transaction without threading a client type through. Covered by
 *  `@@index([initiatorId])` and `@@index([partnerId])`.
 *
 *  This is the one-active-share-per-user rule, and it spans two columns, so no
 *  unique index can express it — which is why it is a read, and why the redeem
 *  path has to take a lock around it rather than trusting the read alone. See
 *  `POST /api/shares`. */
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
