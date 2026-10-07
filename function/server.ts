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

// __ASSETS__

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
