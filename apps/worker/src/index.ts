/**
 * SouqStudio Worker Process
 * Starts all BullMQ workers. Runs as a separate always-on Node.js process.
 * Never deploy this to Vercel.
 */
import { pdfWorker }    from './workers/pdf.worker'
import { aiWorker }     from './workers/ai.worker'
import { bgWorker }     from './workers/bg.worker'
import { emailWorker }  from './workers/email.worker'
import { enrichWorker } from './workers/enrich.worker'
import { env } from './lib/env'
import http from 'node:http'

console.log('[worker] Starting SouqStudio workers...')

// Minimal health check — Railway uses this to confirm process is alive
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ status: 'ok', workers: ['pdf', 'ai', 'bg', 'email', 'enrich'] }))
})
server.listen(env.PORT, () => console.log(`[worker] Health: http://localhost:${env.PORT}/health`))

// Graceful shutdown
async function shutdown() {
  console.log('[worker] Shutting down gracefully...')
  await Promise.all([
    pdfWorker.close(),
    aiWorker.close(),
    bgWorker.close(),
    emailWorker.close(),
    enrichWorker.close(),
  ])
  server.close()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

console.log('[worker] All workers running.')
