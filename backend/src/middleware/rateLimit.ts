import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../http.ts'
import { authedUserId } from './auth.ts'

type Window = { count: number; resetAt: number }

const bump = (w: Window | undefined, now: number, windowMs: number): Window =>
  !w || w.resetAt <= now
    ? { count: 1, resetAt: now + windowMs }
    : { count: w.count + 1, resetAt: w.resetAt }

/** A fixed-window attempt counter. This is the app's first and only rate
 *  limiter, and it exists for one route: redeeming a household invite code.
 *  An 8-digit code is 10^8 possibilities, which makes that the single place in
 *  this API where an unmetered caller can brute-force their way into real
 *  data — so treat this as a security control, not a courtesy. The arithmetic
 *  is in docs/sharing.md.
 *
 *  Held in memory, because docker-compose.yml runs exactly one backend
 *  container and there is no second process for a shared store to coordinate
 *  with. **Running more than one replica silently multiplies every cap by the
 *  replica count**, and the global cap below stops being the control it is
 *  relied on to be. Moving this to Postgres is the fix if that day comes.
 *
 *  Counts every attempt rather than only the failures: a route then only has
 *  to mount it, and nothing has to report an outcome back afterwards.
 *  Legitimate use is a handful of attempts per person ever, so the distinction
 *  buys nothing.
 *
 *  `perUser` stops fat fingers and one stolen session. `global` is the part
 *  doing the real work — an attacker holding fifty Google accounts defeats any
 *  per-user cap by using all fifty. Its cost is worth naming: one attacker can
 *  exhaust the global budget and lock everybody out of accepting an invite
 *  until the window rolls. "Nobody can join for an hour" is a much better
 *  failure than "a stranger joined your household". */
export function rateLimit({
  perUser,
  global: globalCap,
  windowMs,
}: {
  perUser: number
  global: number
  windowMs: number
}) {
  const users = new Map<number, Window>()
  let all: Window = { count: 0, resetAt: 0 }

  return function limit(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now()
    // Mounted after requireAuth — authedUserId throws a loud 500 if it is not.
    const userId = authedUserId(req)

    // Swept here rather than on an interval: an entry only goes stale because
    // nobody has called in a while, and nothing reads it in the meantime. The
    // key is an authenticated user id rather than an IP, so the map is bounded
    // by the number of real users either way; this is belt-and-braces.
    if (users.size > 1000) {
      for (const [key, w] of users) if (w.resetAt <= now) users.delete(key)
    }

    const user = bump(users.get(userId), now, windowMs)
    users.set(userId, user)
    all = bump(all, now, windowMs)

    if (user.count > perUser || all.count > globalCap) {
      const resetAt = Math.max(user.resetAt, all.resetAt)
      res.set('Retry-After', String(Math.ceil((resetAt - now) / 1000)))
      next(new HttpError(429, 'Too many attempts. Try again later.'))
      return
    }
    next()
  }
}
