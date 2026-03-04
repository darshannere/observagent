import fastifyStatic from '@fastify/static'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Legacy vanilla JS files — kept as fallback, served at /legacy
const legacyHtml = readFileSync(join(__dirname, '../public/index.html'), 'utf8')
const legacyHistoryHtml = readFileSync(join(__dirname, '../public/history.html'), 'utf8')

export async function dashboardRoutes(fastify, options) {
  // Legacy routes — vanilla JS dashboard accessible at /legacy
  fastify.get('/legacy', (request, reply) => {
    reply.type('text/html').send(legacyHtml)
  })
  fastify.get('/legacy/history', (request, reply) => {
    reply.type('text/html').send(legacyHistoryHtml)
  })

  // Serve React SPA build from public/dist/
  // wildcard: false — we handle routing ourselves via setNotFoundHandler
  await fastify.register(fastifyStatic, {
    root: join(__dirname, '../public/dist'),
    wildcard: false,
  })

  // SPA fallback — serve index.html for all non-API, non-SSE routes
  // React Router handles /live, /history, etc. client-side
  fastify.setNotFoundHandler((request, reply) => {
    const url = request.url
    // Do not intercept API routes or SSE — let them 404 properly
    if (
      url.startsWith('/api') ||
      url === '/events' ||
      url.startsWith('/ingest') ||
      url.startsWith('/legacy')
    ) {
      reply.code(404).send({ error: 'Not found' })
      return
    }
    // Serve React SPA for all other routes (/, /live, /history, etc.)
    reply.sendFile('index.html', join(__dirname, '../public/dist'))
  })
}
