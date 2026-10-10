let D = null; // datos del panel

const msg = () => $('#msg');
const ok = (m) => aviso(msg(), 'ok', m);
const error = (m) => aviso(msg(), 'err', m);
const opciones = (obj, sel = '', vacia = '') =>
  (vacia ? `<option value="">${esc(vacia)}</option>` : '') +
  Object.entries(obj).map(([k, t]) => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(t)}</option>`).join('');
const aLocal = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function mostrar(vista) {
  $('#vista-login').hidden = vista !== 'login';
  $('#vista-panel').hidden = vista !== 'panel';
}

/* --------------------------------- Pestañas --------------------------------- */
const tabs = () => $$('.panel-tabs [role=tab]');
function activar(tab, enfocar = false) {
  tabs().forEach((t) => {
    const sel = t === tab;
    t.setAttribute('aria-selected', String(sel));
    t.tabIndex = sel ? 0 : -1;
    $(`#${t.getAttribute('aria-controls')}`).hidden = !sel;
  });
  if (enfocar) tab.focus();
  try { sessionStorage.setItem('admin-tab', tab.id); } catch {}
}
$('.panel-tabs').addEventListener('click', (e) => { const t = e.target.closest('[role=tab]'); if (t) activar(t); });
$('.panel-tabs').addEventListener('keydown', (e) => {
  const lista = tabs(), i = lista.indexOf(document.activeElement);
  if (i < 0) return;
  const destino = { ArrowRight: lista[(i + 1) % lista.length], ArrowLeft: lista[(i - 1 + lista.length) % lista.length], Home: lista[0], End: lista[lista.length - 1] }[e.key];
  if (destino) { e.preventDefault(); activar(destino, true); }
});

/* ------------------------------ Subida de archivos ------------------------------ */
function vistaArchivo(cont, id, esImagen) {
  cont.innerHTML = id
    ? `${esImagen ? `<img src="/archivos/${id}" alt="">` : ''}<a href="/archivos/${id}" target="_blank" rel="noopener">Ver archivo actual</a><button type="button" class="btn btn-chico btn-peligro" data-quitar>Quitar</button>`
    : '';
}
document.addEventListener('change', async (e) => {
  const input = e.target.closest('input[type=file][data-subir]');
  if (!input || !input.files.length) return;
  const form = input.form, campo = form.elements[input.dataset.subir];
  const cont = $(`[data-actual="${input.dataset.subir}"]`, form);
  const fd = new FormData();
  fd.append('archivo', input.files[0]);
  fd.append('clase', input.dataset.clase || '');
  cont.textContent = 'Subiendo archivo…';
  try {
    const r = await fetch('/api/admin/archivos', { method: 'POST', body: fd, credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo subir el archivo.');
    campo.value = j.id;
    vistaArchivo(cont, j.id, input.dataset.clase === 'imagen');
  } catch (err) {
    cont.textContent = '';
    error(err.message);
  } finally {
    input.value = '';
  }
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-quitar]');
  if (!b) return;
  const cont = b.closest('[data-actual]');
  cont.closest('form').elements[cont.dataset.actual].value = '';
  cont.innerHTML = '';
});

/* ------------------------------ Formularios CRUD ------------------------------ */
function limpiar(form) {
  form.reset();
  $$('input[type=hidden]', form).forEach((h) => { h.value = ''; });
  $$('[data-actual]', form).forEach((d) => { d.innerHTML = ''; });
  const boton = $('button[type=submit]', form);
  boton.textContent = boton.dataset.texto;
  $('[data-cancelar]', form).hidden = true;
  $('.modo-edicion', form).textContent = '';
}
function editar(form, reg) {
  limpiar(form);
  for (const [k, v] of Object.entries(reg)) {
    const el = form.elements[k];
    if (!el || el.type === 'file' || el instanceof RadioNodeList) continue;
    if (el.type === 'checkbox') el.checked = Boolean(v);
    else if (el.type === 'datetime-local') el.value = aLocal(v);
    else if (el.type === 'date') el.value = v ? String(v).slice(0, 10) : '';
    else el.value = v ?? '';
  }
  $$('[data-actual]', form).forEach((d) => vistaArchivo(d, reg[d.dataset.actual], d.dataset.imagen === '1'));
  $('button[type=submit]', form).textContent = 'Guardar cambios';
  $('[data-cancelar]', form).hidden = false;
  $('.modo-edicion', form).textContent = `Editando: ${reg.titulo || reg.nombre || ''}`;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('input:not([type=hidden]), select, textarea', form).focus({ preventScroll: true });
}
function enlazarForm(form, recurso, textoOk) {
  const boton = $('button[type=submit]', form);
  boton.dataset.texto = boton.textContent;
  $('[data-cancelar]', form).addEventListener('click', () => limpiar(form));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validar(form, msg())) return;
    const datos = formData(form);
    const id = datos.id;
    delete datos.id;
    boton.disabled = true;
    try {
      await api(`/api/admin/${recurso}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: datos });
      limpiar(form);
      ok(id ? 'Cambios guardados.' : textoOk);
      await cargar();
    } catch (err) { error(err.message); } finally { boton.disabled = false; }
  });
}
const pieForm = (texto) => `<input type="hidden" name="id">
  <div class="acciones-fila"><button class="btn btn-primario" type="submit">${texto}</button><button type="button" class="btn btn-contorno" data-cancelar hidden>Cancelar edición</button></div>`;
const campoArchivo = (id, nombre, etiqueta, clase, ayuda) => `<div class="campo">
  <label for="${id}">${etiqueta}</label>
  <input type="file" id="${id}" data-subir="${nombre}" data-clase="${clase}" accept="${clase === 'imagen' ? 'image/jpeg,image/png,image/webp' : '.pdf,.doc,.docx,.odt,.xls,.xlsx'}" aria-describedby="${id}-ayuda">
  <p class="ayuda" id="${id}-ayuda">${ayuda}</p>
  <input type="hidden" name="${nombre}">
  <div class="archivo-actual" data-actual="${nombre}" data-imagen="${clase === 'imagen' ? 1 : 0}"></div>
</div>`;
const botonesItem = (recurso, id, extra = '') =>
  `<div class="acciones-fila">${extra}<button type="button" class="btn btn-chico btn-contorno" data-editar="${recurso}:${id}">Editar</button><button type="button" class="btn btn-chico btn-peligro" data-borrar="${recurso}:${id}">Eliminar</button></div>`;

/* --------------------------------- Paneles --------------------------------- */
const PANELES = {
  novedades: {
    form: () => `<form class="tarjeta tarjeta-cuerpo admin-form" id="f-novedades" novalidate>
      <h2>Publicar novedad</h2><p class="ayuda modo-edicion" aria-live="polite"></p>
      <div class="campo"><label for="nv-titulo">Título *</label><input id="nv-titulo" name="titulo" required maxlength="200"></div>
      <div class="fila-campos">
        <div class="campo"><label for="nv-categoria">Categoría *</label><select id="nv-categoria" name="categoria" required>${opciones(D.defs.catNovedad)}</select></div>
        <div class="campo"><label for="nv-publicado">Fecha de publicación</label><input id="nv-publicado" name="publicado_en" type="datetime-local" aria-describedby="nv-publicado-ayuda"><p class="ayuda" id="nv-publicado-ayuda">Vacío: se publica ahora. Una fecha futura programa la publicación.</p></div>
      </div>
      <div class="campo"><label for="nv-resumen">Resumen <span class="opcional">(se muestra en las tarjetas)</span></label><textarea id="nv-resumen" name="resumen" maxlength="400" style="min-height:80px"></textarea></div>
      <div class="campo"><label for="nv-contenido">Contenido *</label><textarea id="nv-contenido" name="contenido" required aria-describedby="nv-contenido-ayuda"></textarea><p class="ayuda" id="nv-contenido-ayuda">Separá los párrafos con una línea en blanco. Para listas, comenzá cada línea con "- ".</p></div>
      ${campoArchivo('nv-imagen', 'imagen_id', 'Imagen <span class="opcional">(opcional)</span>', 'imagen', 'JPG, PNG o WEBP de hasta 8 MB, horizontal.')}
      <div class="campo"><label for="nv-alt">Descripción de la imagen <span class="opcional">(obligatoria si hay imagen)</span></label><input id="nv-alt" name="imagen_alt" maxlength="200"></div>
      <div class="fila-campos">
        <div class="campo"><label for="nv-evento">Fecha del evento o curso</label><input id="nv-evento" name="fecha_evento" type="datetime-local"></div>
        <div class="campo"><label for="nv-lugar">Lugar</label><input id="nv-lugar" name="lugar" maxlength="200"></div>
      </div>
      <div class="campo"><label for="nv-enlace">Enlace a más información <span class="opcional">(https://…)</span></label><input id="nv-enlace" name="enlace" type="url" maxlength="500"></div>
      <div class="campo"><label class="check" for="nv-destacado"><input id="nv-destacado" name="destacado" type="checkbox"> <span>Mostrar como comunicado importante en la portada</span></label></div>
      ${pieForm('Publicar')}
    </form>`,
    lista: () => D.novedades.length ? `<ul class="admin-lista">${D.novedades.map((n) => `<li>
      <div><h3>${esc(n.titulo)}</h3><p>${esc(D.defs.catNovedad[n.categoria] || 'Noticia')} · ${fechaHora(n.publicado_en)}${new Date(n.publicado_en) > new Date() ? ' · <strong>Programada</strong>' : ''}${n.destacado ? ' · <strong>Destacada</strong>' : ''}</p></div>
      ${botonesItem('novedades', n.id, `<a class="btn btn-chico btn-contorno" href="/novedades/${n.id}" target="_blank" rel="noopener">Ver</a>`)}
    </li>`).join('')}</ul>` : '<p class="pendiente">Todavía no hay novedades.</p>',
    contador: () => D.novedades.length,
    recurso: 'novedades', ok: 'Novedad publicada.',
  },

  documentos: {
    form: () => `<form class="tarjeta tarjeta-cuerpo admin-form" id="f-documentos" novalidate>
      <h2>Agregar documento</h2><p class="ayuda modo-edicion" aria-live="polite"></p>
      <div class="fila-campos">
        <div class="campo"><label for="dc-categoria">Categoría *</label><select id="dc-categoria" name="categoria" required>${opciones(D.defs.catDoc)}</select></div>
        <div class="campo"><label for="dc-fecha">Fecha</label><input id="dc-fecha" name="fecha" type="date"></div>
      </div>
      <div class="campo"><label for="dc-titulo">Título *</label><input id="dc-titulo" name="titulo" required maxlength="250"></div>
      <div class="campo"><label for="dc-desc">Descripción</label><textarea id="dc-desc" name="descripcion" maxlength="1000" style="min-height:90px"></textarea></div>
      ${campoArchivo('dc-archivo', 'archivo_id', 'Archivo', 'documento', 'PDF, Word o Excel de hasta 8 MB. Si el documento está publicado en un sitio oficial, podés indicar el enlace en su lugar.')}
      <div class="campo"><label for="dc-url">Enlace oficial <span class="opcional">(si no subís archivo)</span></label><input id="dc-url" name="url" type="url" maxlength="500"></div>
      <div class="campo"><label for="dc-orden">Orden dentro de la categoría</label><input id="dc-orden" name="orden" type="number" value="0"></div>
      ${pieForm('Agregar documento')}
    </form>`,
    lista: () => D.documentos.length ? `<ul class="admin-lista">${D.documentos.map((d) => `<li>
      <div><h3>${esc(d.titulo)}</h3><p>${esc(D.defs.catDoc[d.categoria] || d.categoria)}${d.fecha ? ` · ${fecha(d.fecha)}` : ''} · ${d.archivo_id ? 'Archivo subido' : d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">Enlace externo</a>` : '<strong>Sin archivo ni enlace</strong>'}</p></div>
      ${botonesItem('documentos', d.id)}
    </li>`).join('')}</ul>` : '<p class="pendiente">Todavía no hay documentos.</p>',
    contador: () => D.documentos.length,
    recurso: 'documentos', ok: 'Documento agregado.',
  },

  autoridades: {
    form: () => `<form class="tarjeta tarjeta-cuerpo admin-form" id="f-autoridades" novalidate>
      <h2>Agregar autoridad</h2><p class="ayuda modo-edicion" aria-live="polite"></p>
      <div class="campo"><label for="au-organo">Órgano *</label><select id="au-organo" name="organo" required>${D.defs.organos.map((o) => `<option>${esc(o)}</option>`).join('')}</select></div>
      <div class="campo"><label for="au-cargo">Cargo *</label><input id="au-cargo" name="cargo" required maxlength="120" placeholder="Ej.: Presidente/a"></div>
      <div class="campo"><label for="au-nombre">Nombre y apellido *</label><input id="au-nombre" name="nombre" required maxlength="160"></div>
      <div class="campo"><label for="au-mandato">Mandato</label><input id="au-mandato" name="mandato" maxlength="160" placeholder="Ej.: 2025–2027"></div>
      <div class="campo"><label for="au-orden">Orden</label><input id="au-orden" name="orden" type="number" value="0"></div>
      ${pieForm('Agregar autoridad')}
      <p class="ayuda">Publicá solo autoridades confirmadas por acta vigente.</p>
    </form>`,
    lista: () => D.autoridades.length ? `<ul class="admin-lista">${D.autoridades.map((a) => `<li>
      <div><h3>${esc(a.nombre)}</h3><p>${esc(a.organo)} · ${esc(a.cargo)}${a.mandato ? ` · ${esc(a.mandato)}` : ''}</p></div>
      ${botonesItem('autoridades', a.id)}
    </li>`).join('')}</ul>` : '<p class="pendiente">No hay autoridades cargadas. El sitio muestra "pendiente de confirmación".</p>',
    contador: () => D.autoridades.length,
    recurso: 'autoridades', ok: 'Autoridad agregada.',
  },
};

function pintarCrud(id) {
  const p = PANELES[id], panel = $(`#panel-${id}`);
  if (!panel.dataset.listo) {
    panel.innerHTML = `<div class="admin-grid">${p.form()}<div><h2 class="h2" style="font-size:1.2rem">Publicados</h2><div data-lista></div></div></div>`;
    enlazarForm($('form', panel), p.recurso, p.ok);
    panel.dataset.listo = '1';
  }
  $('[data-lista]', panel).innerHTML = p.lista();
}

function pintarContenidos() {
  const panel = $('#panel-contenidos');
  if (panel.dataset.listo) return;
  const grupos = [...new Set(D.defs.contenidos.map((c) => c.grupo))];
  panel.innerHTML = `<form id="f-contenidos" novalidate>
    <p class="aviso aviso-info">Estos textos se muestran en el sitio. Si un campo queda vacío, el sitio indica "Información pendiente de confirmación". Separá los párrafos con una línea en blanco y comenzá cada ítem de lista con "- ".</p>
    ${grupos.map((g) => `<section class="grupo-contenidos tarjeta tarjeta-cuerpo"><h2>${esc(g)}</h2>${D.defs.contenidos.filter((c) => c.grupo === g).map((c) => {
      const id = `cf-${c.clave}`, v = D.config[c.clave] ?? '';
      const ayuda = c.ayuda ? `<p class="ayuda" id="${id}-ayuda">${esc(c.ayuda)}</p>` : '';
      if (c.tipo === 'imagen') return campoArchivo(id, c.clave, esc(c.etiqueta), 'imagen', esc(c.ayuda || 'JPG, PNG o WEBP de hasta 8 MB.'));
      const input = c.tipo === 'texto'
        ? `<textarea id="${id}" name="${c.clave}"${c.ayuda ? ` aria-describedby="${id}-ayuda"` : ''}>${esc(v)}</textarea>`
        : `<input id="${id}" name="${c.clave}" type="${c.tipo === 'email' ? 'email' : c.tipo === 'url' ? 'url' : 'text'}" value="${esc(v)}" maxlength="500"${c.ayuda ? ` aria-describedby="${id}-ayuda"` : ''}>`;
      return `<div class="campo"><label for="${id}">${esc(c.etiqueta)}</label>${input}${ayuda}</div>`;
    }).join('')}</section>`).join('')}
    <div class="barra-guardar"><button class="btn btn-primario" type="submit">Guardar contenidos</button><span class="ayuda">Los cambios se publican al guardar.</span></div>
  </form>`;
  const form = $('#f-contenidos');
  D.defs.contenidos.filter((c) => c.tipo === 'imagen').forEach((c) => {
    form.elements[c.clave].value = D.config[c.clave] ?? '';
    vistaArchivo($(`[data-actual="${c.clave}"]`, form), D.config[c.clave], true);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validar(form, msg())) return;
    try {
      await api('/api/admin/config', { method: 'PUT', body: formData(form) });
      ok('Contenidos guardados y publicados.');
      const r = await api('/api/admin/resumen');
      D.config = r.config;
    } catch (err) { error(err.message); }
  });
  panel.dataset.listo = '1';
}

function pintarMensajes() {
  $('#panel-mensajes').innerHTML = D.mensajes.length ? `<p class="ayuda">Consultas recibidas desde el formulario de contacto. Respondé por correo electrónico.</p>
    <ul class="admin-lista">${D.mensajes.map((m) => `<li class="${m.leido ? '' : 'no-leido'}">
      <div><h3>${m.leido ? '' : '<span class="sr">No leído: </span>'}${esc(m.asunto)} — ${esc(m.nombre)}</h3><p>${esc(m.email)}${m.telefono ? ` · ${esc(m.telefono)}` : ''} · ${fechaHora(m.creado_en)}</p></div>
      <div class="acciones-fila">
        <a class="btn btn-chico btn-primario" href="mailto:${esc(m.email)}?subject=${encodeURIComponent(`Re: ${m.asunto}`)}">Responder</a>
        <button type="button" class="btn btn-chico btn-contorno" data-leido="${m.id}:${m.leido ? 0 : 1}">${m.leido ? 'Marcar como no leído' : 'Marcar como leído'}</button>
        <button type="button" class="btn btn-chico btn-peligro" data-borrar="mensajes:${m.id}">Eliminar</button>
      </div>
      <p class="cuerpo-msj">${esc(m.mensaje)}</p>
    </li>`).join('')}</ul>` : '<p class="pendiente">No hay consultas recibidas.</p>';
}

function pintarSuscriptores() {
  $('#panel-suscriptores').innerHTML = `<div class="panel-cabeza"><p class="ayuda">Personas registradas para recibir novedades (nombre, apellido y correo).</p>
    ${D.personas.length ? '<a class="btn btn-contorno" href="/api/admin/personas.csv">Descargar listado (CSV)</a>' : ''}</div>
    <div class="tabla-envoltura"><table><thead><tr><th scope="col">Fecha</th><th scope="col">Nombre</th><th scope="col">Apellido</th><th scope="col">Correo</th><th scope="col"><span class="sr">Acciones</span></th></tr></thead><tbody>
    ${D.personas.length ? D.personas.map((p) => `<tr><td>${fechaHora(p.creado_en)}</td><td>${esc(p.nombre)}</td><td>${esc(p.apellido)}</td><td><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></td>
      <td><button type="button" class="btn btn-chico btn-peligro" data-borrar="personas:${p.id}">Eliminar<span class="sr"> a ${esc(p.nombre)} ${esc(p.apellido)}</span></button></td></tr>`).join('') : '<tr><td colspan="5">Todavía no hay suscriptores.</td></tr>'}
    </tbody></table></div>`;
}

function pintarMatriculados() {
  const panel = $('#panel-matriculados');
  if (!panel.dataset.listo) {
    panel.innerHTML = `<form class="tarjeta tarjeta-cuerpo admin-form" id="f-matriculados" novalidate>
      <h2>Alta de matriculado</h2>
      <div class="fila-campos">
        <div class="campo"><label for="mt-matricula">N.º de matrícula *</label><input id="mt-matricula" name="matricula" required maxlength="20"></div>
        <div class="campo"><label for="mt-nombre">Nombre *</label><input id="mt-nombre" name="nombre" required maxlength="80"></div>
        <div class="campo"><label for="mt-apellido">Apellido *</label><input id="mt-apellido" name="apellido" required maxlength="80"></div>
        <div class="campo"><label for="mt-dni">DNI *</label><input id="mt-dni" name="dni" required inputmode="numeric" maxlength="15"></div>
      </div>
      <div class="fila-campos">
        <div class="campo"><label for="mt-titulo">Título</label><select id="mt-titulo" name="titulo">${opciones(D.defs.titulos, '', 'Sin especificar')}</select></div>
        <div class="campo"><label for="mt-email">Correo *</label><input id="mt-email" name="email" type="email" required maxlength="120"></div>
        <div class="campo"><label for="mt-telefono">Teléfono</label><input id="mt-telefono" name="telefono" maxlength="40"></div>
        <div class="campo"><label for="mt-domicilio">Domicilio profesional</label><input id="mt-domicilio" name="domicilio_profesional" maxlength="200"></div>
      </div>
      <div class="campo"><label for="mt-password">Contraseña inicial del portal * <span class="opcional">(mínimo 8 caracteres)</span></label><input id="mt-password" name="password" minlength="8" required autocomplete="new-password"></div>
      <div class="acciones-fila"><button class="btn btn-primario" type="submit">Dar de alta</button></div>
      <p class="ayuda">Cargá solo matriculados del padrón oficial de la Departamental.</p>
    </form><div data-lista style="margin-top:24px"></div>`;
    const form = $('#f-matriculados');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validar(form, msg())) return;
      try {
        await api('/api/admin/matriculados', { method: 'POST', body: formData(form) });
        form.reset();
        ok('Matriculado dado de alta. Comunicale su contraseña inicial por un medio seguro.');
        await cargar();
      } catch (err) { error(err.message); }
    });
    panel.dataset.listo = '1';
  }
  $('[data-lista]', panel).innerHTML = `<div class="tabla-envoltura"><table><thead><tr><th scope="col">Matrícula</th><th scope="col">Apellido y nombre</th><th scope="col">DNI</th><th scope="col">Correo</th><th scope="col">Título</th><th scope="col">Deuda</th><th scope="col">Estado</th><th scope="col"><span class="sr">Acciones</span></th></tr></thead><tbody>
    ${D.matriculados.length ? D.matriculados.map((m) => `<tr>
      <td><strong>${esc(m.matricula)}</strong></td><td>${esc(m.apellido)}, ${esc(m.nombre)}</td><td>${esc(m.dni)}</td><td>${esc(m.email)}</td>
      <td><label class="sr" for="tit-${m.id}">Título de ${esc(m.apellido)}</label><select id="tit-${m.id}" data-titulo="${m.id}">${opciones(D.defs.titulos, m.titulo || '', 'Sin especificar')}</select></td>
      <td>${pesos(m.deuda)}</td>
      <td><label class="sr" for="est-${m.id}">Estado de ${esc(m.apellido)}</label><select id="est-${m.id}" data-estado="${m.id}">${opciones({ activo: 'Activa', suspendido: 'Suspendida', baja: 'Baja' }, m.estado)}</select></td>
      <td><div class="acciones-fila"><button type="button" class="btn btn-chico btn-contorno" data-reset="${m.id}">Nueva contraseña</button><button type="button" class="btn btn-chico btn-peligro" data-borrar="matriculados:${m.id}">Eliminar</button></div></td>
    </tr>`).join('') : '<tr><td colspan="8">No hay matriculados cargados.</td></tr>'}
  </tbody></table></div>`;
}

function pintarCuotas() {
  const panel = $('#panel-cuotas');
  if (!panel.dataset.listo) {
    panel.innerHTML = `<form class="tarjeta tarjeta-cuerpo admin-form" id="f-cuotas" novalidate>
      <h2>Generar cuota para todos los matriculados activos</h2>
      <div class="fila-campos">
        <div class="campo"><label for="cu-periodo">Período *</label><input id="cu-periodo" name="periodo" type="month" required></div>
        <div class="campo"><label for="cu-monto">Monto ($) *</label><input id="cu-monto" name="monto" type="number" min="1" step="0.01" required></div>
        <div class="campo"><label for="cu-venc">Vencimiento *</label><input id="cu-venc" name="vencimiento" type="date" required></div>
      </div>
      <button class="btn btn-primario" type="submit">Generar cuotas</button>
    </form><div data-lista style="margin-top:24px"></div>`;
    const form = $('#f-cuotas');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validar(form, msg())) return;
      try {
        const r = await api('/api/admin/cuotas/generar', { method: 'POST', body: formData(form) });
        form.reset();
        ok(`Se generaron ${r.generadas} cuotas.`);
        await cargar();
      } catch (err) { error(err.message); }
    });
    panel.dataset.listo = '1';
  }
  $('[data-lista]', panel).innerHTML = `<div class="tabla-envoltura"><table><thead><tr><th scope="col">Matrícula</th><th scope="col">Matriculado</th><th scope="col">Período</th><th scope="col">Vencimiento</th><th scope="col">Monto</th><th scope="col">Estado</th><th scope="col"><span class="sr">Acciones</span></th></tr></thead><tbody>
    ${D.cuotas.length ? D.cuotas.map((c) => `<tr><td>${esc(c.matricula)}</td><td>${esc(c.apellido)}, ${esc(c.nombre)}</td><td>${esc(c.periodo)}</td><td>${fecha(c.vencimiento)}</td><td>${pesos(c.monto)}</td>
      <td>${c.pagada ? `<span class="estado estado-ok">Pagada</span> <span class="ayuda">${esc(c.medio_pago || '')}</span>` : '<span class="estado estado-aviso">Impaga</span>'}</td>
      <td>${c.pagada ? '' : `<button type="button" class="btn btn-chico btn-primario" data-pagada="${c.id}">Registrar pago</button>`}</td></tr>`).join('') : '<tr><td colspan="7">No hay cuotas generadas.</td></tr>'}
  </tbody></table></div>`;
}

function contadores() {
  const n = {
    novedades: D.novedades.length, documentos: D.documentos.length, autoridades: D.autoridades.length,
    mensajes: D.mensajes.filter((m) => !m.leido).length, suscriptores: D.personas.length, matriculados: D.matriculados.length,
    cuotas: D.cuotas.filter((c) => !c.pagada).length,
  };
  $$('[data-contador]').forEach((s) => {
    const v = n[s.dataset.contador];
    s.textContent = v ? String(v) : '';
    s.setAttribute('aria-label', v ? `${v}${s.dataset.contador === 'mensajes' ? ' sin leer' : s.dataset.contador === 'cuotas' ? ' impagas' : ''}` : '');
  });
}

async function cargar() {
  try {
    D = await api('/api/admin/resumen');
  } catch (e) {
    if (e.status === 401) { mostrar('login'); return; }
    error(e.message);
    return;
  }
  mostrar('panel');
  ['novedades', 'documentos', 'autoridades'].forEach(pintarCrud);
  pintarContenidos();
  pintarMensajes();
  pintarSuscriptores();
  pintarMatriculados();
  pintarCuotas();
  contadores();
}

/* ------------------------------ Acciones de listas ------------------------------ */
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-editar], [data-borrar], [data-leido], [data-reset], [data-pagada]');
  if (!b) return;
  try {
    if (b.dataset.editar) {
      const [recurso, id] = b.dataset.editar.split(':');
      const reg = D[recurso].find((x) => String(x.id) === id);
      editar($(`#f-${recurso}`), reg);
    } else if (b.dataset.borrar) {
      if (!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
      await api(`/api/admin/${b.dataset.borrar.replace(':', '/')}`, { method: 'DELETE' });
      ok('Registro eliminado.');
      await cargar();
    } else if (b.dataset.leido) {
      const [id, leido] = b.dataset.leido.split(':');
      await api(`/api/admin/mensajes/${id}`, { method: 'PUT', body: { leido: leido === '1' } });
      await cargar();
    } else if (b.dataset.reset) {
      const pw = prompt('Nueva contraseña para el portal (mínimo 8 caracteres):');
      if (!pw) return;
      await api(`/api/admin/matriculados/${b.dataset.reset}/password`, { method: 'PUT', body: { password: pw } });
      ok('Contraseña actualizada. Comunicala al matriculado por un medio seguro.');
    } else if (b.dataset.pagada) {
      const medio = prompt('Medio de pago (ej.: Transferencia, Efectivo):', 'Transferencia');
      if (medio === null) return;
      await api(`/api/admin/cuotas/${b.dataset.pagada}/pagada`, { method: 'PUT', body: { medio_pago: medio } });
      ok('Pago registrado.');
      await cargar();
    }
  } catch (err) { error(err.message); }
});

document.addEventListener('change', async (e) => {
  const s = e.target.closest('[data-estado], [data-titulo]');
  if (!s) return;
  try {
    if (s.dataset.estado) await api(`/api/admin/matriculados/${s.dataset.estado}/estado`, { method: 'PUT', body: { estado: s.value } });
    else await api(`/api/admin/matriculados/${s.dataset.titulo}/titulo`, { method: 'PUT', body: { titulo: s.value } });
    ok('Matriculado actualizado.');
    await cargar();
  } catch (err) { error(err.message); }
});

/* --------------------------------- Sesión --------------------------------- */
$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const salida = $('#login-msg');
  if (!validar(e.target, salida)) return;
  try {
    await api('/api/admin/login', { method: 'POST', body: formData(e.target) });
    e.target.reset();
    salida.hidden = true;
    await cargar();
  } catch (err) { aviso(salida, 'err', err.message); }
});
$('#salir').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  location.reload();
});

try {
  const guardada = sessionStorage.getItem('admin-tab');
  if (guardada && $(`#${guardada}`)) activar($(`#${guardada}`));
} catch {}
cargar();
