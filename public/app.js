// ---------- Institucional ----------
let normativas = [];
let catActiva = 'ley';

function pintarNormativas() {
  const tabs = $('#tabs-norma');
  tabs.innerHTML = Object.entries(ETIQUETA_CAT)
    .map(([k, v]) => `<button type="button" data-cat="${k}" class="${k === catActiva ? 'activo' : ''}">${v}</button>`).join('');
  const items = normativas.filter((n) => n.categoria === catActiva);
  $('#normativas').innerHTML = items.length
    ? items.map((n) => `<li><strong>${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.titulo)}</a>` : esc(n.titulo)}</strong>
        ${n.descripcion ? `<div class="muted">${esc(n.descripcion)}</div>` : ''}</li>`).join('')
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
    ? `<table><tbody>${autoridades.map((a) => `<tr><td class="muted">${esc(a.cargo)}</td><td><strong>${esc(a.nombre)}</strong></td></tr>`).join('')}</tbody></table>`
    : 'La nómina de la Comisión Directiva se publicará próximamente.';
  $('#sedes').innerHTML = sedes.map((s) => `
    <div class="card">
      <h3>${esc(s.ciudad)}</h3>
      <p class="muted" style="margin:0">
        ${s.direccion ? `📍 ${esc(s.direccion)}<br>` : ''}
        ${s.horario ? `🕘 ${esc(s.horario)}<br>` : ''}
        ${s.telefono ? `📞 ${esc(s.telefono)}<br>` : ''}
        ${s.email ? `✉️ <a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : ''}
      </p>
    </div>`).join('');
}).catch(() => { $('#autoridades').textContent = 'No se pudo cargar la información.'; });

// ---------- Padrón ----------
let t;
async function buscarPadron() {
  const params = new URLSearchParams({ q: $('#q').value.trim(), localidad: $('#loc').value });
  const body = $('#padron-body');
  try {
    const rows = await api(`/api/padron?${params}`);
    body.innerHTML = rows.length ? rows.map((m) => {
      const [et, cls] = ETIQUETA_ESTADO[m.estado] || [m.estado, 'neutro'];
      return `<tr>
        <td><strong>${esc(m.matricula)}</strong></td>
        <td>${esc(m.apellido)}, ${esc(m.nombre)}</td>
        <td>${esc(m.localidad)}</td>
        <td><span class="chip ${cls}">${et}</span></td>
        <td>${m.habilitado ? '<span class="chip ok">Habilitado</span>' : '<span class="chip err">No habilitado</span>'}</td>
      </tr>`;
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
  $('#lista-novedades').innerHTML = rows.length ? rows.map((n) => `
    <article class="card novedad">
      <span class="chip neutro">${esc(ETIQUETA_TIPO[n.tipo] || n.tipo)}</span>
      <h3 style="margin-top:8px">${esc(n.titulo)}</h3>
      <div class="fecha">${fechaHora(n.publicado_en)}</div>
      <p>${esc(n.contenido)}</p>
    </article>`).join('') : '<p class="muted">No hay novedades publicadas.</p>';
});

// ---------- Registro ----------
$('#form-registro').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target, msg = $('#registro-msg'), btn = form.querySelector('button');
  btn.disabled = true;
  try {
    const p = await api('/api/personas', { method: 'POST', body: formData(form) });
    aviso(msg, 'ok', `¡Gracias, ${p.nombre}! Tu registro fue guardado correctamente.`);
    form.reset();
  } catch (err) {
    aviso(msg, 'err', err.message);
  } finally {
    btn.disabled = false;
  }
});
