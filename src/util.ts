import { createHmac, timingSafeEqual } from 'node:crypto';

export const ENV = {
  DATABASE_URL: Bun.env.DATABASE_URL ?? '',
  JWT_SECRET: Bun.env.JWT_SECRET ?? '',
  ADMIN_PASSWORD: Bun.env.ADMIN_PASSWORD ?? '',
  MP_ACCESS_TOKEN: Bun.env.MP_ACCESS_TOKEN ?? '', // opcional: Mercado Pago
  PUBLIC_URL: (Bun.env.PUBLIC_URL ?? '').replace(/\/$/, ''),
  VERSION: (Bun.env.RAILWAY_GIT_COMMIT_SHA ?? Date.now().toString(36)).slice(0, 8),
  PORT: Number(Bun.env.PORT ?? 3000),
};

export const NOMBRE = 'Colegio de Martilleros y Corredores Públicos de Tierra del Fuego, Antártida e Islas del Atlántico Sur';
export const DEPARTAMENTAL = 'Departamental Río Grande';
export const SITIO_PROVINCIAL = 'https://colegiodemartillerosycorredores.ar/';
export const DENUNCIAS_OFICIAL = 'https://colegiodemartillerosycorredores.ar/denuncias/';
export const COFECI_URL = 'https://cofeci.com.ar/';
export const LEY_762_URL = 'http://www.legistdf.gob.ar/lp/leyes/Provinciales/LEYP762.pdf';
export const LEY_20266_URL = 'https://www.argentina.gob.ar/normativa/nacional/ley-20266-56724/actualizacion';
export const CCYCN_URL = 'https://www.argentina.gob.ar/normativa/nacional/ley-26994-235975/texto';

/* ------------------------------ Texto y HTML ------------------------------ */

const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ENT[c]);
export const txt = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function urlValida(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
export function dominio(v: string) {
  try { return new URL(v).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export const slug = (s: string) => normalizar(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
export const urlNovedad = (n: { id: number; titulo: string }) => `/novedades/${n.id}-${slug(n.titulo)}`;

// Texto cargado desde la administración: párrafos separados por línea en blanco,
// listas con "- " al comienzo de cada línea y enlaces http(s) automáticos.
export function formatear(texto: string) {
  const enlazar = (s: string) => s.replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
  return texto.replace(/\r/g, '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean).map((b) => {
    const lineas = b.split('\n');
    if (lineas.every((l) => /^\s*[-•]\s+/.test(l)))
      return `<ul>${lineas.map((l) => `<li>${enlazar(esc(l.replace(/^\s*[-•]\s+/, '')))}</li>`).join('')}</ul>`;
    return `<p>${lineas.map((l) => enlazar(esc(l))).join('<br>')}</p>`;
  }).join('');
}

/* --------------------------------- Fechas --------------------------------- */

const TZ = 'America/Argentina/Ushuaia';
const LARGA: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
// Para columnas TIMESTAMPTZ (hora local de Tierra del Fuego)
export const fecha = (d: unknown, opts: Intl.DateTimeFormatOptions = LARGA) =>
  d ? new Date(d as string).toLocaleDateString('es-AR', { timeZone: TZ, ...opts }) : '';
export const fechaHora = (d: unknown) =>
  d ? `${fecha(d)}, ${new Date(d as string).toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} h` : '';
// Para columnas DATE (sin zona horaria)
export const fechaDia = (d: unknown) => (d ? new Date(d as string).toLocaleDateString('es-AR', { timeZone: 'UTC', ...LARGA }) : '');
export const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : '');
// Valor de <input type="datetime-local"> interpretado en hora argentina (UTC-3, sin horario de verano)
export function fechaLocal(v: string) {
  if (!v) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? `${v}:00-03:00` : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* -------------------------------- Sesiones -------------------------------- */

export function firmar(payload: object, horas = 8) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + horas * 3600_000 })).toString('base64url');
  return `${body}.${createHmac('sha256', ENV.JWT_SECRET).update(body).digest('base64url')}`;
}
export function verificar(token = ''): any {
  try {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const esperado = createHmac('sha256', ENV.JWT_SECRET).update(body).digest('base64url');
    if (sig.length !== esperado.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return null;
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
export const cookieOpts = { httpOnly: true, sameSite: 'Lax' as const, secure: true, path: '/', maxAge: 8 * 3600 };

export function igualSeguro(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ---------------------------- Límite de intentos ---------------------------- */

const registros = new Map<string, number[]>();
export function excede(clave: string, max: number, ventanaMin = 15) {
  const ahora = Date.now();
  const r = (registros.get(clave) ?? []).filter((t) => ahora - t < ventanaMin * 60_000);
  r.push(ahora);
  registros.set(clave, r);
  return r.length > max;
}
export const ipDe = (c: any) => (c.req.header('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
export const baseUrl = (c: any) => ENV.PUBLIC_URL || `https://${c.req.header('host')}`;
