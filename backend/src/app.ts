import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { env } from './env.ts'
import { notesRouter } from './routes/notes.ts'

export function createApp() {
  const app = express()

  app.use(cors({ origin: env.corsOrigins }))
  app.use(express.json())

  // Liveness probe — intentionally does not touch the database.
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() })
  })

  app.use('/api/notes', notesRouter)

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
