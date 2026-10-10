import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { q, esUnico, leerConfig, CATEGORIAS_NOVEDAD, CATEGORIAS_DOC, TITULOS, ORGANOS, ASUNTOS, CONTENIDOS } from './db';
import {
  ENV, txt, EMAIL_RE, urlValida, firmar, verificar, cookieOpts, excede, ipDe, baseUrl, igualSeguro, normalizar, fechaLocal,
} from './util';
import { certificadoPdf, credencialPdf } from './pdf';

export const api = new Hono<{ Variables: { user: any } }>();

const leer = async (c: any): Promise<any> => { try { return await c.req.json(); } catch { return {}; } };
const idParam = (c: any) => Number(c.req.param('id')) || 0;
const falla = (c: any, error: string, status = 400) => c.json({ error }, status);
const bool = (v: unknown) => v === true || v === 'true' || v === 'on';

function auth(rol: 'admin' | 'matriculado') {
  return async (c: any, next: any) => {
    const data = verificar(getCookie(c, rol === 'admin' ? 'adm' : 'mat'));
    if (!data || data.role !== rol) return falla(c, 'Sesión no válida. Ingresá nuevamente.', 401);
    c.set('user', data);
    await next();
  };
}

/* --------------------------------- Público --------------------------------- */

// Suscripción a novedades (registro de personas: nombre, apellido y email)
api.post('/api/personas', async (c) => {
  if (excede(`sus:${ipDe(c)}`, 5)) return falla(c, 'Demasiados intentos. Probá nuevamente en unos minutos.', 429);
  const b = await leer(c);
  if (txt(b.sitio)) return c.json({ ok: true }, 201); // trampa para robots
  const nombre = txt(b.nombre, 80), apellido = txt(b.apellido, 80), email = txt(b.email, 120).toLowerCase();
  if (!nombre || !apellido) return falla(c, 'Nombre y apellido son obligatorios.');
  if (!EMAIL_RE.test(email)) return falla(c, 'El correo electrónico no es válido.');
  if (!bool(b.acepta)) return falla(c, 'Para suscribirte tenés que aceptar la política de privacidad.');
  try {
    await q('INSERT INTO personas (nombre, apellido, email, acepta_privacidad) VALUES ($1,$2,$3,true)', [nombre, apellido, email]);
    return c.json({ ok: true }, 201);
  } catch (e) {
    if (esUnico(e)) return falla(c, 'Ese correo ya está suscripto a las novedades.', 409);
    throw e;
  }
});

const NORM = (e: string) => `translate(lower(${e}), 'áéíóúüñàèìòù', 'aeiouunaeiou')`;
api.get('/api/padron', async (c) => {
  const busq = normalizar(txt(c.req.query('q'), 80));
  const titulo = c.req.query('titulo') ?? '', est = c.req.query('estado') ?? '';
  const p: unknown[] = [];
  let w = "estado <> 'baja'";
  if (busq) {
    p.push(`%${busq}%`);
    w += ` AND (${NORM("nombre || ' ' || apellido")} LIKE $1 OR ${NORM("apellido || ' ' || nombre")} LIKE $1 OR ${NORM("apellido || ', ' || nombre")} LIKE $1 OR lower(matricula) LIKE $1)`;
  }
  if (titulo in TITULOS) { p.push(titulo); w += ` AND titulo = $${p.length}`; }
  if (est === 'activo' || est === 'suspendido') { p.push(est); w += ` AND estado = $${p.length}`; }
  const rows = await q(
    `SELECT matricula, nombre, apellido, titulo, estado,
       (estado = 'activo' AND NOT EXISTS (SELECT 1 FROM cuotas cu WHERE cu.matriculado_id = m.id AND NOT cu.pagada AND cu.vencimiento < CURRENT_DATE - 90)) AS habilitado
     FROM matriculados m WHERE ${w} ORDER BY apellido, nombre LIMIT 200`, p);
  return c.json(rows.map((r) => ({ ...r, titulo_txt: TITULOS[r.titulo] ?? '' })));
});

api.post('/api/contacto', async (c) => {
  if (excede(`con:${ipDe(c)}`, 5)) return falla(c, 'Demasiados envíos. Probá nuevamente en unos minutos.', 429);
  const b = await leer(c);
  if (txt(b.sitio)) return c.json({ ok: true }, 201);
  const nombre = txt(b.nombre, 120), email = txt(b.email, 120).toLowerCase(), telefono = txt(b.telefono, 40);
  const asunto = ASUNTOS.includes(b.asunto) ? b.asunto : '', mensaje = txt(b.mensaje, 4000);
  if (nombre.length < 3) return falla(c, 'Ingresá tu nombre y apellido.');
  if (!EMAIL_RE.test(email)) return falla(c, 'El correo electrónico no es válido.');
  if (telefono && !/^[0-9 +()\-]{6,40}$/.test(telefono)) return falla(c, 'El teléfono no es válido.');
  if (!asunto) return falla(c, 'Elegí un asunto.');
  if (mensaje.length < 10) return falla(c, 'El mensaje debe tener al menos 10 caracteres.');
  if (!bool(b.acepta)) return falla(c, 'Para enviar la consulta tenés que aceptar la política de privacidad.');
  await q('INSERT INTO mensajes (nombre, email, telefono, asunto, mensaje) VALUES ($1,$2,$3,$4,$5)', [nombre, email, telefono || null, asunto, mensaje]);
  return c.json({ ok: true }, 201);
});

// Archivos subidos por la administración (documentos públicos e imágenes)
api.get('/archivos/:id', async (c) => {
  const [a] = await q('SELECT nombre, tipo, datos FROM archivos WHERE id = $1', [idParam(c)]);
  if (!a) return c.text('Archivo no encontrado', 404);
  const enLinea = /^(image\/|application\/pdf)/.test(a.tipo);
  return new Response(a.datos, {
    headers: {
      'Content-Type': a.tipo,
      'Content-Disposition': `${enLinea ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.nombre)}`,
      'Cache-Control': 'public, max-age=86400',
    },
  });
});

/* -------------------------- Portal de matriculados -------------------------- */

api.post('/api/portal/login', async (c) => {
  if (excede(`login:${ipDe(c)}`, 10)) return falla(c, 'Demasiados intentos. Probá en 15 minutos.', 429);
  const b = await leer(c);
  const usuario = txt(b.usuario, 120).toLowerCase();
  const [m] = await q('SELECT id, password_hash, estado FROM matriculados WHERE lower(matricula) = $1 OR lower(email) = $1 OR dni = $1', [usuario]);
  if (!m || !(await Bun.password.verify(String(b.password ?? ''), m.password_hash))) return falla(c, 'Usuario o contraseña incorrectos.', 401);
  if (m.estado === 'baja') return falla(c, 'La matrícula se encuentra dada de baja.', 403);
  setCookie(c, 'mat', firmar({ id: m.id, role: 'matriculado' }), cookieOpts);
  return c.json({ ok: true });
});
api.post('/api/portal/logout', (c) => { deleteCookie(c, 'mat', { path: '/' }); return c.json({ ok: true }); });

async function matriculado(id: number) {
  const [m] = await q(`SELECT id, matricula, nombre, apellido, dni, email, telefono, domicilio_profesional, titulo, estado, fecha_alta
    FROM matriculados WHERE id = $1`, [id]);
  return m;
}

api.get('/api/portal/yo', auth('matriculado'), async (c) => {
  const m = await matriculado(c.get('user').id);
  if (!m) return falla(c, 'No encontrado', 404);
  const cuotas = await q('SELECT id, periodo, monto, vencimiento, pagada, fecha_pago, medio_pago FROM cuotas WHERE matriculado_id = $1 ORDER BY vencimiento DESC', [m.id]);
  const deuda = cuotas.filter((x) => !x.pagada).reduce((a, x) => a + Number(x.monto), 0);
  return c.json({ matriculado: { ...m, titulo_txt: TITULOS[m.titulo] ?? '' }, cuotas, deuda, pagoOnline: Boolean(ENV.MP_ACCESS_TOKEN) });
});

api.put('/api/portal/yo', auth('matriculado'), async (c) => {
  const b = await leer(c);
  const email = txt(b.email, 120).toLowerCase();
  if (!EMAIL_RE.test(email)) return falla(c, 'El correo electrónico no es válido.');
  try {
    await q('UPDATE matriculados SET email = $1, telefono = $2, domicilio_profesional = $3 WHERE id = $4',
      [email, txt(b.telefono, 40), txt(b.domicilio_profesional, 200), c.get('user').id]);
  } catch (e) {
    if (esUnico(e)) return falla(c, 'Ese correo ya está en uso.', 409);
    throw e;
  }
  return c.json(await matriculado(c.get('user').id));
});

api.put('/api/portal/password', auth('matriculado'), async (c) => {
  const { actual, nueva } = await leer(c);
  if (typeof nueva !== 'string' || nueva.length < 8) return falla(c, 'La nueva contraseña debe tener al menos 8 caracteres.');
  const [r] = await q('SELECT password_hash FROM matriculados WHERE id = $1', [c.get('user').id]);
  if (!r || !(await Bun.password.verify(String(actual ?? ''), r.password_hash))) return falla(c, 'La contraseña actual es incorrecta.');
  await q('UPDATE matriculados SET password_hash = $1 WHERE id = $2', [await Bun.password.hash(nueva), c.get('user').id]);
  return c.json({ ok: true });
});

api.post('/api/portal/cuotas/:id/pagar', auth('matriculado'), async (c) => {
  if (!ENV.MP_ACCESS_TOKEN) return falla(c, 'El pago online todavía no está habilitado. Consultá los medios de pago con la Departamental.', 501);
  const [cu] = await q('SELECT * FROM cuotas WHERE id = $1 AND matriculado_id = $2 AND NOT pagada', [idParam(c), c.get('user').id]);
  if (!cu) return falla(c, 'Cuota inexistente o ya pagada.', 404);
  const base = baseUrl(c);
  const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ENV.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ title: `Cuota societaria ${cu.periodo}`, quantity: 1, unit_price: Number(cu.monto), currency_id: 'ARS' }],
      external_reference: String(cu.id),
      notification_url: `${base}/api/pagos/webhook`,
      back_urls: { success: `${base}/portal?pago=ok`, failure: `${base}/portal?pago=error`, pending: `${base}/portal?pago=pendiente` },
      auto_return: 'approved',
    }),
  });
  const data: any = await r.json();
  if (!r.ok) { console.error('Mercado Pago:', data); return falla(c, 'No se pudo iniciar el pago.', 502); }
  return c.json({ url: data.init_point });
});

api.post('/api/pagos/webhook', async (c) => {
  if (!ENV.MP_ACCESS_TOKEN) return c.body(null, 200);
  const b = await leer(c);
  const id = b?.data?.id || c.req.query('data.id') || c.req.query('id');
  if (id && (!b.type || b.type === 'payment')) {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${ENV.MP_ACCESS_TOKEN}` } });
    if (r.ok) {
      const p: any = await r.json();
      if (p.status === 'approved' && p.external_reference)
        await q("UPDATE cuotas SET pagada = true, fecha_pago = now(), medio_pago = 'Mercado Pago' WHERE id = $1 AND NOT pagada", [Number(p.external_reference)]);
    }
  }
  return c.body(null, 200);
});

api.get('/api/portal/certificado', auth('matriculado'), async (c) => {
  const m = await matriculado(c.get('user').id);
  if (!m || m.estado !== 'activo') return falla(c, 'Solo las matrículas activas pueden descargar la constancia.', 403);
  return certificadoPdf(m, baseUrl(c));
});
api.get('/api/portal/credencial', auth('matriculado'), async (c) => {
  const m = await matriculado(c.get('user').id);
  if (!m || m.estado !== 'activo') return falla(c, 'Solo las matrículas activas pueden descargar la credencial.', 403);
  return credencialPdf(m);
});

/* ------------------------------ Administración ------------------------------ */

api.post('/api/admin/login', async (c) => {
  if (excede(`admin:${ipDe(c)}`, 10)) return falla(c, 'Demasiados intentos. Probá en 15 minutos.', 429);
  const { password } = await leer(c);
  if (typeof password !== 'string' || !igualSeguro(password, ENV.ADMIN_PASSWORD)) return falla(c, 'Contraseña incorrecta.', 401);
  setCookie(c, 'adm', firmar({ role: 'admin' }), cookieOpts);
  return c.json({ ok: true });
});
api.post('/api/admin/logout', (c) => { deleteCookie(c, 'adm', { path: '/' }); return c.json({ ok: true }); });

api.use('/api/admin/*', async (c, next) => {
  if (c.req.path === '/api/admin/login' || c.req.path === '/api/admin/logout') return next();
  return auth('admin')(c, next);
});

api.get('/api/admin/resumen', async (c) => {
  const [novedades, documentos, autoridades, config, mensajes, personas, matriculados, cuotas] = await Promise.all([
    q('SELECT id, titulo, categoria, resumen, contenido, imagen_id, imagen_alt, fecha_evento, lugar, destacado, enlace, publicado_en FROM novedades ORDER BY publicado_en DESC'),
    q('SELECT id, categoria, titulo, descripcion, url, fecha, archivo_id, orden FROM normativas ORDER BY categoria, orden, id'),
    q('SELECT id, organo, cargo, nombre, mandato, orden FROM autoridades ORDER BY orden, id'),
    leerConfig(),
    q('SELECT * FROM mensajes ORDER BY creado_en DESC LIMIT 500'),
    q('SELECT id, nombre, apellido, email, acepta_privacidad, creado_en FROM personas ORDER BY creado_en DESC'),
    q(`SELECT id, matricula, nombre, apellido, dni, email, telefono, titulo, estado, fecha_alta,
        (SELECT COALESCE(sum(monto),0) FROM cuotas cu WHERE cu.matriculado_id = m.id AND NOT pagada) AS deuda
       FROM matriculados m ORDER BY apellido, nombre`),
    q(`SELECT cu.id, cu.periodo, cu.monto, cu.vencimiento, cu.pagada, cu.fecha_pago, cu.medio_pago, m.matricula, m.apellido, m.nombre
       FROM cuotas cu JOIN matriculados m ON m.id = cu.matriculado_id ORDER BY cu.pagada, cu.vencimiento DESC LIMIT 300`),
  ]);
  return c.json({
    novedades, documentos, autoridades, config, mensajes, personas, matriculados, cuotas,
    defs: { contenidos: CONTENIDOS, catNovedad: CATEGORIAS_NOVEDAD, catDoc: CATEGORIAS_DOC, organos: ORGANOS, titulos: TITULOS },
  });
});

// Subida de archivos (se guardan en la base de datos)
const TIPOS: Record<string, 'imagen' | 'documento'> = {
  'image/jpeg': 'imagen', 'image/png': 'imagen', 'image/webp': 'imagen',
  'application/pdf': 'documento',
  'application/msword': 'documento',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'documento',
  'application/vnd.oasis.opendocument.text': 'documento',
  'application/vnd.ms-excel': 'documento',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'documento',
};
api.post('/api/admin/archivos', async (c) => {
  const form = await c.req.parseBody();
  const f = form.archivo;
  if (!(f instanceof File) || !f.size) return falla(c, 'Elegí un archivo.');
  if (f.size > 8 * 1024 * 1024) return falla(c, 'El archivo supera los 8 MB.', 413);
  const clase = TIPOS[f.type];
  if (!clase) return falla(c, 'Formato no admitido. Usá JPG, PNG o WEBP para imágenes y PDF, Word o Excel para documentos.');
  if (form.clase === 'imagen' && clase !== 'imagen') return falla(c, 'Elegí una imagen JPG, PNG o WEBP.');
  const nombre = f.name.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120) || 'archivo';
  const [r] = await q('INSERT INTO archivos (nombre, tipo, tamano, datos) VALUES ($1,$2,$3,$4) RETURNING id',
    [nombre, f.type, f.size, Buffer.from(await f.arrayBuffer())]);
  return c.json({ id: r.id, nombre, url: `/archivos/${r.id}` }, 201);
});
const borrarArchivo = async (id: unknown) => { if (Number(id)) await q('DELETE FROM archivos WHERE id = $1', [Number(id)]); };

// Novedades
function datosNovedad(b: any): { error: string } | { v: unknown[] } {
  const titulo = txt(b.titulo, 200), contenido = txt(b.contenido, 20000);
  const imagen = Number(b.imagen_id) || null, alt = txt(b.imagen_alt, 200), enlace = txt(b.enlace, 500);
  if (!titulo || !contenido) return { error: 'El título y el contenido son obligatorios.' };
  if (imagen && !alt) return { error: 'Describí la imagen (texto alternativo) para que sea accesible.' };
  if (enlace && !urlValida(enlace)) return { error: 'El enlace debe comenzar con http:// o https://' };
  return { v: [
    titulo, b.categoria in CATEGORIAS_NOVEDAD ? b.categoria : 'noticia', txt(b.resumen, 400) || null, contenido,
    imagen, alt || null, fechaLocal(txt(b.fecha_evento, 30)), txt(b.lugar, 200) || null, bool(b.destacado), enlace || null,
    fechaLocal(txt(b.publicado_en, 30)),
  ] };
}
api.post('/api/admin/novedades', async (c) => {
  const d = datosNovedad(await leer(c));
  if ('error' in d) return falla(c, d.error);
  const [r] = await q(`INSERT INTO novedades (titulo, tipo, categoria, resumen, contenido, imagen_id, imagen_alt, fecha_evento, lugar, destacado, enlace, publicado_en)
    VALUES ($1, 'comunicado', $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10, COALESCE($11::timestamptz, now())) RETURNING id`, d.v);
  return c.json(r, 201);
});
api.put('/api/admin/novedades/:id', async (c) => {
  const d = datosNovedad(await leer(c));
  if ('error' in d) return falla(c, d.error);
  const [prev] = await q('SELECT imagen_id FROM novedades WHERE id = $1', [idParam(c)]);
  if (!prev) return falla(c, 'La novedad no existe.', 404);
  await q(`UPDATE novedades SET titulo = $1, categoria = $2, resumen = $3, contenido = $4, imagen_id = $5, imagen_alt = $6,
    fecha_evento = $7::timestamptz, lugar = $8, destacado = $9, enlace = $10, publicado_en = COALESCE($11::timestamptz, publicado_en)
    WHERE id = $12`, [...d.v, idParam(c)]);
  if (prev.imagen_id && prev.imagen_id !== d.v[4]) await borrarArchivo(prev.imagen_id);
  return c.json({ ok: true });
});

// Documentos (tabla normativas)
function datosDocumento(b: any): { error: string } | { v: unknown[] } {
  const titulo = txt(b.titulo, 250), url = txt(b.url, 500), archivo = Number(b.archivo_id) || null, fecha = txt(b.fecha, 10);
  if (!(b.categoria in CATEGORIAS_DOC)) return { error: 'Elegí una categoría.' };
  if (!titulo) return { error: 'El título es obligatorio.' };
  if (!archivo && !url) return { error: 'Subí el archivo o indicá el enlace oficial al documento.' };
  if (url && !urlValida(url)) return { error: 'El enlace debe comenzar con http:// o https://' };
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'La fecha no es válida.' };
  return { v: [b.categoria, titulo, txt(b.descripcion, 1000) || null, url || null, fecha || null, archivo, Number(b.orden) || 0] };
}
api.post('/api/admin/documentos', async (c) => {
  const d = datosDocumento(await leer(c));
  if ('error' in d) return falla(c, d.error);
  const [r] = await q('INSERT INTO normativas (categoria, titulo, descripcion, url, fecha, archivo_id, orden) VALUES ($1,$2,$3,$4,$5::date,$6,$7) RETURNING id', d.v);
  return c.json(r, 201);
});
api.put('/api/admin/documentos/:id', async (c) => {
  const d = datosDocumento(await leer(c));
  if ('error' in d) return falla(c, d.error);
  const [prev] = await q('SELECT archivo_id FROM normativas WHERE id = $1', [idParam(c)]);
  if (!prev) return falla(c, 'El documento no existe.', 404);
  await q('UPDATE normativas SET categoria = $1, titulo = $2, descripcion = $3, url = $4, fecha = $5::date, archivo_id = $6, orden = $7 WHERE id = $8', [...d.v, idParam(c)]);
  if (prev.archivo_id && prev.archivo_id !== d.v[5]) await borrarArchivo(prev.archivo_id);
  return c.json({ ok: true });
});

// Autoridades
function datosAutoridad(b: any): { error: string } | { v: unknown[] } {
  const cargo = txt(b.cargo, 120), nombre = txt(b.nombre, 160), organo = txt(b.organo, 120);
  if (!organo || !cargo || !nombre) return { error: 'Completá órgano, cargo y nombre.' };
  return { v: [organo, cargo, nombre, txt(b.mandato, 160) || null, Number(b.orden) || 0] };
}
api.post('/api/admin/autoridades', async (c) => {
  const d = datosAutoridad(await leer(c));
  if ('error' in d) return falla(c, d.error);
  const [r] = await q('INSERT INTO autoridades (organo, cargo, nombre, mandato, orden) VALUES ($1,$2,$3,$4,$5) RETURNING id', d.v);
  return c.json(r, 201);
});
api.put('/api/admin/autoridades/:id', async (c) => {
  const d = datosAutoridad(await leer(c));
  if ('error' in d) return falla(c, d.error);
  await q('UPDATE autoridades SET organo = $1, cargo = $2, nombre = $3, mandato = $4, orden = $5 WHERE id = $6', [...d.v, idParam(c)]);
  return c.json({ ok: true });
});

// Contenidos institucionales
api.put('/api/admin/config', async (c) => {
  const b = await leer(c);
  const actual = await leerConfig();
  for (const def of CONTENIDOS) {
    if (!(def.clave in b)) continue;
    const valor = txt(b[def.clave], def.tipo === 'texto' ? 20000 : 500);
    if (valor && def.tipo === 'email' && !EMAIL_RE.test(valor)) return falla(c, `${def.etiqueta}: el correo no es válido.`);
    if (valor && def.tipo === 'url' && !urlValida(valor)) return falla(c, `${def.etiqueta}: el enlace debe comenzar con https://`);
    if (valor && def.tipo === 'imagen' && !Number(valor)) return falla(c, `${def.etiqueta}: imagen inválida.`);
  }
  for (const def of CONTENIDOS) {
    if (!(def.clave in b)) continue;
    const valor = txt(b[def.clave], def.tipo === 'texto' ? 20000 : 500);
    if (def.tipo === 'imagen' && actual[def.clave] && actual[def.clave] !== valor) await borrarArchivo(actual[def.clave]);
    await q(`INSERT INTO config (clave, valor, actualizado_en) VALUES ($1, $2, now())
      ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()`, [def.clave, valor]);
  }
  return c.json({ ok: true });
});

// Mensajes de contacto
api.put('/api/admin/mensajes/:id', async (c) => {
  const b = await leer(c);
  await q('UPDATE mensajes SET leido = $1 WHERE id = $2', [bool(b.leido), idParam(c)]);
  return c.json({ ok: true });
});

// Suscriptores en CSV
api.get('/api/admin/personas.csv', async (c) => {
  const rows = await q('SELECT nombre, apellido, email, creado_en FROM personas ORDER BY creado_en DESC');
  const celda = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['Nombre;Apellido;Email;Fecha de suscripción', ...rows.map((r) => [r.nombre, r.apellido, r.email, new Date(r.creado_en).toLocaleString('es-AR')].map(celda).join(';'))].join('\r\n');
  return c.body(`﻿${csv}`, 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="suscriptores.csv"' });
});

// Matriculados
api.post('/api/admin/matriculados', async (c) => {
  const b = await leer(c);
  const f = {
    matricula: txt(b.matricula, 20), nombre: txt(b.nombre, 80), apellido: txt(b.apellido, 80), dni: txt(b.dni, 15).replace(/\D/g, ''),
    email: txt(b.email, 120).toLowerCase(), telefono: txt(b.telefono, 40), domicilio: txt(b.domicilio_profesional, 200),
    titulo: b.titulo in TITULOS ? b.titulo : null,
  };
  if (!f.matricula || !f.nombre || !f.apellido || !f.dni) return falla(c, 'Matrícula, nombre, apellido y DNI son obligatorios.');
  if (!EMAIL_RE.test(f.email)) return falla(c, 'El correo electrónico no es válido.');
  if (typeof b.password !== 'string' || b.password.length < 8) return falla(c, 'La contraseña inicial debe tener al menos 8 caracteres.');
  try {
    const [r] = await q(`INSERT INTO matriculados (matricula, nombre, apellido, dni, email, telefono, domicilio_profesional, titulo, localidad, password_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Río Grande',$9) RETURNING id`,
      [f.matricula, f.nombre, f.apellido, f.dni, f.email, f.telefono, f.domicilio, f.titulo, await Bun.password.hash(b.password)]);
    return c.json(r, 201);
  } catch (e) {
    if (esUnico(e)) return falla(c, 'Ya existe un matriculado con esa matrícula, DNI o correo.', 409);
    throw e;
  }
});
api.put('/api/admin/matriculados/:id/estado', async (c) => {
  const { estado } = await leer(c);
  if (!['activo', 'suspendido', 'baja'].includes(estado)) return falla(c, 'Estado inválido.');
  await q('UPDATE matriculados SET estado = $1 WHERE id = $2', [estado, idParam(c)]);
  return c.json({ ok: true });
});
api.put('/api/admin/matriculados/:id/titulo', async (c) => {
  const { titulo } = await leer(c);
  await q('UPDATE matriculados SET titulo = $1 WHERE id = $2', [titulo in TITULOS ? titulo : null, idParam(c)]);
  return c.json({ ok: true });
});
api.put('/api/admin/matriculados/:id/password', async (c) => {
  const { password } = await leer(c);
  if (typeof password !== 'string' || password.length < 8) return falla(c, 'La contraseña debe tener al menos 8 caracteres.');
  await q('UPDATE matriculados SET password_hash = $1 WHERE id = $2', [await Bun.password.hash(password), idParam(c)]);
  return c.json({ ok: true });
});

// Cuotas
api.post('/api/admin/cuotas/generar', async (c) => {
  const b = await leer(c);
  const periodo = txt(b.periodo, 7), monto = Number(b.monto), venc = txt(b.vencimiento, 10);
  if (!/^\d{4}-\d{2}$/.test(periodo) || !(monto > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(venc))
    return falla(c, 'Completá período (AAAA-MM), monto y vencimiento.');
  const r = await q(`INSERT INTO cuotas (matriculado_id, periodo, monto, vencimiento)
    SELECT id, $1, $2, $3::date FROM matriculados WHERE estado = 'activo'
    ON CONFLICT (matriculado_id, periodo) DO NOTHING RETURNING id`, [periodo, monto, venc]);
  return c.json({ generadas: r.length });
});
api.put('/api/admin/cuotas/:id/pagada', async (c) => {
  const b = await leer(c);
  await q('UPDATE cuotas SET pagada = true, fecha_pago = now(), medio_pago = $1 WHERE id = $2 AND NOT pagada',
    [txt(b.medio_pago, 40) || 'Registrado por administración', idParam(c)]);
  return c.json({ ok: true });
});

// Eliminaciones
const TABLAS: Record<string, { tabla: string; archivo?: string }> = {
  novedades: { tabla: 'novedades', archivo: 'imagen_id' },
  documentos: { tabla: 'normativas', archivo: 'archivo_id' },
  autoridades: { tabla: 'autoridades' },
  mensajes: { tabla: 'mensajes' },
  personas: { tabla: 'personas' },
  matriculados: { tabla: 'matriculados' },
};
for (const [ruta, { tabla, archivo }] of Object.entries(TABLAS)) {
  api.delete(`/api/admin/${ruta}/:id`, async (c) => {
    const [r] = await q(`DELETE FROM ${tabla} WHERE id = $1 RETURNING ${archivo ?? 'id'} AS archivo`, [idParam(c)]);
    if (archivo && r?.archivo) await borrarArchivo(r.archivo);
    return c.json({ ok: true });
  });
}

api.all('/api/*', (c) => falla(c, 'No encontrado', 404));
