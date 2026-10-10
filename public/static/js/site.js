(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normalizar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* ----------------------------- Menú principal ----------------------------- */
  const btnMenu = $('.menu-btn');
  const nav = $('#menu-principal');
  const cerrarSubs = (excepto) => $$('.tiene-sub.abierto').forEach((li) => {
    if (li === excepto) return;
    li.classList.remove('abierto');
    $('.sub-toggle', li).setAttribute('aria-expanded', 'false');
  });

  btnMenu?.addEventListener('click', () => {
    const abrir = btnMenu.getAttribute('aria-expanded') !== 'true';
    btnMenu.setAttribute('aria-expanded', String(abrir));
    nav.classList.toggle('abierto', abrir);
    $('.menu-btn-txt', btnMenu).textContent = abrir ? 'Cerrar' : 'Menú';
  });

  $$('.sub-toggle').forEach((b) => b.addEventListener('click', () => {
    const li = b.closest('.tiene-sub');
    const abrir = !li.classList.contains('abierto');
    cerrarSubs(li);
    li.classList.toggle('abierto', abrir);
    b.setAttribute('aria-expanded', String(abrir));
  }));

  document.addEventListener('click', (e) => { if (!e.target.closest('.tiene-sub')) cerrarSubs(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const abierto = $('.tiene-sub.abierto');
    if (abierto) { cerrarSubs(); $('.sub-toggle', abierto).focus(); return; }
    if (nav?.classList.contains('abierto')) { btnMenu.click(); btnMenu.focus(); }
  });
  // Al saltar a un ancla del menú en el celular, cerrar el panel
  nav?.addEventListener('click', (e) => {
    if (e.target.closest('a') && nav.classList.contains('abierto') && btnMenu.getAttribute('aria-expanded') === 'true') btnMenu.click();
  });

  /* ------------------------------- Formularios ------------------------------- */
  function mensajeError(el) {
    const v = el.validity;
    if (v.valid) return '';
    if (v.valueMissing) return el.type === 'checkbox' ? 'Tenés que aceptar para continuar.' : el.tagName === 'SELECT' ? 'Elegí una opción.' : 'Este campo es obligatorio.';
    if (v.typeMismatch) return el.type === 'email' ? 'Ingresá un correo electrónico válido (por ejemplo, nombre@dominio.com).' : 'El formato no es válido.';
    if (v.tooShort) return `Ingresá al menos ${el.minLength} caracteres.`;
    if (v.patternMismatch) return el.dataset.patron || 'El formato no es válido.';
    return 'Revisá este campo.';
  }
  function marcar(el) {
    const msg = mensajeError(el);
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    const err = document.getElementById(`${el.id}-error`);
    if (err) { err.textContent = msg; err.hidden = !msg; }
    return msg;
  }
  function estado(el, tipo, msg) {
    el.className = `form-estado aviso aviso-${tipo}`;
    el.textContent = msg;
    el.hidden = false;
  }

  $$('form[data-api]').forEach((form) => {
    const campos = () => $$('input, select, textarea', form).filter((el) => !el.closest('.hp') && el.type !== 'hidden');
    campos().forEach((el) => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'blur', () => {
      if (el.getAttribute('aria-invalid') === 'true' || el.value) marcar(el);
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const salida = $('.form-estado', form);
      const invalidos = campos().filter((el) => marcar(el));
      if (invalidos.length) {
        estado(salida, 'err', 'Revisá los campos marcados.');
        invalidos[0].focus();
        return;
      }
      const datos = {};
      new FormData(form).forEach((v, k) => { datos[k] = typeof v === 'string' ? v.trim() : v; });
      $$('input[type=checkbox]', form).forEach((cb) => { datos[cb.name] = cb.checked; });
      const boton = $('button[type=submit]', form);
      boton.disabled = true;
      try {
        const r = await fetch(form.dataset.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'No pudimos procesar el envío. Intentá nuevamente.');
        form.reset();
        campos().forEach((el) => el.removeAttribute('aria-invalid'));
        estado(salida, 'ok', form.dataset.exito || 'Enviado correctamente.');
      } catch (err) {
        estado(salida, 'err', err.message);
      } finally {
        boton.disabled = false;
      }
    });
  });

  /* ---------------------------------- Padrón ---------------------------------- */
  const fp = $('#padron-form');
  if (fp) {
    const tbody = $('#padron-resultados');
    const info = $('#padron-info');
    const params = new URLSearchParams(location.search);
    ['q', 'titulo', 'estado'].forEach((k) => { if (params.get(k)) fp.elements[k].value = params.get(k); });
    let espera, pedido = 0;

    const fila = (m) => {
      const situacion = m.estado === 'suspendido'
        ? '<span class="estado estado-aviso">Matrícula suspendida</span>'
        : m.habilitado ? '<span class="estado estado-ok">Habilitado</span>' : '<span class="estado estado-err">No habilitado</span>';
      return `<tr><td><strong>${esc(m.matricula)}</strong></td><td>${esc(m.apellido)}, ${esc(m.nombre)}</td><td>${esc(m.titulo_txt || '—')}</td><td>${situacion}</td></tr>`;
    };

    async function buscar() {
      const p = new URLSearchParams();
      ['q', 'titulo', 'estado'].forEach((k) => { const v = fp.elements[k].value.trim(); if (v) p.set(k, v); });
      history.replaceState(null, '', `${location.pathname}${p.toString() ? `?${p}` : ''}#padron`);
      const actual = ++pedido;
      info.textContent = 'Buscando…';
      try {
        const r = await fetch(`/api/padron?${p}`);
        const rows = await r.json();
        if (!r.ok) throw new Error();
        if (actual !== pedido) return;
        tbody.innerHTML = rows.length
          ? rows.map(fila).join('')
          : '<tr><td colspan="4">No se encontraron profesionales con esos datos en el padrón de la Departamental. Si necesitás confirmar una matrícula, consultá directamente con la Departamental.</td></tr>';
        info.textContent = rows.length ? `${rows.length} resultado${rows.length === 1 ? '' : 's'}${rows.length >= 200 ? ' (se muestran los primeros 200; refiná la búsqueda)' : ''}.` : 'Sin resultados.';
      } catch {
        if (actual === pedido) info.textContent = 'No se pudo consultar el padrón. Intentá nuevamente en unos minutos.';
      }
    }
    fp.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(espera); buscar(); });
    fp.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(buscar, 300); });
    buscar();
  }

  /* ---------------------------- Normativa: filtros ---------------------------- */
  const docs = $('#docs');
  if (docs) {
    const chips = $$('.filtros-docs .chip');
    const buscador = $('#docs-q');
    const info = $('#docs-info');
    const vacio = $('#docs-vacio');
    let cat = '';
    const filtrar = () => {
      const t = normalizar(buscador.value.trim());
      let n = 0;
      $$('.doc', docs).forEach((li) => {
        const ver = (!cat || li.dataset.cat === cat) && (!t || li.dataset.texto.includes(t));
        li.hidden = !ver;
        if (ver) n++;
      });
      info.textContent = `${n} documento${n === 1 ? '' : 's'}`;
      vacio.hidden = n > 0;
    };
    chips.forEach((b) => b.addEventListener('click', () => {
      cat = b.dataset.cat;
      chips.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      filtrar();
    }));
    buscador.addEventListener('input', filtrar);
  }
})();
