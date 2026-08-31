import { Router } from 'express'
import { verifyGoogleIdToken } from '../auth/google.ts'
import {
  clearRefreshCookie,
  consumeRefreshToken,
  issueRefreshToken,
  readRefreshCookie,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  signAccessToken,
} from '../auth/tokens.ts'
import { HttpError, requiredString, serializeUser } from '../http.ts'
import { authedUserId, requireAuth } from '../middleware/auth.ts'
import { prisma } from '../prisma.ts'

export const authRouter = Router()

// POST /api/auth/google  { idToken }
// Exchanges a Google ID token for a session: an access token in the body and a
// refresh token in an httpOnly cookie.
authRouter.post('/google', async (req, res, next) => {
  try {
    const profile = await verifyGoogleIdToken(requiredString(req.body, 'idToken'))

    // Find-or-create in one statement so two simultaneous first logins cannot
    // both pass a "does it exist?" check and race to insert.
    // `update: {}` keeps returning users' locally-edited profile fields intact.
    const user = await prisma.user.upsert({
      where: { googleId: profile.sub },
      update: {},
      create: {
        googleId: profile.sub,
        email: profile.email,
        firstName: profile.givenName,
        lastName: profile.familyName,
      },
    })

    await issueRefreshToken(res, user.id)
    res.json({ accessToken: signAccessToken(user.id), user: serializeUser(user) })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/refresh
// Rotation: the presented token is revoked and replaced on every call, so a
// stolen cookie is usable at most once before the real client's next refresh
// invalidates it. Also the silent-login path on page load.
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const raw = readRefreshCookie(req)
    if (!raw) throw new HttpError(401, 'Invalid or expired refresh token')

    const userId = await consumeRefreshToken(raw)
    await issueRefreshToken(res, userId)

    // The profile rides along so a page load restoring a session does not need
    // a second round-trip before it can render.
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new HttpError(401, 'Invalid or expired refresh token')

    res.json({ accessToken: signAccessToken(userId), user: serializeUser(user) })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/logout — ends this session. No access token required: a client
// whose access token already expired must still be able to log out.
authRouter.post('/logout', async (req, res, next) => {
  try {
    const raw = readRefreshCookie(req)
    if (raw) await revokeRefreshToken(raw)
    clearRefreshCookie(res)
    res.status(200).json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/logout-all — ends every session for the user, on every device.
// Needs a valid access token, since the identity cannot come from a cookie that
// may itself be the one that was stolen.
authRouter.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    const revoked = await revokeAllRefreshTokens(authedUserId(req))
    clearRefreshCookie(res)
    res.status(200).json({ ok: true, revoked })
  } catch (err) {
    next(err)
  }
})
