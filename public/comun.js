// Utilidades compartidas
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
  el.className = `aviso ${tipo}`;
  el.textContent = msg;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

const ETIQUETA_ESTADO = { activo: ['Activo', 'ok'], suspendido: ['Suspendido', 'warn'], baja: ['Baja', 'err'] };
const ETIQUETA_TIPO = { comunicado: 'Comunicado', asamblea: 'Llamado a asamblea', legal: 'Novedad legal', circular: 'Circular' };
const ETIQUETA_CAT = { ley: 'Leyes', decreto: 'Decretos', etica: 'Código de ética', resolucion: 'Resoluciones vigentes' };
