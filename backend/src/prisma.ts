import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.ts'
import { env } from './env.ts'

// Prisma 7 talks to Postgres through a driver adapter rather than a bundled
// query engine, so the pg adapter is wired up explicitly here.
const adapter = new PrismaPg({ connectionString: env.databaseUrl })

export const prisma = new PrismaClient({ adapter })
