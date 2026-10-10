function mostrar(vista) {
  $('#vista-login').hidden = vista !== 'login';
  $('#vista-panel').hidden = vista !== 'panel';
}

async function cargar() {
  let datos;
  try {
    datos = await api('/api/portal/yo');
  } catch {
    mostrar('login');
    return;
  }
  const { matriculado: m, cuotas, deuda, pagoOnline } = datos;
  mostrar('panel');
  $('#saludo').textContent = `Hola, ${m.nombre} ${m.apellido}`;
  $('#sub-saludo').textContent = `Matrícula N.º ${m.matricula}${m.titulo_txt ? ` · ${m.titulo_txt}` : ''} · Departamental Río Grande`;
  const [et, cls] = ETIQUETA_ESTADO[m.estado] || [m.estado, 'neutro'];
  $('#kpi-estado').innerHTML = `<span class="estado estado-${cls}">${esc(et)}</span>`;
  $('#kpi-deuda').textContent = pesos(deuda);
  $('#kpi-alta').textContent = fecha(m.fecha_alta);
  const activo = m.estado === 'activo';
  $('#btn-cert').hidden = !activo;
  $('#btn-cred').hidden = !activo;

  const hoy = new Date().toISOString().slice(0, 10);
  $('#cuotas').innerHTML = cuotas.length ? cuotas.map((c) => `
    <tr>
      <td>${esc(c.periodo)}</td>
      <td>${fecha(c.vencimiento)}</td>
      <td>${pesos(c.monto)}</td>
      <td>${c.pagada
        ? `<span class="estado estado-ok">Pagada</span> <span class="ayuda">${fecha(c.fecha_pago)}</span>`
        : String(c.vencimiento).slice(0, 10) < hoy ? '<span class="estado estado-err">Vencida</span>' : '<span class="estado estado-aviso">Pendiente</span>'}</td>
      <td>${!c.pagada && pagoOnline ? `<button type="button" class="btn btn-chico btn-dorado" data-pagar="${c.id}">Pagar<span class="sr"> cuota ${esc(c.periodo)}</span></button>` : ''}</td>
    </tr>`).join('') : '<tr><td colspan="5">No hay cuotas registradas.</td></tr>';
  $('#nota-pago').textContent = pagoOnline
    ? 'El pago se procesa a través de Mercado Pago y se acredita automáticamente.'
    : 'El pago online se habilitará próximamente. Mientras tanto, consultá los medios de pago con la Departamental; los pagos registrados se reflejan en este estado de cuenta.';

  const f = $('#form-datos');
  f.email.value = m.email || '';
  f.telefono.value = m.telefono || '';
  f.domicilio_profesional.value = m.domicilio_profesional || '';
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#login-msg');
  if (!validar(e.target, msg)) return;
  try {
    await api('/api/portal/login', { method: 'POST', body: formData(e.target) });
    e.target.reset();
    msg.hidden = true;
    await cargar();
    $('#saludo').focus?.();
  } catch (err) { aviso(msg, 'err', err.message); }
});

$('#salir').addEventListener('click', async () => {
  await api('/api/portal/logout', { method: 'POST' }).catch(() => {});
  mostrar('login');
  $('#usuario').focus();
});

$('#form-datos').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#datos-msg');
  if (!validar(e.target, msg)) return;
  try {
    await api('/api/portal/yo', { method: 'PUT', body: formData(e.target) });
    aviso(msg, 'ok', 'Datos actualizados correctamente.');
  } catch (err) { aviso(msg, 'err', err.message); }
});

$('#form-pass').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#pass-msg');
  if (!validar(e.target, msg)) return;
  try {
    await api('/api/portal/password', { method: 'PUT', body: formData(e.target) });
    e.target.reset();
    aviso(msg, 'ok', 'Contraseña actualizada.');
  } catch (err) { aviso(msg, 'err', err.message); }
});

$('#cuotas').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-pagar]');
  if (!b) return;
  b.disabled = true;
  try {
    const { url } = await api(`/api/portal/cuotas/${b.dataset.pagar}/pagar`, { method: 'POST' });
    location.href = url;
  } catch (err) {
    aviso($('#pago-msg'), 'err', err.message);
    b.disabled = false;
  }
});

const pago = new URLSearchParams(location.search).get('pago');
if (pago) {
  const m = { ok: ['ok', 'Pago recibido. Se acreditará en unos minutos.'], pendiente: ['pend', 'Tu pago está pendiente de acreditación.'], error: ['err', 'El pago no pudo completarse.'] }[pago];
  if (m) aviso($('#pago-msg'), m[0], m[1]);
}

cargar();
