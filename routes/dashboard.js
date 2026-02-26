import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Read once at startup — zero runtime overhead per request
const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');

export async function dashboardRoutes(fastify, options) {
  fastify.get('/', (request, reply) => {
    reply.type('text/html').send(html);
  });
}
