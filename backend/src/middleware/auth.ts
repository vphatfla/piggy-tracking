import type { NextFunction, Request, Response } from 'express'
import { verifyAccessToken } from '../auth/tokens.ts'
import { HttpError } from '../http.ts'

/** Requires `Authorization: Bearer <access token>` and attaches the verified
 *  `{ userId }` to the request. Every 401 carries the same message so a caller
 *  cannot tell a malformed token from an expired one. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.get('authorization')
  if (!header?.toLowerCase().startsWith('bearer ')) {
    next(new HttpError(401, 'Missing or malformed Authorization header'))
    return
  }

  try {
    req.auth = { userId: verifyAccessToken(header.slice(7).trim()).userId }
    next()
  } catch {
    next(new HttpError(401, 'Invalid or expired access token'))
  }
}

/** Reads the identity `requireAuth` attached. Throwing rather than returning
 *  undefined means a route accidentally mounted without the middleware fails
 *  loudly instead of silently serving unscoped data. */
export function authedUserId(req: Request): number {
  if (!req.auth) throw new HttpError(500, 'Route is missing the requireAuth middleware')
  return req.auth.userId
}
