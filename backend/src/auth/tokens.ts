import { createHash, randomBytes } from 'node:crypto'
import type { CookieOptions, Request, Response } from 'express'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { env } from '../env.ts'
import { HttpError } from '../http.ts'
import { prisma } from '../prisma.ts'

const REFRESH_COOKIE = 'refreshToken'
// Scoped to the auth routes: the browser then never attaches the refresh token
// to ordinary /api/receipts or /api/transactions calls, so it is exposed on far
// fewer requests. Set and clear must use the same path or the clear is a no-op.
const REFRESH_COOKIE_PATH = '/api/auth'

const DAY_MS = 24 * 60 * 60 * 1000

// --- access tokens ---------------------------------------------------------

/** JWTs are signed, not encrypted — anyone holding one can read the payload.
 *  Keep it to the user id; never put email, tokens, or anything else in here. */
export type AccessTokenPayload = { userId: number }

export function signAccessToken(userId: number): string {
  return jwt.sign({ userId } satisfies AccessTokenPayload, env.jwtAccessSecret, {
    // @types/jsonwebtoken types this as a `ms` template literal rather than a
    // plain string, so a value read from the environment needs the assertion.
    expiresIn: env.accessTokenExpiry as SignOptions['expiresIn'],
  })
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.jwtAccessSecret)
  if (typeof decoded === 'string' || typeof decoded.userId !== 'number') {
    throw new HttpError(401, 'Access token payload is malformed')
  }
  return { userId: decoded.userId }
}

// --- refresh tokens --------------------------------------------------------

/** Only ever applied to the raw token on its way *into* the database. */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** The refresh token is a JWT whose only payload is a 256-bit random id.
 *  The signature lets us reject forged or expired cookies before touching the
 *  database; the random id is what makes the stored hash unguessable. */
function mintRefreshToken(): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + env.refreshTokenExpiryDays * DAY_MS)
  const token = jwt.sign({ jti: randomBytes(32).toString('base64url') }, env.jwtRefreshSecret, {
    expiresIn: env.refreshTokenExpiryDays * 24 * 60 * 60,
  })
  return { token, expiresAt }
}

function refreshCookieOptions(expiresAt?: Date): CookieOptions {
  return {
    httpOnly: true, // unreadable from document.cookie, so XSS cannot exfiltrate it
    secure: true, // browsers still accept this over http://localhost
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    ...(expiresAt ? { expires: expiresAt } : {}),
  }
}

/** Issues a fresh refresh token: stores its hash and writes the cookie. This is
 *  the only place a raw refresh token leaves the process, and it leaves solely
 *  in a Set-Cookie header — never in a response body or a log line. */
export async function issueRefreshToken(res: Response, userId: number): Promise<void> {
  const { token, expiresAt } = mintRefreshToken()
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  })
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(expiresAt))
}

export const readRefreshCookie = (req: Request): string | undefined =>
  req.cookies?.[REFRESH_COOKIE]

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions())
}

/** Validates a raw refresh token and revokes it in the same step, returning the
 *  user it belonged to. Callers must immediately issue a replacement.
 *
 *  The revoke is an atomic conditional update rather than a read-then-write, so
 *  a replayed cookie — or two tabs refreshing at the same instant — loses the
 *  race and gets a 401 instead of both being handed a live session. */
export async function consumeRefreshToken(rawToken: string): Promise<number> {
  const tokenHash = hashRefreshTokenOrReject(rawToken)
  const now = new Date()

  const claimed = await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
    data: { revokedAt: now },
  })
  if (claimed.count === 0) throw invalidRefreshToken()

  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: { userId: true },
  })
  if (!row) throw invalidRefreshToken()
  return row.userId
}

/** Logout: revoke without issuing a replacement. Silent when the token is
 *  unknown or already revoked — logging out twice is not an error. */
export async function revokeRefreshToken(rawToken: string): Promise<void> {
  let tokenHash: string
  try {
    tokenHash = hashRefreshTokenOrReject(rawToken)
  } catch {
    return
  }
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/** Logout everywhere: kills every live session for the user. */
export async function revokeAllRefreshTokens(userId: number): Promise<number> {
  const { count } = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return count
}

function hashRefreshTokenOrReject(rawToken: string): string {
  try {
    jwt.verify(rawToken, env.jwtRefreshSecret)
  } catch {
    throw invalidRefreshToken()
  }
  return hashToken(rawToken)
}

// One message for every rejection reason — missing, forged, expired, revoked,
// already rotated — so the response cannot be used to probe token state.
const invalidRefreshToken = () => new HttpError(401, 'Invalid or expired refresh token')
