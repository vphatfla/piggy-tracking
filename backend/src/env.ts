import { config } from 'dotenv'

// Config lives in the repo-root .env so docker-compose and host-run commands
// share one source of truth. Inside the container the vars are already set by
// compose and dotenv leaves them alone.
config({ path: ['.env', '../.env'], quiet: true })

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`)
  }
  return value
}

// The placeholder shipped in .env.example. Treated as "not configured" rather
// than as a value, so a half-finished setup fails with a useful message.
const PLACEHOLDER_CLIENT_ID = 'your-client-id.apps.googleusercontent.com'

/** A wrong GOOGLE_CLIENT_ID is otherwise invisible until someone tries to sign
 *  in, where it surfaces as the same opaque 401 a genuinely bad token gives —
 *  which sends you debugging the token instead of the config. Checking the
 *  shape at boot puts the real reason in `docker compose logs backend`. */
function googleClientId(): string {
  const value = required('GOOGLE_CLIENT_ID')
  const setup =
    'Create a Web application client at https://console.cloud.google.com/apis/credentials ' +
    'and set the same value in .env (GOOGLE_CLIENT_ID) and frontend/.env.local ' +
    '(VITE_GOOGLE_CLIENT_ID).'
  if (value === PLACEHOLDER_CLIENT_ID) {
    throw new Error(`GOOGLE_CLIENT_ID is still the .env.example placeholder. ${setup}`)
  }
  if (!value.endsWith('.apps.googleusercontent.com')) {
    throw new Error(
      `GOOGLE_CLIENT_ID does not look like a Google OAuth client ID (got "${value}"; ` +
        `expected something ending in ".apps.googleusercontent.com"). ${setup}`,
    )
  }
  return value
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 3000),
  // Comma-separated list of origins allowed to call this API from a browser.
  // The frontend runs natively on :5173, outside Docker, so it needs CORS.
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // --- auth ---
  // The `aud` claim every Google ID token must carry to be accepted.
  googleClientId: googleClientId(),
  // Two independent secrets: leaking the access-token secret must not also let
  // an attacker mint refresh tokens, which are far longer-lived.
  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY ?? '15m',
  refreshTokenExpiryDays: positiveInt('REFRESH_TOKEN_EXPIRY_DAYS', 30),
}
