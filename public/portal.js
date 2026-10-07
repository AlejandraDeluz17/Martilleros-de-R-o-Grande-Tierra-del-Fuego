function mostrar(vista) {
  $('#vista-login').classList.toggle('oculto', vista !== 'login');
  $('#vista-panel').classList.toggle('oculto', vista !== 'panel');
  $('#salir').classList.toggle('oculto', vista !== 'panel');
}

async function cargar() {
  try {
    const { matriculado: m, cuotas, deuda, pagoOnline } = await api('/api/portal/yo');
    mostrar('panel');
    $('#saludo').textContent = `Hola, ${m.nombre} ${m.apellido}`;
    $('#sub-saludo').textContent = `Matrícula N.º ${m.matricula} · ${m.localidad}`;
    const [et, cls] = ETIQUETA_ESTADO[m.estado] || [m.estado, 'neutro'];
    $('#kpi-estado').innerHTML = `<span class="chip ${cls}" style="font-size:18px">${et}</span>`;
    $('#kpi-deuda').textContent = pesos(deuda);
    $('#kpi-alta').textContent = fecha(m.fecha_alta);
    const activo = m.estado === 'activo';
    $('#btn-cert').classList.toggle('oculto', !activo);
    $('#btn-cred').classList.toggle('oculto', !activo);

    $('#cuotas').innerHTML = cuotas.length ? cuotas.map((c) => `
      <tr>
        <td>${esc(c.periodo)}</td>
        <td>${fecha(c.vencimiento)}</td>
        <td>${pesos(c.monto)}</td>
        <td>${c.pagada ? `<span class="chip ok">Pagada</span> <span class="muted">${fecha(c.fecha_pago)}</span>`
          : new Date(c.vencimiento) < new Date() ? '<span class="chip err">Vencida</span>' : '<span class="chip warn">Pendiente</span>'}</td>
        <td>${!c.pagada && pagoOnline ? `<button class="btn chico dorado" data-pagar="${c.id}">Pagar</button>` : ''}</td>
      </tr>`).join('') : '<tr><td colspan="5" class="muted">No hay cuotas registradas.</td></tr>';
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
    const { url } = await api(`/api/portal/cuotas/${b.dataset.pagar}/pagar`, { method: 'POST' });
    location.href = url;
  } catch (err) { aviso($('#pago-msg'), 'err', err.message); b.disabled = false; }
});

const pago = new URLSearchParams(location.search).get('pago');
if (pago) {
  const m = { ok: ['ok', 'Pago recibido. Se acreditará en unos minutos.'], pendiente: ['warn', 'Tu pago está pendiente de acreditación.'], error: ['err', 'El pago no pudo completarse.'] }[pago];
  if (m) aviso($('#pago-msg'), m[0], m[1]);
}

cargar();
