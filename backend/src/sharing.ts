import { prisma } from './prisma.ts'

/** "Any of these users is in a share." Written as the predicate rather than as
 *  a query so the same clause runs against the plain client and inside a
 *  transaction without threading a client type through. Covered by
 *  `@@unique([userLoId, userHiId])` for the first half and
 *  `@@index([userHiId])` for the second.
 *
 *  Both columns have to be checked because the pair is stored normalized —
 *  neither column means anything on its own, so "is this user sharing" is
 *  always a two-column question.
 *
 *  Read-only, and **not** how the one-share-per-user rule is enforced. A read
 *  over rows that do not exist yet locks nothing, so two concurrent
 *  redemptions would both pass it. Enforcement lives on `User.activeShareId`,
 *  which `POST /api/shares` claims with a conditional UPDATE against rows that
 *  always exist. This predicate answers "are they sharing right now", and
 *  decides which error a caller gets. */
export const activeShareWhere = (userIds: number[]) => ({
  OR: userIds.flatMap((id) => [{ userLoId: id }, { userHiId: id }]),
})

/** The caller's share, or null. A row's mere existence means the share is
 *  live: the pending state lives in `Invite`, and ending a share deletes the
 *  row rather than flagging it. See schema.prisma. */
async function activeShare(userId: number) {
  return prisma.share.findFirst({
    where: { OR: [{ userLoId: userId }, { userHiId: userId }] },
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
  return [share.userLoId, share.userHiId]
}

/** Which users' Category/Budget rows a caller may *read*, and which one of them
 *  is the write target. Unshared: just themself. Shared: the budget owner, or
 *  both members when the share has `showBothBudgets` on. `ownerId` is always
 *  `effectiveBudgetOwnerId` and is the only id a write may use; `userIds` only
 *  widens reads and the "may a transaction be filed here" check. */
export async function budgetScope(userId: number): Promise<{ ownerId: number; userIds: number[] }> {
  const share = await activeShare(userId)
  if (!share) return { ownerId: userId, userIds: [userId] }
  const ownerId = share.budgetOwnerUserId
  return { ownerId, userIds: share.showBothBudgets ? [share.userLoId, share.userHiId] : [ownerId] }
}

/** Whose Category/Budget rows are canonical for this caller. Unshared, that
 *  is themself; under an active share, whichever member `budgetOwnerUserId`
 *  names — "there should only be one budget type" from a share, not two
 *  independent sets that happen to be visible to both people. */
export async function effectiveBudgetOwnerId(userId: number): Promise<number> {
  const share = await activeShare(userId)
  return share ? share.budgetOwnerUserId : userId
}
