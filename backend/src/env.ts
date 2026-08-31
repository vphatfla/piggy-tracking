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

export const env = {
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 3000),
  // Comma-separated list of origins allowed to call this API from a browser.
  // The frontend runs natively on :5173, outside Docker, so it needs CORS.
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
}
