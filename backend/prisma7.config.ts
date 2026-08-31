import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'

// Same lookup as src/env.ts: prefer backend/.env, fall back to the repo-root
// .env that docker-compose also reads.
config({ path: ['.env', '../.env'], quiet: true })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // `prisma db seed` / `prisma migrate reset` run this command.
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
})
