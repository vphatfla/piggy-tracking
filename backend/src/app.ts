import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { env } from './env.ts'
import { Prisma } from './generated/prisma/client.ts'
import { HttpError } from './http.ts'
import { authRouter } from './routes/auth.ts'
import { receiptsRouter } from './routes/receipts.ts'
import { transactionsRouter } from './routes/transactions.ts'
import { usersRouter } from './routes/users.ts'

export function createApp() {
  const app = express()

  // `credentials: true` is what lets the browser send the httpOnly refresh
  // cookie to this different origin. It is only honoured alongside an explicit
  // origin allowlist — the spec forbids pairing credentials with `*`, so
  // CORS_ORIGIN must name the frontend exactly.
  app.use(cors({ origin: env.corsOrigins, credentials: true }))
  app.use(express.json())
  app.use(cookieParser())

  // Liveness probe — intentionally does not touch the database.
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() })
  })

  app.use('/api/auth', authRouter)
  app.use('/api/users', usersRouter)
  app.use('/api/receipts', receiptsRouter)
  app.use('/api/transactions', transactionsRouter)

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message })
      return
    }

    // Turn the database's own integrity checks into meaningful HTTP statuses
    // instead of a blanket 500 — e.g. a duplicate email or a userId that does
    // not exist is the caller's mistake, not a server fault.
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        res.status(409).json({ error: `A record with that ${conflictingField(err)} already exists` })
        return
      }
      if (err.code === 'P2003') {
        res.status(400).json({ error: 'Referenced record does not exist (foreign key constraint)' })
        return
      }
      if (err.code === 'P2025') {
        res.status(404).json({ error: 'Record not found' })
        return
      }
    }

    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}

/** Names the column behind a unique-constraint violation. The pg driver adapter
 *  reports the constraint index (e.g. "User_email_key") rather than Prisma's
 *  older `meta.target` array, so both shapes are handled. */
function conflictingField(err: Prisma.PrismaClientKnownRequestError): string {
  const target = err.meta?.target
  if (Array.isArray(target)) return target.join(', ')
  if (typeof target === 'string') return target

  const index = (
    err.meta as { driverAdapterError?: { cause?: { constraint?: { index?: string } } } } | undefined
  )?.driverAdapterError?.cause?.constraint?.index
  // "User_email_key" -> "email"
  const field = index?.replace(/^[A-Za-z]+_/, '').replace(/_key$/, '')
  return field || 'field'
}
