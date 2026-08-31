import { createApp } from './app.ts'
import { env } from './env.ts'
import { prisma } from './prisma.ts'

const app = createApp()

const server = app.listen(env.port, () => {
  console.log(`[backend] listening on http://localhost:${env.port}`)
})

// Close the HTTP server and the Postgres pool so `docker compose down` and
// Ctrl-C in dev both shut down cleanly instead of being killed after a timeout.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[backend] ${signal} received, shutting down`)
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0))
    })
  })
}
