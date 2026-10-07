let datos = {};
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
  $('#t-personas').innerHTML = datos.personas.length ? datos.personas.map((p) => `
    <tr><td>${fechaHora(p.creado_en)}</td><td>${esc(p.nombre)}</td><td>${esc(p.apellido)}</td>
    <td><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></td>
    <td><button class="btn chico claro" data-del="personas/${p.id}">Eliminar</button></td></tr>`).join('')
    : '<tr><td colspan="5" class="muted">Todavía no hay personas registradas.</td></tr>';

  $('#t-matriculados').innerHTML = datos.matriculados.length ? datos.matriculados.map((m) => `
    <tr><td><strong>${esc(m.matricula)}</strong></td><td>${esc(m.apellido)}, ${esc(m.nombre)}</td><td>${esc(m.dni)}</td>
    <td>${esc(m.email)}</td><td>${esc(m.localidad)}</td><td>${pesos(m.deuda)}</td>
    <td><select data-estado="${m.id}">${['activo', 'suspendido', 'baja'].map((s) => `<option value="${s}" ${s === m.estado ? 'selected' : ''}>${ETIQUETA_ESTADO[s][0]}</option>`).join('')}</select></td>
    <td><button class="btn chico claro" data-reset="${m.id}">Nueva contraseña</button></td></tr>`).join('')
    : '<tr><td colspan="8" class="muted">No hay matriculados cargados.</td></tr>';

  $('#t-cuotas').innerHTML = datos.cuotas.length ? datos.cuotas.map((c) => `
    <tr><td>${esc(c.matricula)}</td><td>${esc(c.apellido)}, ${esc(c.nombre)}</td><td>${esc(c.periodo)}</td>
    <td>${fecha(c.vencimiento)}</td><td>${pesos(c.monto)}</td>
    <td>${c.pagada ? `<span class="chip ok">Pagada</span> <span class="muted">${esc(c.medio_pago || '')}</span>` : '<span class="chip warn">Impaga</span>'}</td>
    <td>${c.pagada ? '' : `<button class="btn chico" data-pagada="${c.id}">Registrar pago</button>`}</td></tr>`).join('')
    : '<tr><td colspan="7" class="muted">No hay cuotas generadas.</td></tr>';

  $('#l-novedades').innerHTML = datos.novedades.map((n) => `
    <article class="card novedad"><span class="chip neutro">${esc(ETIQUETA_TIPO[n.tipo])}</span>
    <h3 style="margin-top:8px">${esc(n.titulo)}</h3><div class="fecha">${fechaHora(n.publicado_en)}</div>
    <p>${esc(n.contenido)}</p><button class="btn chico claro" data-del="novedades/${n.id}">Eliminar</button></article>`).join('');

  $('#l-normativas').innerHTML = inst.normativas.map((n) => `<li><span class="chip neutro">${esc(ETIQUETA_CAT[n.categoria])}</span> ${esc(n.titulo)}
    <button class="btn chico claro" data-del="normativas/${n.id}">Eliminar</button></li>`).join('');
  $('#l-autoridades').innerHTML = inst.autoridades.map((a) => `<li>${esc(a.cargo)}: <strong>${esc(a.nombre)}</strong>
    <button class="btn chico claro" data-del="autoridades/${a.id}">Eliminar</button></li>`).join('');
  $('#l-sedes').innerHTML = inst.sedes.map((s) => `<li><strong>${esc(s.ciudad)}</strong> — ${esc(s.direccion || '')}
    <button class="btn chico claro" data-editsede="${s.id}">Editar</button>
    <button class="btn chico claro" data-del="sedes/${s.id}">Eliminar</button></li>`).join('');
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
enviar('#f-cuotas', () => '/api/admin/cuotas/generar', (r) => `Se generaron ${r.generadas} cuotas.`);
enviar('#f-novedad', () => '/api/admin/novedades', 'Comunicado publicado.');
enviar('#f-normativas', () => '/api/admin/normativas', 'Normativa agregada.');
enviar('#f-autoridades', () => '/api/admin/autoridades', 'Autoridad agregada.');
enviar('#f-sedes', (f) => (f.id.value ? `/api/admin/sedes/${f.id.value}` : '/api/admin/sedes'), 'Sede guardada.');

document.addEventListener('click', async (e) => {
  const del = e.target.closest('[data-del]');
  const reset = e.target.closest('[data-reset]');
  const pagada = e.target.closest('[data-pagada]');
  const edit = e.target.closest('[data-editsede]');
  try {
    if (del) {
      if (!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
      await api(`/api/admin/${del.dataset.del}`, { method: 'DELETE' });
      ok('Registro eliminado.'); cargar();
    } else if (reset) {
      const pw = prompt('Nueva contraseña para el portal (mínimo 8 caracteres):');
      if (!pw) return;
      await api(`/api/admin/matriculados/${reset.dataset.reset}/password`, { method: 'PUT', body: { password: pw } });
      ok('Contraseña actualizada. Comunicala al matriculado.');
    } else if (pagada) {
      const medio = prompt('Medio de pago (ej.: Transferencia, Efectivo):', 'Transferencia');
      if (medio === null) return;
      await api(`/api/admin/cuotas/${pagada.dataset.pagada}/pagada`, { method: 'PUT', body: { medio_pago: medio } });
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
    await api(`/api/admin/matriculados/${s.dataset.estado}/estado`, { method: 'PUT', body: { estado: s.value } });
    ok('Estado actualizado.'); cargar();
  } catch (x) { err(x.message); }
});

cargar();
