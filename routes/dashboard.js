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

  // Serve React SPA static assets — wildcard: false so we control routing
  await fastify.register(fastifyStatic, {
    root: join(__dirname, '../public/dist'),
    wildcard: false,
  })

  // Explicit route for Vite-built static assets (JS, CSS, images)
  fastify.get('/assets/*', (request, reply) => {
    return reply.sendFile('assets/' + request.params['*'])
  })

  // SPA fallback — serve index.html for React Router routes
  fastify.setNotFoundHandler((request, reply) => {
    const url = request.url
    if (
      url.startsWith('/api') ||
      url === '/events' ||
      url.startsWith('/ingest') ||
      url.startsWith('/legacy')
    ) {
      reply.code(404).send({ error: 'Not found' })
      return
    }
    reply.sendFile('index.html')
  })
}
