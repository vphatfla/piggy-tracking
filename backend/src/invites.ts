import { randomInt } from 'node:crypto'
import { env } from './env.ts'
import { Prisma } from './generated/prisma/client.ts'
import { HttpError } from './http.ts'
import { prisma } from './prisma.ts'

const MINUTE_MS = 60 * 1000
const CODE_MAX = 100_000_000 // 8 digits

/** Eight random digits, zero-padded. `randomInt` is crypto-grade and already
 *  uniform over the range, so there is no modulo bias to correct for. The
 *  result is a string, not a number, because "01234567" is a perfectly good
 *  code and an integer would drop the leading zero. */
const mintCode = () => randomInt(CODE_MAX).toString().padStart(8, '0')

/** The caller's live code, or null — the same sentinel `GET /api/shares/me`
 *  uses for "not sharing", so there is no separate loading state to reconcile.
 *  Returns the code itself rather than just its expiry: it is stored in
 *  plaintext precisely so the sender can reread it. */
export const liveInvite = (creatorId: number) =>
  prisma.invite.findFirst({
    where: { creatorId, expiresAt: { gt: new Date() } },
    select: { code: true, expiresAt: true },
  })

/** Mints the caller's invite. Returns the live one unchanged if they already
 *  have one — asking twice is not a request for a new code, and a code already
 *  sent to somebody must not stop working because its sender reopened the
 *  screen. Cancelling is the way to get rid of one.
 *
 *  Every call first deletes expired rows globally. That is the entire garbage
 *  collector: it runs on this rare path instead of on a timer, and it is what
 *  stops a 10^8-wide code space filling with codes nobody can use. Hard
 *  delete, not a soft revoke — see the Invite model's comment.
 *
 *  The retry wraps the *whole* transaction rather than sitting inside it,
 *  because a unique violation aborts the enclosing Postgres transaction and
 *  the insert cannot be retried in place. With a handful of live codes in 10^8
 *  the loop effectively never runs twice; it exists so a collision becomes a
 *  retry instead of a 409 reading "a record with that code already exists",
 *  which is both nonsense here and leaks the column name (see
 *  conflictingField in app.ts). */
export async function createInvite(creatorId: number): Promise<{ code: string; expiresAt: Date }> {
  const existing = await liveInvite(creatorId)
  if (existing) return existing

  const now = new Date()
  const expiresAt = new Date(now.getTime() + env.inviteExpiryMinutes * MINUTE_MS)

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.invite.deleteMany({ where: { expiresAt: { lte: now } } })
        // The caller's own expired row may not have been caught above if it
        // expired mid-request; creatorId is unique, so it has to go either way.
        await tx.invite.deleteMany({ where: { creatorId } })
        return tx.invite.create({
          data: { code: mintCode(), creatorId, expiresAt },
          select: { code: true, expiresAt: true },
        })
      })
    } catch (err) {
      const collision = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
      if (!collision) throw err
    }
  }
  throw new HttpError(503, 'Could not allocate an invite code. Please try again.')
}

/** "I sent it to the wrong person." Silent when there is nothing to cancel —
 *  the same reasoning as revoking a refresh token: doing it twice is not an
 *  error, and a `/me` singleton that is already gone is a success. */
export async function cancelInvite(creatorId: number): Promise<void> {
  await prisma.invite.deleteMany({ where: { creatorId } })
}

/** One message for unknown, expired and already-redeemed alike, so a response
 *  cannot be used to probe which codes exist — the same reasoning as
 *  `invalidRefreshToken` in auth/tokens.ts, and it matters more here, where the
 *  space is only 10^8 wide. */
export const invalidInvite = () => new HttpError(404, 'That code is not valid')
