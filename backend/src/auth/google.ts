import { OAuth2Client } from 'google-auth-library'
import { env } from '../env.ts'
import { HttpError } from '../http.ts'

// The client is reused so google-auth-library can cache Google's signing
// certificates instead of refetching them on every sign-in.
const client = new OAuth2Client(env.googleClientId)

export type GoogleProfile = {
  /** The Google `sub` claim — stable per user, stored as User.googleId. */
  sub: string
  email: string
  givenName: string
  familyName: string
}

/** Verifies a Google ID token's signature, issuer, expiry, and — critically —
 *  that its `aud` is *our* client ID. Without the audience check a token minted
 *  for any other Google app would be accepted here. */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  let payload
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: env.googleClientId })
    payload = ticket.getPayload()
  } catch {
    // Deliberately opaque: the caller learns the token was rejected, not why.
    throw new HttpError(401, 'Google ID token is invalid or expired')
  }

  if (!payload?.sub) throw new HttpError(401, 'Google ID token has no subject claim')
  if (!payload.email) throw new HttpError(401, 'Google ID token has no email claim')
  // Google normally only issues verified emails, but an unverified one would
  // let someone claim an address they do not control.
  if (payload.email_verified === false) {
    throw new HttpError(401, 'Google account email is not verified')
  }

  return {
    sub: payload.sub,
    email: payload.email,
    // firstName/lastName are NOT NULL, and these claims are optional depending
    // on the account's profile scope, so fall back rather than fail the login.
    givenName: payload.given_name || payload.email.split('@')[0],
    familyName: payload.family_name || '',
  }
}
