// Utilidades compartidas por el portal y la administración
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : '—');
const fechaHora = (d) => (d ? new Date(d).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const pesos = (n) => Number(n).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

async function api(url, opts = {}) {
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(data.error || 'Ocurrió un error. Intentá nuevamente.');
    e.status = r.status;
    throw e;
  }
  return data;
}

function aviso(el, tipo, msg) {
  el.className = `form-estado aviso aviso-${tipo}`;
  el.textContent = msg;
  el.hidden = false;
}

function formData(form) {
  const datos = Object.fromEntries(new FormData(form).entries());
  $$('input[type=checkbox]', form).forEach((cb) => { datos[cb.name] = cb.checked; });
  for (const k of Object.keys(datos)) if (datos[k] instanceof File) delete datos[k];
  return datos;
}

// Valida con las reglas HTML del formulario y enfoca el primer campo inválido
function validar(form, salida) {
  const invalido = $$('input, select, textarea', form).find((el) => el.type !== 'hidden' && !el.checkValidity());
  if (!invalido) return true;
  aviso(salida, 'err', `Revisá el campo "${(form.querySelector(`label[for="${invalido.id}"]`)?.textContent || invalido.name).replace('*', '').trim()}": ${invalido.validationMessage}`);
  invalido.focus();
  return false;
}

const ETIQUETA_ESTADO = { activo: ['Activa', 'ok'], suspendido: ['Suspendida', 'aviso'], baja: ['Baja', 'err'] };
