// Colegio de Martilleros y Corredores Públicos de Tierra del Fuego
// Railway Function (Bun): sitio institucional + padrón + portal de matriculados + administración.
// ARCHIVO GENERADO: editar function/server.ts y public/*, luego ejecutar build.ps1.
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { SQL } from 'bun';
import { createHmac, timingSafeEqual } from 'node:crypto';
import PDFDocument from 'pdfkit';

const DATABASE_URL = Bun.env.DATABASE_URL;
const JWT_SECRET = Bun.env.JWT_SECRET;
const ADMIN_PASSWORD = Bun.env.ADMIN_PASSWORD;
const MP_ACCESS_TOKEN = Bun.env.MP_ACCESS_TOKEN; // opcional: Mercado Pago
const PUBLIC_URL = (Bun.env.PUBLIC_URL || '').replace(/\/$/, '');
const COLEGIO = 'Colegio de Martilleros y Corredores Públicos de Tierra del Fuego';
const LOCALIDADES = ['Río Grande', 'Ushuaia', 'Tolhuin'];

if (!DATABASE_URL || !JWT_SECRET || !ADMIN_PASSWORD) {
  console.error('Faltan variables: DATABASE_URL, JWT_SECRET y/o ADMIN_PASSWORD');
  process.exit(1);
}

const sql = new SQL(DATABASE_URL);
const q = (text: string, params: unknown[] = []) => sql.unsafe(text, params as any[]) as Promise<any[] & { count: number }>;
const esUnico = (e: any) => e?.errno === '23505' || e?.code === '23505';

/* ----------------------------- Base de datos ----------------------------- */

async function initDB() {
  const ddl = [
    `CREATE TABLE IF NOT EXISTS personas (
      id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, apellido TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE, creado_en TIMESTAMPTZ NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS matriculados (
      id SERIAL PRIMARY KEY, matricula TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL, apellido TEXT NOT NULL,
      dni TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, telefono TEXT, domicilio_profesional TEXT,
      localidad TEXT NOT NULL DEFAULT 'Río Grande',
      estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','suspendido','baja')),
      fecha_alta DATE NOT NULL DEFAULT CURRENT_DATE, password_hash TEXT NOT NULL,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS cuotas (
      id SERIAL PRIMARY KEY, matriculado_id INTEGER NOT NULL REFERENCES matriculados(id) ON DELETE CASCADE,
      periodo TEXT NOT NULL, monto NUMERIC(12,2) NOT NULL, vencimiento DATE NOT NULL,
      pagada BOOLEAN NOT NULL DEFAULT false, fecha_pago TIMESTAMPTZ, medio_pago TEXT,
      UNIQUE (matriculado_id, periodo))`,
    `CREATE TABLE IF NOT EXISTS novedades (
      id SERIAL PRIMARY KEY, titulo TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'comunicado' CHECK (tipo IN ('comunicado','asamblea','legal','circular')),
      contenido TEXT NOT NULL, publicado_en TIMESTAMPTZ NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS normativas (
      id SERIAL PRIMARY KEY, categoria TEXT NOT NULL CHECK (categoria IN ('ley','decreto','etica','resolucion')),
      titulo TEXT NOT NULL, descripcion TEXT, url TEXT, orden INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS autoridades (
      id SERIAL PRIMARY KEY, cargo TEXT NOT NULL, nombre TEXT NOT NULL, orden INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS sedes (
      id SERIAL PRIMARY KEY, ciudad TEXT NOT NULL UNIQUE, direccion TEXT, horario TEXT,
      telefono TEXT, email TEXT, orden INTEGER NOT NULL DEFAULT 0)`,
  ];
  for (const s of ddl) await q(s);

  const vacia = async (t: string) => (await q(`SELECT count(*)::int AS n FROM ${t}`))[0].n === 0;
  if (await vacia('sedes')) {
    for (const [i, c] of LOCALIDADES.entries())
      await q('INSERT INTO sedes (ciudad, direccion, horario, telefono, email, orden) VALUES ($1,$2,$3,$4,$5,$6)',
        [c, 'Dirección a confirmar', c === 'Tolhuin' ? 'Atención con turno previo' : 'Lunes a viernes de 9 a 13 h', 'A confirmar', null, i + 1]);
  }
  if (await vacia('normativas')) {
    await q(`INSERT INTO normativas (categoria, titulo, descripcion, orden) VALUES
      ('ley', 'Ley Nacional 20.266 — Martilleros y Corredores', 'Régimen nacional de los martilleros y corredores (texto modificado por Ley 25.028).', 1),
      ('ley', 'Ley Nacional 25.028', 'Modificatoria de la Ley 20.266.', 2)`);
  }
  if (await vacia('novedades')) {
    await q(`INSERT INTO novedades (titulo, tipo, contenido) VALUES ('Nuevo sitio web institucional', 'comunicado',
      'Ya está disponible el nuevo sitio del Colegio con el padrón público de matriculados y el portal de autogestión para profesionales.')`);
  }
}

/* ------------------------------- Utilidades ------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const txt = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const b64 = (s: string) => Buffer.from(s).toString('base64url');

function firmar(payload: object, horas = 8) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + horas * 3600_000 }));
  return `${body}.${createHmac('sha256', JWT_SECRET!).update(body).digest('base64url')}`;
}
function verificar(token = ''): any {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const esperado = createHmac('sha256', JWT_SECRET!).update(body).digest('base64url');
  if (sig.length !== esperado.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return null;
  const data = JSON.parse(Buffer.from(body, 'base64url').toString());
  return data.exp > Date.now() ? data : null;
}

const cookieOpts = { httpOnly: true, sameSite: 'Lax' as const, secure: true, path: '/', maxAge: 8 * 3600 };

const intentos = new Map<string, number[]>();
function demasiadosIntentos(ip: string) {
  const now = Date.now();
  const r = (intentos.get(ip) || []).filter((t) => now - t < 15 * 60_000);
  r.push(now); intentos.set(ip, r);
  return r.length > 10;
}
const ipDe = (c: any) => (c.req.header('x-forwarded-for') || '').split(',')[0].trim() || 'local';
const baseUrl = (c: any) => PUBLIC_URL || `https://${c.req.header('host')}`;

function pdfResponse(doc: any, filename: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(new Response(Buffer.concat(chunks), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` },
    })));
    doc.on('error', reject);
    doc.end();
  });
}

/* ---------------------------------- App ---------------------------------- */

const app = new Hono();
app.onError((err, c) => { console.error(err); return c.json({ error: 'Error interno del servidor.' }, 500); });
const body = async (c: any) => { try { return await c.req.json(); } catch { return {}; } };

const auth = (role: 'admin' | 'matriculado') => async (c: any, next: any) => {
  const data = verificar(getCookie(c, role === 'admin' ? 'adm' : 'mat'));
  if (!data || data.role !== role) return c.json({ error: 'Sesión no válida. Ingresá nuevamente.' }, 401);
  c.set('user', data);
  await next();
};

/* ----- API pública ----- */

app.get('/api/salud', (c) => c.json({ ok: true }));

app.post('/api/personas', async (c) => {
  const b = await body(c);
  const nombre = txt(b.nombre, 80), apellido = txt(b.apellido, 80), email = txt(b.email, 120).toLowerCase();
  if (!nombre || !apellido) return c.json({ error: 'Nombre y apellido son obligatorios.' }, 400);
  if (!EMAIL_RE.test(email)) return c.json({ error: 'El email no es válido.' }, 400);
  try {
    const rows = await q('INSERT INTO personas (nombre, apellido, email) VALUES ($1,$2,$3) RETURNING id, nombre, apellido, email, creado_en', [nombre, apellido, email]);
    return c.json(rows[0], 201);
  } catch (e) {
    if (esUnico(e)) return c.json({ error: 'Ese email ya está registrado.' }, 409);
    throw e;
  }
});

app.get('/api/padron', async (c) => {
  const busq = txt(c.req.query('q'), 80), localidad = txt(c.req.query('localidad'), 40);
  const params: unknown[] = [];
  let where = "estado <> 'baja'";
  if (busq) {
    params.push(`%${busq}%`, busq);
    where += ` AND (nombre || ' ' || apellido ILIKE $1 OR apellido || ' ' || nombre ILIKE $1 OR matricula ILIKE $1 OR dni = $2)`;
  }
  if (localidad) { params.push(localidad); where += ` AND localidad = $${params.length}`; }
  const rows = await q(
    `SELECT matricula, nombre, apellido, localidad, estado, fecha_alta,
       (estado = 'activo' AND NOT EXISTS (SELECT 1 FROM cuotas cu WHERE cu.matriculado_id = m.id AND NOT cu.pagada AND cu.vencimiento < CURRENT_DATE - 90)) AS habilitado
     FROM matriculados m WHERE ${where} ORDER BY apellido, nombre LIMIT 100`, params);
  return c.json(rows);
});

app.get('/api/novedades', async (c) => c.json(await q('SELECT * FROM novedades ORDER BY publicado_en DESC LIMIT 50')));

app.get('/api/institucional', async (c) => {
  const [normativas, autoridades, sedes] = await Promise.all([
    q('SELECT * FROM normativas ORDER BY categoria, orden, id'),
    q('SELECT * FROM autoridades ORDER BY orden, id'),
    q('SELECT * FROM sedes ORDER BY orden, id'),
  ]);
  return c.json({ normativas, autoridades, sedes });
});

/* ----- Portal de matriculados ----- */

app.post('/api/portal/login', async (c) => {
  if (demasiadosIntentos(ipDe(c))) return c.json({ error: 'Demasiados intentos. Probá en 15 minutos.' }, 429);
  const b = await body(c);
  const usuario = txt(b.usuario, 120).toLowerCase();
  const [m] = await q('SELECT id, password_hash, estado FROM matriculados WHERE lower(matricula) = $1 OR lower(email) = $1 OR dni = $1', [usuario]);
  if (!m || !(await Bun.password.verify(String(b.password || ''), m.password_hash)))
    return c.json({ error: 'Usuario o contraseña incorrectos.' }, 401);
  if (m.estado === 'baja') return c.json({ error: 'La matrícula se encuentra dada de baja.' }, 403);
  setCookie(c, 'mat', firmar({ id: m.id, role: 'matriculado' }), cookieOpts);
  return c.json({ ok: true });
});
app.post('/api/portal/logout', (c) => { deleteCookie(c, 'mat', { path: '/' }); return c.json({ ok: true }); });

async function getMatriculado(id: number) {
  const [m] = await q(`SELECT id, matricula, nombre, apellido, dni, email, telefono, domicilio_profesional, localidad, estado, fecha_alta
    FROM matriculados WHERE id = $1`, [id]);
  return m;
}

app.get('/api/portal/yo', auth('matriculado'), async (c) => {
  const m = await getMatriculado(c.get('user').id);
  if (!m) return c.json({ error: 'No encontrado' }, 404);
  const cuotas = await q('SELECT id, periodo, monto, vencimiento, pagada, fecha_pago, medio_pago FROM cuotas WHERE matriculado_id = $1 ORDER BY vencimiento DESC', [m.id]);
  const deuda = cuotas.filter((x: any) => !x.pagada).reduce((a: number, x: any) => a + Number(x.monto), 0);
  return c.json({ matriculado: m, cuotas, deuda, pagoOnline: Boolean(MP_ACCESS_TOKEN) });
});

app.put('/api/portal/yo', auth('matriculado'), async (c) => {
  const b = await body(c);
  const email = txt(b.email, 120).toLowerCase();
  if (!EMAIL_RE.test(email)) return c.json({ error: 'El email no es válido.' }, 400);
  const localidad = LOCALIDADES.includes(b.localidad) ? b.localidad : null;
  try {
    await q('UPDATE matriculados SET email = $1, telefono = $2, domicilio_profesional = $3, localidad = COALESCE($4, localidad) WHERE id = $5',
      [email, txt(b.telefono, 40), txt(b.domicilio_profesional, 200), localidad, c.get('user').id]);
  } catch (e) {
    if (esUnico(e)) return c.json({ error: 'Ese email ya está en uso.' }, 409);
    throw e;
  }
  return c.json(await getMatriculado(c.get('user').id));
});

app.put('/api/portal/password', auth('matriculado'), async (c) => {
  const { actual, nueva } = await body(c);
  if (typeof nueva !== 'string' || nueva.length < 8) return c.json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' }, 400);
  const [r] = await q('SELECT password_hash FROM matriculados WHERE id = $1', [c.get('user').id]);
  if (!r || !(await Bun.password.verify(String(actual || ''), r.password_hash)))
    return c.json({ error: 'La contraseña actual es incorrecta.' }, 400);
  await q('UPDATE matriculados SET password_hash = $1 WHERE id = $2', [await Bun.password.hash(nueva), c.get('user').id]);
  return c.json({ ok: true });
});

app.post('/api/portal/cuotas/:id/pagar', auth('matriculado'), async (c) => {
  if (!MP_ACCESS_TOKEN) return c.json({ error: 'El pago online todavía no está habilitado. Consultá los datos para transferencia en la sede.' }, 501);
  const [cu] = await q('SELECT * FROM cuotas WHERE id = $1 AND matriculado_id = $2 AND NOT pagada', [Number(c.req.param('id')), c.get('user').id]);
  if (!cu) return c.json({ error: 'Cuota inexistente o ya pagada.' }, 404);
  const base = baseUrl(c);
  const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ title: `Cuota societaria ${cu.periodo}`, quantity: 1, unit_price: Number(cu.monto), currency_id: 'ARS' }],
      external_reference: String(cu.id),
      notification_url: `${base}/api/pagos/webhook`,
      back_urls: { success: `${base}/portal.html?pago=ok`, failure: `${base}/portal.html?pago=error`, pending: `${base}/portal.html?pago=pendiente` },
      auto_return: 'approved',
    }),
  });
  const data: any = await r.json();
  if (!r.ok) { console.error('Mercado Pago:', data); return c.json({ error: 'No se pudo iniciar el pago.' }, 502); }
  return c.json({ url: data.init_point });
});

app.post('/api/pagos/webhook', async (c) => {
  if (!MP_ACCESS_TOKEN) return c.body(null, 200);
  const b = await body(c);
  const id = b?.data?.id || c.req.query('data.id') || c.req.query('id');
  if (id && (!b.type || b.type === 'payment')) {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } });
    if (r.ok) {
      const p: any = await r.json();
      if (p.status === 'approved' && p.external_reference)
        await q("UPDATE cuotas SET pagada = true, fecha_pago = now(), medio_pago = 'Mercado Pago' WHERE id = $1 AND NOT pagada", [Number(p.external_reference)]);
    }
  }
  return c.body(null, 200);
});

/* ----- Certificados PDF ----- */

const fechaAR = (d: any) => new Date(d).toLocaleDateString('es-AR', { timeZone: 'UTC' });

app.get('/api/portal/certificado', auth('matriculado'), async (c) => {
  const m = await getMatriculado(c.get('user').id);
  if (!m || m.estado !== 'activo') return c.json({ error: 'Solo las matrículas activas pueden emitir el certificado de vigencia.' }, 403);
  const hoy = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Ushuaia' });
  const doc = new PDFDocument({ size: 'A4', margin: 60 });
  doc.rect(40, 40, 515, 762).lineWidth(2).stroke('#1f3a5f');
  doc.moveDown(2).fillColor('#1f3a5f').fontSize(16).font('Helvetica-Bold').text(COLEGIO.toUpperCase(), { align: 'center' });
  doc.moveDown(0.3).fontSize(10).font('Helvetica').fillColor('#555').text('Provincia de Tierra del Fuego, Antártida e Islas del Atlántico Sur', { align: 'center' });
  doc.moveDown(3).fontSize(20).font('Helvetica-Bold').fillColor('#000').text('CERTIFICADO DE VIGENCIA DE MATRÍCULA', { align: 'center' });
  doc.moveDown(2).fontSize(12).font('Helvetica').text(
    `Se certifica que ${m.nombre} ${m.apellido}, DNI ${m.dni}, se encuentra inscripto/a en este Colegio bajo la matrícula N.º ${m.matricula}, ` +
    `con fecha de alta ${fechaAR(m.fecha_alta)}, y que a la fecha su matrícula se encuentra ACTIVA, ` +
    `con domicilio profesional en ${m.domicilio_profesional || '—'}, ${m.localidad}.`, { align: 'justify', lineGap: 4 });
  doc.moveDown(1.5).text(`Se extiende el presente a pedido del/la interesado/a, el día ${hoy}.`, { align: 'justify' });
  doc.moveDown(4).fontSize(10).fillColor('#555').text(`Verificá la vigencia en: ${baseUrl(c)}/#padron  —  Matrícula ${m.matricula}`, { align: 'center' });
  doc.text('Documento emitido electrónicamente desde el Portal de Autogestión.', { align: 'center' });
  return pdfResponse(doc, `certificado-vigencia-${m.matricula}.pdf`);
});

app.get('/api/portal/credencial', auth('matriculado'), async (c) => {
  const m = await getMatriculado(c.get('user').id);
  if (!m || m.estado !== 'activo') return c.json({ error: 'Solo las matrículas activas pueden descargar la credencial.' }, 403);
  const doc = new PDFDocument({ size: [340, 215], margin: 0 });
  doc.rect(0, 0, 340, 215).fill('#1f3a5f');
  doc.rect(0, 150, 340, 65).fill('#c8a24a');
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9).text('COLEGIO DE MARTILLEROS Y CORREDORES', 20, 18);
  doc.font('Helvetica').fontSize(8).text('TIERRA DEL FUEGO', 20, 30);
  doc.font('Helvetica-Bold').fontSize(16).text(`${m.apellido.toUpperCase()}, ${m.nombre}`, 20, 62, { width: 300 });
  doc.font('Helvetica').fontSize(10).text(`DNI ${m.dni}`, 20, 90).text(`Sede: ${m.localidad}`, 20, 105);
  doc.fillColor('#1f3a5f').font('Helvetica-Bold').fontSize(12).text(`MATRÍCULA N.º ${m.matricula}`, 20, 162);
  doc.font('Helvetica').fontSize(8).text(`Emitida: ${new Date().toLocaleDateString('es-AR')} — Verificable en el padrón público`, 20, 182);
  return pdfResponse(doc, `credencial-${m.matricula}.pdf`);
});

/* ----- Administración (Comisión Directiva) ----- */

app.post('/api/admin/login', async (c) => {
  if (demasiadosIntentos(ipDe(c))) return c.json({ error: 'Demasiados intentos. Probá en 15 minutos.' }, 429);
  const { password } = await body(c);
  const ok = typeof password === 'string' && Buffer.byteLength(password) === Buffer.byteLength(ADMIN_PASSWORD!) &&
    timingSafeEqual(Buffer.from(password), Buffer.from(ADMIN_PASSWORD!));
  if (!ok) return c.json({ error: 'Contraseña incorrecta.' }, 401);
  setCookie(c, 'adm', firmar({ role: 'admin' }), cookieOpts);
  return c.json({ ok: true });
});
app.post('/api/admin/logout', (c) => { deleteCookie(c, 'adm', { path: '/' }); return c.json({ ok: true }); });

app.use('/api/admin/*', async (c, next) => {
  if (c.req.path === '/api/admin/login' || c.req.path === '/api/admin/logout') return next();
  return auth('admin')(c, next);
});

app.get('/api/admin/resumen', async (c) => {
  const [personas, matriculados, novedades, cuotas] = await Promise.all([
    q('SELECT * FROM personas ORDER BY creado_en DESC'),
    q(`SELECT id, matricula, nombre, apellido, dni, email, telefono, localidad, estado, fecha_alta,
        (SELECT COALESCE(sum(monto),0) FROM cuotas cu WHERE cu.matriculado_id = m.id AND NOT pagada) AS deuda
       FROM matriculados m ORDER BY apellido, nombre`),
    q('SELECT * FROM novedades ORDER BY publicado_en DESC'),
    q(`SELECT cu.*, m.matricula, m.apellido, m.nombre FROM cuotas cu JOIN matriculados m ON m.id = cu.matriculado_id
       ORDER BY cu.pagada, cu.vencimiento DESC LIMIT 300`),
  ]);
  return c.json({ personas, matriculados, novedades, cuotas });
});

app.post('/api/admin/matriculados', async (c) => {
  const b = await body(c);
  const f = {
    matricula: txt(b.matricula, 20), nombre: txt(b.nombre, 80), apellido: txt(b.apellido, 80), dni: txt(b.dni, 15).replace(/\D/g, ''),
    email: txt(b.email, 120).toLowerCase(), telefono: txt(b.telefono, 40), domicilio: txt(b.domicilio_profesional, 200),
    localidad: LOCALIDADES.includes(b.localidad) ? b.localidad : 'Río Grande',
  };
  if (!f.matricula || !f.nombre || !f.apellido || !f.dni) return c.json({ error: 'Matrícula, nombre, apellido y DNI son obligatorios.' }, 400);
  if (!EMAIL_RE.test(f.email)) return c.json({ error: 'El email no es válido.' }, 400);
  if (typeof b.password !== 'string' || b.password.length < 8) return c.json({ error: 'La contraseña inicial debe tener al menos 8 caracteres.' }, 400);
  try {
    const [r] = await q(`INSERT INTO matriculados (matricula, nombre, apellido, dni, email, telefono, domicilio_profesional, localidad, password_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [f.matricula, f.nombre, f.apellido, f.dni, f.email, f.telefono, f.domicilio, f.localidad, await Bun.password.hash(b.password)]);
    return c.json(r, 201);
  } catch (e) {
    if (esUnico(e)) return c.json({ error: 'Ya existe un matriculado con esa matrícula, DNI o email.' }, 409);
    throw e;
  }
});

app.put('/api/admin/matriculados/:id/estado', async (c) => {
  const { estado } = await body(c);
  if (!['activo', 'suspendido', 'baja'].includes(estado)) return c.json({ error: 'Estado inválido.' }, 400);
  await q('UPDATE matriculados SET estado = $1 WHERE id = $2', [estado, Number(c.req.param('id'))]);
  return c.json({ ok: true });
});

app.put('/api/admin/matriculados/:id/password', async (c) => {
  const { password } = await body(c);
  if (typeof password !== 'string' || password.length < 8) return c.json({ error: 'Mínimo 8 caracteres.' }, 400);
  await q('UPDATE matriculados SET password_hash = $1 WHERE id = $2', [await Bun.password.hash(password), Number(c.req.param('id'))]);
  return c.json({ ok: true });
});

app.post('/api/admin/cuotas/generar', async (c) => {
  const b = await body(c);
  const periodo = txt(b.periodo, 7), monto = Number(b.monto), venc = txt(b.vencimiento, 10);
  if (!/^\d{4}-\d{2}$/.test(periodo) || !(monto > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(venc))
    return c.json({ error: 'Completá período (AAAA-MM), monto y vencimiento.' }, 400);
  const r = await q(`INSERT INTO cuotas (matriculado_id, periodo, monto, vencimiento)
    SELECT id, $1, $2, $3::date FROM matriculados WHERE estado = 'activo'
    ON CONFLICT (matriculado_id, periodo) DO NOTHING RETURNING id`, [periodo, monto, venc]);
  return c.json({ generadas: r.length });
});

app.put('/api/admin/cuotas/:id/pagada', async (c) => {
  const b = await body(c);
  await q('UPDATE cuotas SET pagada = true, fecha_pago = now(), medio_pago = $1 WHERE id = $2',
    [txt(b.medio_pago, 40) || 'Registrado por administración', Number(c.req.param('id'))]);
  return c.json({ ok: true });
});

app.post('/api/admin/novedades', async (c) => {
  const b = await body(c);
  const titulo = txt(b.titulo, 200), contenido = txt(b.contenido, 10000);
  const tipo = ['comunicado', 'asamblea', 'legal', 'circular'].includes(b.tipo) ? b.tipo : 'comunicado';
  if (!titulo || !contenido) return c.json({ error: 'Título y contenido son obligatorios.' }, 400);
  const [r] = await q('INSERT INTO novedades (titulo, tipo, contenido) VALUES ($1,$2,$3) RETURNING *', [titulo, tipo, contenido]);
  return c.json(r, 201);
});

const columnas: Record<string, string[]> = {
  normativas: ['categoria', 'titulo', 'descripcion', 'url', 'orden'],
  autoridades: ['cargo', 'nombre', 'orden'],
  sedes: ['ciudad', 'direccion', 'horario', 'telefono', 'email', 'orden'],
};
for (const [t, cols] of Object.entries(columnas)) {
  const valores = (b: any) => cols.map((k) => (k === 'orden' ? Number(b[k]) || 0 : txt(b[k], 2000) || null));
  const invalido = (v: any[]) => (t === 'normativas' && !['ley', 'decreto', 'etica', 'resolucion'].includes(v[0])) || v.slice(0, 2).some((x) => !x);
  app.post(`/api/admin/${t}`, async (c) => {
    const v = valores(await body(c));
    if (invalido(v)) return c.json({ error: 'Completá los campos obligatorios.' }, 400);
    const [r] = await q(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, v);
    return c.json(r, 201);
  });
  app.put(`/api/admin/${t}/:id`, async (c) => {
    const v = valores(await body(c));
    if (invalido(v)) return c.json({ error: 'Completá los campos obligatorios.' }, 400);
    await q(`UPDATE ${t} SET ${cols.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1}`, [...v, Number(c.req.param('id'))]);
    return c.json({ ok: true });
  });
}
for (const t of ['personas', 'novedades', 'normativas', 'autoridades', 'sedes']) {
  app.delete(`/api/admin/${t}/:id`, async (c) => {
    await q(`DELETE FROM ${t} WHERE id = $1`, [Number(c.req.param('id'))]);
    return c.json({ ok: true });
  });
}

app.all('/api/*', (c) => c.json({ error: 'No encontrado' }, 404));

/* ----- Archivos estáticos (embebidos) ----- */

const ASSETS: Record<string, string> = {
  '/admin.html': `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Administración del Colegio</title>
  <meta name="robots" content="noindex">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="top">
    <div class="wrap">
      <a class="marca" href="/"><span class="sello">CM</span><span>Administración<small>Comisión Directiva</small></span></a>
      <nav class="menu"><a href="/">Ver sitio</a><a href="#" id="salir" class="oculto">Cerrar sesión</a></nav>
    </div>
  </header>

  <main class="wrap">
    <div id="vista-login" class="login-box oculto">
      <form id="form-login" class="card">
        <h2>Acceso administración</h2>
        <div style="margin:12px 0 16px"><label for="pw">Contraseña</label><input id="pw" name="password" type="password" required autocomplete="current-password"></div>
        <button class="btn" type="submit" style="width:100%">Ingresar</button>
        <div id="login-msg" class="oculto"></div>
      </form>
    </div>

    <div id="vista-panel" class="oculto" style="padding-bottom:48px">
      <div class="panel-head"><h2 style="margin:0">Panel de administración</h2></div>
      <div id="msg" class="oculto"></div>
      <div class="tabs" id="tabs">
        <button data-tab="personas" class="activo">Personas registradas</button>
        <button data-tab="matriculados">Matriculados</button>
        <button data-tab="cuotas">Cuotas</button>
        <button data-tab="novedades">Novedades</button>
        <button data-tab="institucional">Institucional</button>
      </div>

      <section data-panel="personas">
        <div class="tabla-wrap"><table>
          <thead><tr><th>Fecha</th><th>Nombre</th><th>Apellido</th><th>Email</th><th></th></tr></thead>
          <tbody id="t-personas"></tbody>
        </table></div>
      </section>

      <section data-panel="matriculados" class="oculto">
        <form id="f-matriculado" class="card" style="margin-bottom:16px">
          <h3>Alta de matriculado</h3>
          <div class="fila">
            <div><label>N.º matrícula</label><input name="matricula" required></div>
            <div><label>Nombre</label><input name="nombre" required></div>
            <div><label>Apellido</label><input name="apellido" required></div>
            <div><label>DNI</label><input name="dni" required inputmode="numeric"></div>
          </div>
          <div class="fila">
            <div><label>Email</label><input name="email" type="email" required></div>
            <div><label>Teléfono</label><input name="telefono"></div>
            <div><label>Domicilio profesional</label><input name="domicilio_profesional"></div>
            <div><label>Localidad</label><select name="localidad"><option>Río Grande</option><option>Ushuaia</option><option>Tolhuin</option></select></div>
          </div>
          <div class="fila">
            <div><label>Contraseña inicial del portal (mín. 8)</label><input name="password" minlength="8" required autocomplete="new-password"></div>
          </div>
          <button class="btn" type="submit">Dar de alta</button>
        </form>
        <div class="tabla-wrap"><table>
          <thead><tr><th>Matrícula</th><th>Apellido y nombre</th><th>DNI</th><th>Email</th><th>Localidad</th><th>Deuda</th><th>Estado</th><th></th></tr></thead>
          <tbody id="t-matriculados"></tbody>
        </table></div>
      </section>

      <section data-panel="cuotas" class="oculto">
        <form id="f-cuotas" class="card" style="margin-bottom:16px">
          <h3>Generar cuota para todos los matriculados activos</h3>
          <div class="fila">
            <div><label>Período (AAAA-MM)</label><input name="periodo" type="month" required></div>
            <div><label>Monto ($)</label><input name="monto" type="number" min="1" step="0.01" required></div>
            <div><label>Vencimiento</label><input name="vencimiento" type="date" required></div>
          </div>
          <button class="btn" type="submit">Generar cuotas</button>
        </form>
        <div class="tabla-wrap"><table>
          <thead><tr><th>Matrícula</th><th>Matriculado</th><th>Período</th><th>Vencimiento</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
          <tbody id="t-cuotas"></tbody>
        </table></div>
      </section>

      <section data-panel="novedades" class="oculto">
        <form id="f-novedad" class="card" style="margin-bottom:16px">
          <h3>Publicar comunicado</h3>
          <div class="fila">
            <div><label>Título</label><input name="titulo" required></div>
            <div><label>Tipo</label><select name="tipo">
              <option value="comunicado">Comunicado</option><option value="asamblea">Llamado a asamblea</option>
              <option value="legal">Novedad legal</option><option value="circular">Circular</option></select></div>
          </div>
          <div style="margin-bottom:12px"><label>Contenido</label><textarea name="contenido" required></textarea></div>
          <button class="btn" type="submit">Publicar</button>
        </form>
        <div class="grid" id="l-novedades"></div>
      </section>

      <section data-panel="institucional" class="oculto">
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items:start">
          <div class="card">
            <h3>Normativas</h3>
            <form id="f-normativas">
              <div style="margin-bottom:8px"><label>Categoría</label><select name="categoria">
                <option value="ley">Ley</option><option value="decreto">Decreto</option><option value="etica">Código de ética</option><option value="resolucion">Resolución</option></select></div>
              <div style="margin-bottom:8px"><label>Título</label><input name="titulo" required></div>
              <div style="margin-bottom:8px"><label>Descripción</label><input name="descripcion"></div>
              <div style="margin-bottom:12px"><label>Enlace (URL o PDF)</label><input name="url" type="url"></div>
              <button class="btn chico" type="submit">Agregar</button>
            </form>
            <ul class="lista-norma" id="l-normativas"></ul>
          </div>
          <div class="card">
            <h3>Autoridades</h3>
            <form id="f-autoridades">
              <div style="margin-bottom:8px"><label>Cargo</label><input name="cargo" required placeholder="Presidente/a"></div>
              <div style="margin-bottom:8px"><label>Nombre</label><input name="nombre" required></div>
              <div style="margin-bottom:12px"><label>Orden</label><input name="orden" type="number" value="0"></div>
              <button class="btn chico" type="submit">Agregar</button>
            </form>
            <ul class="lista-norma" id="l-autoridades"></ul>
          </div>
          <div class="card">
            <h3>Sedes</h3>
            <form id="f-sedes">
              <input type="hidden" name="id">
              <div style="margin-bottom:8px"><label>Ciudad</label><input name="ciudad" required></div>
              <div style="margin-bottom:8px"><label>Dirección</label><input name="direccion" required></div>
              <div style="margin-bottom:8px"><label>Horario</label><input name="horario"></div>
              <div style="margin-bottom:8px"><label>Teléfono</label><input name="telefono"></div>
              <div style="margin-bottom:8px"><label>Email</label><input name="email" type="email"></div>
              <div style="margin-bottom:12px"><label>Orden</label><input name="orden" type="number" value="0"></div>
              <button class="btn chico" type="submit">Guardar sede</button>
            </form>
            <ul class="lista-norma" id="l-sedes"></ul>
          </div>
        </div>
      </section>
    </div>
  </main>

  <script src="/comun.js"></script>
  <script src="/admin.js"></script>
</body>
</html>
`,
  '/admin.js': `let datos = {};
let inst = { normativas: [], autoridades: [], sedes: [] };

function mostrar(vista) {
  $('#vista-login').classList.toggle('oculto', vista !== 'login');
  $('#vista-panel').classList.toggle('oculto', vista !== 'panel');
  $('#salir').classList.toggle('oculto', vista !== 'panel');
}
const ok = (m) => aviso($('#msg'), 'ok', m);
const err = (m) => aviso($('#msg'), 'err', m);

async function cargar() {
  try {
    [datos, inst] = await Promise.all([api('/api/admin/resumen'), api('/api/institucional')]);
  } catch (e) {
    if (e.status === 401) return mostrar('login');
    return err(e.message);
  }
  mostrar('panel');
  pintar();
}

function pintar() {
  $('#t-personas').innerHTML = datos.personas.length ? datos.personas.map((p) => \`
    <tr><td>\${fechaHora(p.creado_en)}</td><td>\${esc(p.nombre)}</td><td>\${esc(p.apellido)}</td>
    <td><a href="mailto:\${esc(p.email)}">\${esc(p.email)}</a></td>
    <td><button class="btn chico claro" data-del="personas/\${p.id}">Eliminar</button></td></tr>\`).join('')
    : '<tr><td colspan="5" class="muted">Todavía no hay personas registradas.</td></tr>';

  $('#t-matriculados').innerHTML = datos.matriculados.length ? datos.matriculados.map((m) => \`
    <tr><td><strong>\${esc(m.matricula)}</strong></td><td>\${esc(m.apellido)}, \${esc(m.nombre)}</td><td>\${esc(m.dni)}</td>
    <td>\${esc(m.email)}</td><td>\${esc(m.localidad)}</td><td>\${pesos(m.deuda)}</td>
    <td><select data-estado="\${m.id}">\${['activo', 'suspendido', 'baja'].map((s) => \`<option value="\${s}" \${s === m.estado ? 'selected' : ''}>\${ETIQUETA_ESTADO[s][0]}</option>\`).join('')}</select></td>
    <td><button class="btn chico claro" data-reset="\${m.id}">Nueva contraseña</button></td></tr>\`).join('')
    : '<tr><td colspan="8" class="muted">No hay matriculados cargados.</td></tr>';

  $('#t-cuotas').innerHTML = datos.cuotas.length ? datos.cuotas.map((c) => \`
    <tr><td>\${esc(c.matricula)}</td><td>\${esc(c.apellido)}, \${esc(c.nombre)}</td><td>\${esc(c.periodo)}</td>
    <td>\${fecha(c.vencimiento)}</td><td>\${pesos(c.monto)}</td>
    <td>\${c.pagada ? \`<span class="chip ok">Pagada</span> <span class="muted">\${esc(c.medio_pago || '')}</span>\` : '<span class="chip warn">Impaga</span>'}</td>
    <td>\${c.pagada ? '' : \`<button class="btn chico" data-pagada="\${c.id}">Registrar pago</button>\`}</td></tr>\`).join('')
    : '<tr><td colspan="7" class="muted">No hay cuotas generadas.</td></tr>';

  $('#l-novedades').innerHTML = datos.novedades.map((n) => \`
    <article class="card novedad"><span class="chip neutro">\${esc(ETIQUETA_TIPO[n.tipo])}</span>
    <h3 style="margin-top:8px">\${esc(n.titulo)}</h3><div class="fecha">\${fechaHora(n.publicado_en)}</div>
    <p>\${esc(n.contenido)}</p><button class="btn chico claro" data-del="novedades/\${n.id}">Eliminar</button></article>\`).join('');

  $('#l-normativas').innerHTML = inst.normativas.map((n) => \`<li><span class="chip neutro">\${esc(ETIQUETA_CAT[n.categoria])}</span> \${esc(n.titulo)}
    <button class="btn chico claro" data-del="normativas/\${n.id}">Eliminar</button></li>\`).join('');
  $('#l-autoridades').innerHTML = inst.autoridades.map((a) => \`<li>\${esc(a.cargo)}: <strong>\${esc(a.nombre)}</strong>
    <button class="btn chico claro" data-del="autoridades/\${a.id}">Eliminar</button></li>\`).join('');
  $('#l-sedes').innerHTML = inst.sedes.map((s) => \`<li><strong>\${esc(s.ciudad)}</strong> — \${esc(s.direccion || '')}
    <button class="btn chico claro" data-editsede="\${s.id}">Editar</button>
    <button class="btn chico claro" data-del="sedes/\${s.id}">Eliminar</button></li>\`).join('');
}

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('activo', x === b));
  document.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('oculto', p.dataset.panel !== b.dataset.tab));
});

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/admin/login', { method: 'POST', body: formData(e.target) });
    e.target.reset();
    cargar();
  } catch (x) { aviso($('#login-msg'), 'err', x.message); }
});
$('#salir').addEventListener('click', async (e) => {
  e.preventDefault();
  await api('/api/admin/logout', { method: 'POST' });
  mostrar('login');
});

function enviar(sel, url, okMsg, transform = (d) => d) {
  $(sel).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api(url(e.target), { method: e.target.id?.value ? 'PUT' : 'POST', body: transform(formData(e.target)) });
      e.target.reset();
      if (e.target.id instanceof HTMLInputElement) e.target.id.value = '';
      ok(typeof okMsg === 'function' ? okMsg(r) : okMsg);
      cargar();
    } catch (x) { err(x.message); }
  });
}
enviar('#f-matriculado', () => '/api/admin/matriculados', 'Matriculado dado de alta.');
enviar('#f-cuotas', () => '/api/admin/cuotas/generar', (r) => \`Se generaron \${r.generadas} cuotas.\`);
enviar('#f-novedad', () => '/api/admin/novedades', 'Comunicado publicado.');
enviar('#f-normativas', () => '/api/admin/normativas', 'Normativa agregada.');
enviar('#f-autoridades', () => '/api/admin/autoridades', 'Autoridad agregada.');
enviar('#f-sedes', (f) => (f.id.value ? \`/api/admin/sedes/\${f.id.value}\` : '/api/admin/sedes'), 'Sede guardada.');

document.addEventListener('click', async (e) => {
  const del = e.target.closest('[data-del]');
  const reset = e.target.closest('[data-reset]');
  const pagada = e.target.closest('[data-pagada]');
  const edit = e.target.closest('[data-editsede]');
  try {
    if (del) {
      if (!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
      await api(\`/api/admin/\${del.dataset.del}\`, { method: 'DELETE' });
      ok('Registro eliminado.'); cargar();
    } else if (reset) {
      const pw = prompt('Nueva contraseña para el portal (mínimo 8 caracteres):');
      if (!pw) return;
      await api(\`/api/admin/matriculados/\${reset.dataset.reset}/password\`, { method: 'PUT', body: { password: pw } });
      ok('Contraseña actualizada. Comunicala al matriculado.');
    } else if (pagada) {
      const medio = prompt('Medio de pago (ej.: Transferencia, Efectivo):', 'Transferencia');
      if (medio === null) return;
      await api(\`/api/admin/cuotas/\${pagada.dataset.pagada}/pagada\`, { method: 'PUT', body: { medio_pago: medio } });
      ok('Pago registrado.'); cargar();
    } else if (edit) {
      const s = inst.sedes.find((x) => x.id === Number(edit.dataset.editsede));
      const f = $('#f-sedes');
      for (const k of ['id', 'ciudad', 'direccion', 'horario', 'telefono', 'email', 'orden']) f[k].value = s[k] ?? '';
      f.scrollIntoView({ behavior: 'smooth' });
    }
  } catch (x) { err(x.message); }
});

document.addEventListener('change', async (e) => {
  const s = e.target.closest('[data-estado]');
  if (!s) return;
  try {
    await api(\`/api/admin/matriculados/\${s.dataset.estado}/estado\`, { method: 'PUT', body: { estado: s.value } });
    ok('Estado actualizado.'); cargar();
  } catch (x) { err(x.message); }
});

cargar();
`,
  '/app.js': `// ---------- Institucional ----------
let normativas = [];
let catActiva = 'ley';

function pintarNormativas() {
  const tabs = $('#tabs-norma');
  tabs.innerHTML = Object.entries(ETIQUETA_CAT)
    .map(([k, v]) => \`<button type="button" data-cat="\${k}" class="\${k === catActiva ? 'activo' : ''}">\${v}</button>\`).join('');
  const items = normativas.filter((n) => n.categoria === catActiva);
  $('#normativas').innerHTML = items.length
    ? items.map((n) => \`<li><strong>\${n.url ? \`<a href="\${esc(n.url)}" target="_blank" rel="noopener">\${esc(n.titulo)}</a>\` : esc(n.titulo)}</strong>
        \${n.descripcion ? \`<div class="muted">\${esc(n.descripcion)}</div>\` : ''}</li>\`).join('')
    : '<li class="muted">Próximamente se publicará la normativa de esta categoría.</li>';
}
$('#tabs-norma').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cat]');
  if (b) { catActiva = b.dataset.cat; pintarNormativas(); }
});

api('/api/institucional').then(({ normativas: n, autoridades, sedes }) => {
  normativas = n;
  pintarNormativas();
  $('#autoridades').innerHTML = autoridades.length
    ? \`<table><tbody>\${autoridades.map((a) => \`<tr><td class="muted">\${esc(a.cargo)}</td><td><strong>\${esc(a.nombre)}</strong></td></tr>\`).join('')}</tbody></table>\`
    : 'La nómina de la Comisión Directiva se publicará próximamente.';
  $('#sedes').innerHTML = sedes.map((s) => \`
    <div class="card">
      <h3>\${esc(s.ciudad)}</h3>
      <p class="muted" style="margin:0">
        \${s.direccion ? \`📍 \${esc(s.direccion)}<br>\` : ''}
        \${s.horario ? \`🕘 \${esc(s.horario)}<br>\` : ''}
        \${s.telefono ? \`📞 \${esc(s.telefono)}<br>\` : ''}
        \${s.email ? \`✉️ <a href="mailto:\${esc(s.email)}">\${esc(s.email)}</a>\` : ''}
      </p>
    </div>\`).join('');
}).catch(() => { $('#autoridades').textContent = 'No se pudo cargar la información.'; });

// ---------- Padrón ----------
let t;
async function buscarPadron() {
  const params = new URLSearchParams({ q: $('#q').value.trim(), localidad: $('#loc').value });
  const body = $('#padron-body');
  try {
    const rows = await api(\`/api/padron?\${params}\`);
    body.innerHTML = rows.length ? rows.map((m) => {
      const [et, cls] = ETIQUETA_ESTADO[m.estado] || [m.estado, 'neutro'];
      return \`<tr>
        <td><strong>\${esc(m.matricula)}</strong></td>
        <td>\${esc(m.apellido)}, \${esc(m.nombre)}</td>
        <td>\${esc(m.localidad)}</td>
        <td><span class="chip \${cls}">\${et}</span></td>
        <td>\${m.habilitado ? '<span class="chip ok">Habilitado</span>' : '<span class="chip err">No habilitado</span>'}</td>
      </tr>\`;
    }).join('') : '<tr><td colspan="5" class="muted">No se encontraron matriculados con esos criterios.</td></tr>';
  } catch {
    body.innerHTML = '<tr><td colspan="5" class="muted">No se pudo consultar el padrón.</td></tr>';
  }
}
$('#q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(buscarPadron, 250); });
$('#loc').addEventListener('change', buscarPadron);
buscarPadron();

// ---------- Novedades ----------
api('/api/novedades').then((rows) => {
  $('#lista-novedades').innerHTML = rows.length ? rows.map((n) => \`
    <article class="card novedad">
      <span class="chip neutro">\${esc(ETIQUETA_TIPO[n.tipo] || n.tipo)}</span>
      <h3 style="margin-top:8px">\${esc(n.titulo)}</h3>
      <div class="fecha">\${fechaHora(n.publicado_en)}</div>
      <p>\${esc(n.contenido)}</p>
    </article>\`).join('') : '<p class="muted">No hay novedades publicadas.</p>';
});

// ---------- Registro ----------
$('#form-registro').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target, msg = $('#registro-msg'), btn = form.querySelector('button');
  btn.disabled = true;
  try {
    const p = await api('/api/personas', { method: 'POST', body: formData(form) });
    aviso(msg, 'ok', \`¡Gracias, \${p.nombre}! Tu registro fue guardado correctamente.\`);
    form.reset();
  } catch (err) {
    aviso(msg, 'err', err.message);
  } finally {
    btn.disabled = false;
  }
});
`,
  '/comun.js': `// Utilidades compartidas
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : '—');
const fechaHora = (d) => (d ? new Date(d).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const pesos = (n) => Number(n).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

async function api(url, opts = {}) {
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || 'Ocurrió un error.'); e.status = r.status; throw e; }
  return data;
}

function aviso(el, tipo, msg) {
  el.className = \`aviso \${tipo}\`;
  el.textContent = msg;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

const ETIQUETA_ESTADO = { activo: ['Activo', 'ok'], suspendido: ['Suspendido', 'warn'], baja: ['Baja', 'err'] };
const ETIQUETA_TIPO = { comunicado: 'Comunicado', asamblea: 'Llamado a asamblea', legal: 'Novedad legal', circular: 'Circular' };
const ETIQUETA_CAT = { ley: 'Leyes', decreto: 'Decretos', etica: 'Código de ética', resolucion: 'Resoluciones vigentes' };
`,
  '/index.html': `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Colegio de Martilleros de Tierra del Fuego</title>
  <meta name="description" content="Sitio oficial del Colegio de Martilleros y Corredores Públicos de Tierra del Fuego: padrón de matriculados, normativa, novedades y portal de autogestión.">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="top">
    <div class="wrap">
      <a class="marca" href="#inicio"><span class="sello">CM</span><span>Colegio de Martilleros<small>Tierra del Fuego</small></span></a>
      <nav class="menu">
        <a href="#institucional">Institucional</a>
        <a href="#padron">Padrón</a>
        <a href="#novedades">Novedades</a>
        <a href="#contacto">Contacto</a>
        <a href="#registro">Registrarse</a>
        <a class="cta" href="/portal.html">Portal matriculados</a>
      </nav>
    </div>
  </header>

  <section class="hero" id="inicio">
    <div class="wrap">
      <h1>Colegio de Martilleros y Corredores Públicos de Tierra del Fuego</h1>
      <p>Información institucional, verificación pública de matrículas y servicios en línea para los profesionales de Río Grande, Ushuaia y Tolhuin.</p>
      <div class="acciones">
        <a class="btn dorado" href="#padron">Verificar un martillero</a>
        <a class="btn claro" href="/portal.html">Ingresar al portal</a>
      </div>
    </div>
  </section>

  <section class="bloque" id="institucional">
    <div class="wrap">
      <h2>Información institucional</h2>
      <p class="sub">Autoridades, leyes provinciales, decretos, código de ética y resoluciones vigentes.</p>
      <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); align-items: start;">
        <div class="card">
          <h3>Autoridades</h3>
          <div id="autoridades" class="muted">Cargando…</div>
        </div>
        <div class="card">
          <h3>Normativas</h3>
          <div class="tabs" id="tabs-norma"></div>
          <ul class="lista-norma" id="normativas"></ul>
        </div>
      </div>
    </div>
  </section>

  <section class="bloque" id="padron">
    <div class="wrap">
      <h2>Padrón de matriculados</h2>
      <p class="sub">Verificá si un martillero o corredor está matriculado y habilitado para ejercer en la provincia.</p>
      <div class="buscador">
        <input id="q" type="search" placeholder="Buscar por apellido, nombre, N.º de matrícula o DNI" autocomplete="off">
        <select id="loc">
          <option value="">Todas las localidades</option>
          <option>Río Grande</option><option>Ushuaia</option><option>Tolhuin</option>
        </select>
      </div>
      <div class="tabla-wrap">
        <table>
          <thead><tr><th>Matrícula</th><th>Apellido y nombre</th><th>Localidad</th><th>Estado</th><th>Habilitación</th></tr></thead>
          <tbody id="padron-body"><tr><td colspan="5" class="muted">Cargando…</td></tr></tbody>
        </table>
      </div>
      <p class="muted">La información del padrón se actualiza en tiempo real desde los registros del Colegio.</p>
    </div>
  </section>

  <section class="bloque" id="novedades">
    <div class="wrap">
      <h2>Novedades y circulares</h2>
      <p class="sub">Comunicados de la Comisión Directiva, llamados a asamblea y novedades legales.</p>
      <div class="grid" id="lista-novedades"></div>
    </div>
  </section>

  <section class="bloque" id="contacto">
    <div class="wrap">
      <h2>Contacto y sedes</h2>
      <p class="sub">Ubicación, horarios de atención y canales oficiales.</p>
      <div class="grid" id="sedes"></div>
    </div>
  </section>

  <section class="bloque" id="registro">
    <div class="wrap" style="max-width: 720px;">
      <h2>Registrate</h2>
      <p class="sub">Dejá tus datos para recibir información y novedades del Colegio.</p>
      <form id="form-registro" class="card" novalidate>
        <div class="fila">
          <div><label for="r-nombre">Nombre</label><input id="r-nombre" name="nombre" required maxlength="80" autocomplete="given-name"></div>
          <div><label for="r-apellido">Apellido</label><input id="r-apellido" name="apellido" required maxlength="80" autocomplete="family-name"></div>
        </div>
        <div class="fila">
          <div><label for="r-email">Email</label><input id="r-email" name="email" type="email" required maxlength="120" autocomplete="email"></div>
        </div>
        <button class="btn" type="submit">Registrarme</button>
        <div id="registro-msg" class="oculto"></div>
      </form>
    </div>
  </section>

  <footer>
    <div class="wrap">
      <strong>Colegio de Martilleros y Corredores Públicos de Tierra del Fuego</strong><br>
      Río Grande · Ushuaia · Tolhuin — <a href="/portal.html">Portal de matriculados</a> · <a href="/admin.html">Administración</a>
    </div>
  </footer>

  <script src="/comun.js"></script>
  <script src="/app.js"></script>
</body>
</html>
`,
  '/portal.html': `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Portal de Matriculados</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="top">
    <div class="wrap">
      <a class="marca" href="/"><span class="sello">CM</span><span>Portal de Autogestión<small>Colegio de Martilleros TDF</small></span></a>
      <nav class="menu"><a href="/">Volver al sitio</a><a href="#" id="salir" class="oculto">Cerrar sesión</a></nav>
    </div>
  </header>

  <main class="wrap">
    <div id="vista-login" class="login-box oculto">
      <form id="form-login" class="card">
        <h2>Ingresar</h2>
        <p class="muted">Usá tu N.º de matrícula, DNI o email y la contraseña que te entregó el Colegio.</p>
        <div style="margin-bottom:12px"><label for="usuario">Usuario</label><input id="usuario" name="usuario" required autocomplete="username"></div>
        <div style="margin-bottom:16px"><label for="password">Contraseña</label><input id="password" name="password" type="password" required autocomplete="current-password"></div>
        <button class="btn" type="submit" style="width:100%">Ingresar</button>
        <div id="login-msg" class="oculto"></div>
      </form>
    </div>

    <div id="vista-panel" class="oculto">
      <div class="panel-head">
        <div>
          <h2 id="saludo" style="margin:0"></h2>
          <div class="muted" id="sub-saludo"></div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <a class="btn" href="/api/portal/certificado" id="btn-cert">Certificado de vigencia (PDF)</a>
          <a class="btn dorado" href="/api/portal/credencial" id="btn-cred">Credencial digital (PDF)</a>
        </div>
      </div>
      <div id="pago-msg" class="oculto"></div>

      <div class="grid" style="margin-bottom:24px">
        <div class="card"><div class="muted">Estado de matrícula</div><div class="kpi" id="kpi-estado"></div></div>
        <div class="card"><div class="muted">Deuda pendiente</div><div class="kpi" id="kpi-deuda"></div></div>
        <div class="card"><div class="muted">Fecha de alta</div><div class="kpi" id="kpi-alta"></div></div>
      </div>

      <section class="card" style="margin-bottom:24px">
        <h3>Estado de cuenta — Cuota societaria</h3>
        <div class="tabla-wrap">
          <table>
            <thead><tr><th>Período</th><th>Vencimiento</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
            <tbody id="cuotas"></tbody>
          </table>
        </div>
        <p class="muted" id="nota-pago"></p>
      </section>

      <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items:start; margin-bottom:48px">
        <form id="form-datos" class="card">
          <h3>Mis datos de contacto</h3>
          <div style="margin-bottom:12px"><label>Email</label><input name="email" type="email" required></div>
          <div style="margin-bottom:12px"><label>Teléfono</label><input name="telefono"></div>
          <div style="margin-bottom:12px"><label>Domicilio profesional</label><input name="domicilio_profesional"></div>
          <div style="margin-bottom:16px"><label>Localidad</label>
            <select name="localidad"><option>Río Grande</option><option>Ushuaia</option><option>Tolhuin</option></select></div>
          <button class="btn" type="submit">Guardar cambios</button>
          <div id="datos-msg" class="oculto"></div>
        </form>
        <form id="form-pass" class="card">
          <h3>Cambiar contraseña</h3>
          <div style="margin-bottom:12px"><label>Contraseña actual</label><input name="actual" type="password" required autocomplete="current-password"></div>
          <div style="margin-bottom:16px"><label>Nueva contraseña (mín. 8 caracteres)</label><input name="nueva" type="password" minlength="8" required autocomplete="new-password"></div>
          <button class="btn" type="submit">Actualizar contraseña</button>
          <div id="pass-msg" class="oculto"></div>
        </form>
      </div>
    </div>
  </main>

  <script src="/comun.js"></script>
  <script src="/portal.js"></script>
</body>
</html>
`,
  '/portal.js': `function mostrar(vista) {
  $('#vista-login').classList.toggle('oculto', vista !== 'login');
  $('#vista-panel').classList.toggle('oculto', vista !== 'panel');
  $('#salir').classList.toggle('oculto', vista !== 'panel');
}

async function cargar() {
  try {
    const { matriculado: m, cuotas, deuda, pagoOnline } = await api('/api/portal/yo');
    mostrar('panel');
    $('#saludo').textContent = \`Hola, \${m.nombre} \${m.apellido}\`;
    $('#sub-saludo').textContent = \`Matrícula N.º \${m.matricula} · \${m.localidad}\`;
    const [et, cls] = ETIQUETA_ESTADO[m.estado] || [m.estado, 'neutro'];
    $('#kpi-estado').innerHTML = \`<span class="chip \${cls}" style="font-size:18px">\${et}</span>\`;
    $('#kpi-deuda').textContent = pesos(deuda);
    $('#kpi-alta').textContent = fecha(m.fecha_alta);
    const activo = m.estado === 'activo';
    $('#btn-cert').classList.toggle('oculto', !activo);
    $('#btn-cred').classList.toggle('oculto', !activo);

    $('#cuotas').innerHTML = cuotas.length ? cuotas.map((c) => \`
      <tr>
        <td>\${esc(c.periodo)}</td>
        <td>\${fecha(c.vencimiento)}</td>
        <td>\${pesos(c.monto)}</td>
        <td>\${c.pagada ? \`<span class="chip ok">Pagada</span> <span class="muted">\${fecha(c.fecha_pago)}</span>\`
          : new Date(c.vencimiento) < new Date() ? '<span class="chip err">Vencida</span>' : '<span class="chip warn">Pendiente</span>'}</td>
        <td>\${!c.pagada && pagoOnline ? \`<button class="btn chico dorado" data-pagar="\${c.id}">Pagar</button>\` : ''}</td>
      </tr>\`).join('') : '<tr><td colspan="5" class="muted">No hay cuotas registradas.</td></tr>';
    $('#nota-pago').textContent = pagoOnline
      ? 'El pago se procesa de forma segura a través de Mercado Pago y se acredita automáticamente.'
      : 'El pago online estará disponible próximamente. Mientras tanto, aboná por transferencia o en la sede y la administración registrará el pago.';

    const f = $('#form-datos');
    f.email.value = m.email || '';
    f.telefono.value = m.telefono || '';
    f.domicilio_profesional.value = m.domicilio_profesional || '';
    f.localidad.value = m.localidad;
  } catch (e) {
    mostrar('login');
  }
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/portal/login', { method: 'POST', body: formData(e.target) });
    e.target.reset();
    $('#login-msg').className = 'oculto';
    cargar();
  } catch (err) { aviso($('#login-msg'), 'err', err.message); }
});

$('#salir').addEventListener('click', async (e) => {
  e.preventDefault();
  await api('/api/portal/logout', { method: 'POST' });
  mostrar('login');
});

$('#form-datos').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/portal/yo', { method: 'PUT', body: formData(e.target) });
    aviso($('#datos-msg'), 'ok', 'Datos actualizados correctamente.');
  } catch (err) { aviso($('#datos-msg'), 'err', err.message); }
});

$('#form-pass').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/portal/password', { method: 'PUT', body: formData(e.target) });
    e.target.reset();
    aviso($('#pass-msg'), 'ok', 'Contraseña actualizada.');
  } catch (err) { aviso($('#pass-msg'), 'err', err.message); }
});

$('#cuotas').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-pagar]');
  if (!b) return;
  b.disabled = true;
  try {
    const { url } = await api(\`/api/portal/cuotas/\${b.dataset.pagar}/pagar\`, { method: 'POST' });
    location.href = url;
  } catch (err) { aviso($('#pago-msg'), 'err', err.message); b.disabled = false; }
});

const pago = new URLSearchParams(location.search).get('pago');
if (pago) {
  const m = { ok: ['ok', 'Pago recibido. Se acreditará en unos minutos.'], pendiente: ['warn', 'Tu pago está pendiente de acreditación.'], error: ['err', 'El pago no pudo completarse.'] }[pago];
  if (m) aviso($('#pago-msg'), m[0], m[1]);
}

cargar();
`,
  '/styles.css': `:root {
  --azul: #1f3a5f;
  --azul-2: #2c5282;
  --dorado: #c8a24a;
  --bg: #f5f6f8;
  --card: #ffffff;
  --texto: #1d2430;
  --suave: #5b6576;
  --borde: #dfe3ea;
  --ok: #1e7b4a;
  --ok-bg: #e3f4ea;
  --warn: #8a5a00;
  --warn-bg: #fdf1d8;
  --err: #a32121;
  --err-bg: #fbe4e4;
  --radio: 10px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #11161f; --card: #1a2130; --texto: #e6e9ef; --suave: #a3adbf; --borde: #2c3546;
    --ok-bg: #173526; --warn-bg: #3a2e12; --err-bg: #3d1a1a; --ok: #6fd39c; --warn: #f0c46a; --err: #f08b8b;
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--texto); line-height: 1.55; }
a { color: var(--azul-2); }
@media (prefers-color-scheme: dark) { a { color: #8fb6ec; } }

header.top { background: var(--azul); color: #fff; position: sticky; top: 0; z-index: 10; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
.top .wrap { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; flex-wrap: wrap; }
.marca { display: flex; align-items: center; gap: 10px; color: #fff; text-decoration: none; font-weight: 700; }
.marca .sello { width: 38px; height: 38px; border-radius: 50%; background: var(--dorado); color: var(--azul); display: grid; place-items: center; font-weight: 800; font-size: 14px; }
.marca small { display: block; font-weight: 400; opacity: .8; font-size: 12px; }
nav.menu { display: flex; gap: 4px; flex-wrap: wrap; }
nav.menu a { color: #fff; text-decoration: none; padding: 6px 10px; border-radius: 6px; font-size: 14px; }
nav.menu a:hover, nav.menu a.activo { background: rgba(255,255,255,.14); }
nav.menu a.cta { background: var(--dorado); color: var(--azul); font-weight: 700; }

.wrap { max-width: 1100px; margin: 0 auto; padding: 0 16px; }
.hero { background: linear-gradient(135deg, var(--azul) 0%, var(--azul-2) 100%); color: #fff; padding: 56px 0 64px; }
.hero h1 { font-size: clamp(26px, 4vw, 40px); margin: 0 0 12px; line-height: 1.2; }
.hero p { max-width: 640px; opacity: .92; margin: 0 0 24px; }
.hero .acciones { display: flex; gap: 12px; flex-wrap: wrap; }

section.bloque { padding: 48px 0; }
section.bloque:nth-of-type(even) { background: var(--card); }
h2 { color: var(--azul); margin: 0 0 6px; font-size: 26px; }
@media (prefers-color-scheme: dark) { h2 { color: #c9d8f0; } }
.sub { color: var(--suave); margin: 0 0 24px; }

.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.card { background: var(--card); border: 1px solid var(--borde); border-radius: var(--radio); padding: 20px; }
section.bloque:nth-of-type(even) .card { background: var(--bg); }
.card h3 { margin: 0 0 8px; font-size: 18px; }
.muted { color: var(--suave); font-size: 14px; }

.btn { display: inline-block; border: 0; border-radius: 8px; padding: 10px 18px; font-size: 15px; font-weight: 600; cursor: pointer; text-decoration: none; background: var(--azul); color: #fff; }
.btn:hover { filter: brightness(1.1); }
.btn.dorado { background: var(--dorado); color: var(--azul); }
.btn.claro { background: transparent; color: inherit; border: 1px solid currentColor; }
.btn.chico { padding: 6px 12px; font-size: 13px; }
.btn:disabled { opacity: .6; cursor: default; }

form .fila { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 12px; }
label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 4px; }
input, select, textarea { width: 100%; padding: 10px 12px; border: 1px solid var(--borde); border-radius: 8px; font: inherit; background: var(--card); color: var(--texto); }
textarea { min-height: 110px; resize: vertical; }
input:focus, select:focus, textarea:focus { outline: 2px solid var(--azul-2); outline-offset: 1px; }

.aviso { padding: 10px 14px; border-radius: 8px; margin: 12px 0; font-size: 14px; }
.aviso.ok { background: var(--ok-bg); color: var(--ok); }
.aviso.err { background: var(--err-bg); color: var(--err); }
.aviso.warn { background: var(--warn-bg); color: var(--warn); }
.oculto { display: none !important; }

.buscador { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.buscador input { flex: 1 1 260px; }
.buscador select { flex: 0 0 180px; }

.tabla-wrap { overflow-x: auto; border: 1px solid var(--borde); border-radius: var(--radio); background: var(--card); }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--borde); vertical-align: top; }
th { background: var(--bg); font-weight: 600; white-space: nowrap; }
tr:last-child td { border-bottom: 0; }

.chip { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.chip.ok { background: var(--ok-bg); color: var(--ok); }
.chip.warn { background: var(--warn-bg); color: var(--warn); }
.chip.err { background: var(--err-bg); color: var(--err); }
.chip.neutro { background: var(--bg); color: var(--suave); border: 1px solid var(--borde); }

.novedad { border-left: 4px solid var(--dorado); }
.novedad .fecha { font-size: 13px; color: var(--suave); }
.novedad p { white-space: pre-line; margin: 8px 0 0; }

.tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
.tabs button { background: var(--card); border: 1px solid var(--borde); color: var(--texto); padding: 8px 14px; border-radius: 8px; cursor: pointer; font: inherit; }
.tabs button.activo { background: var(--azul); color: #fff; border-color: var(--azul); }

.lista-norma { list-style: none; padding: 0; margin: 0; }
.lista-norma li { padding: 12px 0; border-bottom: 1px solid var(--borde); }
.lista-norma li:last-child { border-bottom: 0; }

footer { background: var(--azul); color: #dbe4f0; padding: 28px 0; font-size: 14px; }
footer a { color: #fff; }

.login-box { max-width: 420px; margin: 48px auto; }
.panel-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin: 24px 0; }
.kpi { font-size: 28px; font-weight: 800; }

@media (max-width: 640px) {
  nav.menu { width: 100%; }
  .hero { padding: 36px 0 44px; }
  section.bloque { padding: 32px 0; }
}
`,
};

const TIPOS: Record<string, string> = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8' };
app.get('*', (c) => {
  const ruta = c.req.path === '/' ? '/index.html' : c.req.path;
  const contenido = ASSETS[ruta];
  if (contenido === undefined) return c.text('Página no encontrada', 404);
  return c.body(contenido, 200, { 'Content-Type': TIPOS[ruta.split('.').pop()!] || 'text/plain', 'Cache-Control': 'no-cache' });
});

await initDB();
Bun.serve({ port: Number(Bun.env.PORT ?? 3000), fetch: app.fetch });
console.log('Servidor iniciado');
