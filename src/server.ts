import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { ENV } from './util';
import { migrar } from './db';
import { api } from './api';
import { sitio, noEncontrado } from './pages';

if (!ENV.DATABASE_URL || !ENV.JWT_SECRET || !ENV.ADMIN_PASSWORD) {
  console.error('Faltan variables de entorno: DATABASE_URL, JWT_SECRET y/o ADMIN_PASSWORD');
  process.exit(1);
}

const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "script-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const app = new Hono();

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'SAMEORIGIN');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if ((c.res.headers.get('Content-Type') ?? '').includes('text/html')) c.header('Content-Security-Policy', CSP);
  if (c.req.path.startsWith('/api/') && !c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
});

app.use('/static/*', async (c, next) => {
  await next();
  if (c.res.ok) c.header('Cache-Control', 'public, max-age=604800');
});
app.use('/static/*', serveStatic({ root: './public' }));

app.get('/api/salud', (c) => c.json({ ok: true, version: ENV.VERSION }));
app.route('/', api);
app.route('/', sitio);

app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'No encontrado' }, 404) : noEncontrado(c)));
app.onError((err, c) => {
  console.error(err);
  return c.req.path.startsWith('/api/') ? c.json({ error: 'Error interno del servidor.' }, 500) : c.text('Error interno del servidor.', 500);
});

await migrar();
Bun.serve({ port: ENV.PORT, fetch: app.fetch, maxRequestBodySize: 10 * 1024 * 1024 });
console.log(`Sitio iniciado en el puerto ${ENV.PORT} (versión ${ENV.VERSION})`);
