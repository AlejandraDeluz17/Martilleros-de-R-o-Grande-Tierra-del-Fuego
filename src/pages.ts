import { Hono } from 'hono';
import { q, leerConfig, CATEGORIAS_DOC, CATEGORIAS_NOVEDAD, TITULOS, ORGANOS, ASUNTOS } from './db';
import {
  ENV, esc, baseUrl, fecha, fechaDia, fechaHora, iso, urlNovedad, slug, formatear, dominio, normalizar, urlValida,
  NOMBRE, DEPARTAMENTAL, SITIO_PROVINCIAL, DENUNCIAS_OFICIAL, COFECI_URL, LEY_762_URL, LEY_20266_URL, CCYCN_URL,
} from './util';
import { pagina, type Pagina } from './layout';
import {
  icono, pendiente, contenido, enlaceExterno, encabezado, tituloSeccion, tarjetaNovedad, categoriaNovedad,
  resumenNovedad, estado, ilustracionPortada,
} from './ui';

export const sitio = new Hono();

type Datos = Omit<Pagina, 'cfg' | 'base'>;
async function contexto(c: any) {
  return { cfg: await leerConfig(), base: baseUrl(c) };
}
const responder = (c: any, cfg: Record<string, string>, d: Datos, status = 200) =>
  c.html(pagina({ ...d, cfg, base: baseUrl(c) }), status);

const NOV = 'id, titulo, categoria, resumen, contenido, imagen_id, imagen_alt, fecha_evento, lugar, destacado, enlace, publicado_en';
const PRESENTACION = `La ${DEPARTAMENTAL} del Colegio de Martilleros y Corredores Públicos de Tierra del Fuego acompaña a los profesionales matriculados de la ciudad y brinda a la comunidad información para operar con profesionales habilitados.`;
const AVISO_PADRON = `El padrón de la ${DEPARTAMENTAL} se encuentra en proceso de actualización. Si no encontrás a un profesional, consultá directamente con la Departamental.`;

/* --------------------------------- Bloques --------------------------------- */

const profesion = (nivel = 3) => `<div class="grilla grilla-2 comparativa">
  <div class="tarjeta">
    <p class="etiqueta">Martillero público</p>
    <h${nivel}>Remates y subastas</h${nivel}>
    <ul>
      <li>Realiza ventas en remate público de bienes muebles e inmuebles.</li>
      <li>Actúa en subastas judiciales y particulares.</li>
      <li>Tasa los bienes que va a rematar.</li>
    </ul>
  </div>
  <div class="tarjeta">
    <p class="etiqueta">Corredor público inmobiliario</p>
    <h${nivel}>Compraventa y alquiler</h${nivel}>
    <ul>
      <li>Intermedia en compraventas, alquileres y otras operaciones sobre inmuebles.</li>
      <li>Administra propiedades y tasa inmuebles.</li>
    </ul>
  </div>
</div>
<p class="nota-legal">${icono('info', 16)} Ambas matrículas exigen título universitario habilitante (Ley Nacional 20.266, modificada por la Ley 25.028, y Ley Provincial 762). Son profesiones distintas: quien posee solo matrícula de martillero no puede ejercer el corretaje inmobiliario.</p>`;

function suscripcion(id = 'suscripcion') {
  return `<form class="form-suscripcion" data-api="/api/personas" data-exito="¡Listo! Te sumamos a la lista de novedades de la Departamental." novalidate aria-labelledby="${id}-titulo">
  <h2 id="${id}-titulo">Recibí las novedades de la Departamental</h2>
  <p>Comunicados, capacitaciones y actividades, directamente en tu correo.</p>
  <div class="fila-campos">
    <div class="campo"><label for="${id}-nombre">Nombre</label><input id="${id}-nombre" name="nombre" required maxlength="80" autocomplete="given-name" aria-describedby="${id}-nombre-error"><p class="error-campo" id="${id}-nombre-error" hidden></p></div>
    <div class="campo"><label for="${id}-apellido">Apellido</label><input id="${id}-apellido" name="apellido" required maxlength="80" autocomplete="family-name" aria-describedby="${id}-apellido-error"><p class="error-campo" id="${id}-apellido-error" hidden></p></div>
    <div class="campo"><label for="${id}-email">Correo electrónico</label><input id="${id}-email" name="email" type="email" required maxlength="120" autocomplete="email" aria-describedby="${id}-email-error"><p class="error-campo" id="${id}-email-error" hidden></p></div>
  </div>
  <div class="hp" aria-hidden="true"><label for="${id}-sitio">No completar</label><input id="${id}-sitio" name="sitio" tabindex="-1" autocomplete="off"></div>
  <div class="campo">
    <label class="check" for="${id}-acepta"><input id="${id}-acepta" name="acepta" type="checkbox" required aria-describedby="${id}-acepta-error"> <span>Acepto que la Departamental use estos datos solo para enviarme novedades, según la <a href="/privacidad">política de privacidad</a>.</span></label>
    <p class="error-campo" id="${id}-acepta-error" hidden></p>
  </div>
  <button class="btn btn-primario" type="submit">Suscribirme</button>
  <div class="form-estado" role="status" aria-live="polite" hidden></div>
</form>`;
}

/* ---------------------------------- Inicio ---------------------------------- */

sitio.get('/', async (c) => {
  const { cfg, base } = await contexto(c);
  const [recientes, destacados] = await Promise.all([
    q(`SELECT ${NOV} FROM novedades WHERE publicado_en <= now() ORDER BY publicado_en DESC LIMIT 3`),
    q(`SELECT ${NOV} FROM novedades WHERE destacado AND publicado_en <= now() ORDER BY publicado_en DESC LIMIT 3`),
  ]);

  const portada = cfg.portada_id
    ? `<img src="/archivos/${esc(cfg.portada_id)}" alt="${esc(cfg.portada_alt || '')}" width="1600" height="900" fetchpriority="high"><span class="hero-velo" aria-hidden="true"></span>`
    : ilustracionPortada;

  const accesos = [
    ['documento', 'Trámites y matrícula', 'Requisitos para matricularse y trámites ante la Departamental.', '/matriculados#tramites'],
    ['balanza', 'Normativa', 'Leyes, resoluciones, reglamentos, formularios y modelos de notas.', '/normativa'],
    ['capacitacion', 'Capacitaciones', 'Cursos, jornadas y actividades de formación profesional.', '/novedades?categoria=capacitaciones'],
    ['correo', 'Contacto', 'Canales de atención de la Departamental Río Grande.', '/contacto'],
  ].map(([ic, t, d, h]) => `<li><a class="tarjeta acceso" href="${h}">
      <span class="ico-caja">${icono(ic, 24)}</span>
      <span class="acceso-titulo">${t}</span>
      <span class="acceso-texto">${d}</span>
      <span class="mas">Ingresar ${icono('flecha', 16)}</span>
    </a></li>`).join('');

  const comunicados = destacados.length ? `<section class="seccion seccion-gris" aria-labelledby="comunicados-titulo">
  <div class="contenedor">
    ${tituloSeccion('Comunicados importantes', 'Información institucional vigente para matriculados y para la comunidad.', 'comunicados-titulo')}
    <ul class="comunicados">${destacados.map((n) => `<li class="comunicado">
      <span class="ico-caja">${icono('megafono', 22)}</span>
      <div><p class="meta"><span class="etiqueta">${esc(categoriaNovedad(n.categoria))}</span><time datetime="${iso(n.publicado_en)}">${fecha(n.publicado_en)}</time></p>
      <h3><a href="${urlNovedad(n)}">${esc(n.titulo)}</a></h3><p>${esc(resumenNovedad(n, 220))}</p></div>
    </li>`).join('')}</ul>
  </div>
</section>` : '';

  const cuerpo = `
<section class="hero" aria-labelledby="hero-titulo">
  <div class="hero-fondo">${portada}</div>
  <div class="contenedor hero-grid">
    <div class="hero-texto">
      <p class="eyebrow">${DEPARTAMENTAL} · Tierra del Fuego</p>
      <h1 id="hero-titulo">Profesionalismo, transparencia y compromiso con nuestra comunidad</h1>
      <p class="hero-lead">${esc(cfg.inicio_presentacion?.trim() || PRESENTACION)}</p>
      <div class="hero-botones">
        <a class="btn btn-dorado btn-grande" href="/matriculados#padron">${icono('buscar', 20)} Consultar matrícula</a>
        <a class="btn btn-contorno-claro btn-grande" href="/institucional">Conocer el Colegio</a>
      </div>
    </div>
    <form class="hero-busqueda" action="/matriculados#padron" method="get" role="search" aria-labelledby="busq-titulo">
      <h2 id="busq-titulo">¿Está matriculado?</h2>
      <p>Antes de firmar o entregar dinero, verificá que el profesional tenga matrícula vigente.</p>
      <label for="hero-q">Nombre, apellido o N.º de matrícula</label>
      <div class="campo-boton">
        <input id="hero-q" name="q" type="search" required minlength="2" autocomplete="off">
        <button class="btn btn-primario" type="submit">Buscar</button>
      </div>
      <p class="nota">${icono('info', 15)} Fuente: padrón de la ${DEPARTAMENTAL}.</p>
    </form>
  </div>
  ${cfg.portada_id && cfg.portada_credito ? `<p class="hero-credito">Foto: ${esc(cfg.portada_credito)}</p>` : ''}
</section>

<section class="seccion" aria-labelledby="accesos-titulo">
  <div class="contenedor">
    <h2 id="accesos-titulo" class="sr">Accesos rápidos</h2>
    <ul class="grilla grilla-4 accesos">${accesos}</ul>
  </div>
</section>

${comunicados}

<section class="seccion seccion-alt" aria-labelledby="novedades-titulo">
  <div class="contenedor">
    <div class="cabeza-fila">
      ${tituloSeccion('Novedades recientes', 'Noticias, capacitaciones y actividades de la Departamental.', 'novedades-titulo')}
      <a class="btn btn-contorno" href="/novedades">Ver todas las novedades ${icono('flecha', 16)}</a>
    </div>
    ${recientes.length ? `<div class="grilla grilla-3">${recientes.map((n) => tarjetaNovedad(n)).join('')}</div>` : pendiente('Todavía no hay novedades publicadas.')}
  </div>
</section>

<section class="seccion" aria-labelledby="profesion-titulo">
  <div class="contenedor">
    ${tituloSeccion('Operá solo con profesionales matriculados', 'Martillero y corredor no son lo mismo. Conocé qué hace cada uno antes de contratar.', 'profesion-titulo')}
    ${profesion()}
    <p class="acciones-centro"><a class="btn btn-primario" href="/matriculados#padron">Verificar una matrícula</a> <a class="btn btn-contorno" href="/denuncias">Cómo hacer una denuncia</a></p>
  </div>
</section>

<section class="seccion seccion-azul" aria-labelledby="servicios-titulo">
  <div class="contenedor banda-servicios">
    <div>
      <p class="eyebrow">Para matriculados</p>
      <h2 id="servicios-titulo">Servicios al matriculado</h2>
      <p>Consultá tu estado de cuenta, actualizá tus datos de contacto y descargá tu credencial desde el Portal de Autogestión. Conocé también los beneficios, convenios y recursos profesionales de la Departamental.</p>
    </div>
    <div class="banda-botones">
      <a class="btn btn-dorado btn-grande" href="/portal">${icono('candado', 18)} Portal de autogestión</a>
      <a class="btn btn-contorno-claro btn-grande" href="/servicios">Ver servicios</a>
    </div>
  </div>
</section>

<section class="seccion seccion-alt">
  <div class="contenedor contenedor-angosto">${suscripcion('suscripcion-inicio')}</div>
</section>`;

  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Organization',
    name: `${NOMBRE} — ${DEPARTAMENTAL}`, url: base,
    ...(cfg.logo_id ? { logo: `${base}/archivos/${cfg.logo_id}` } : {}),
    ...(cfg.contacto_email ? { email: cfg.contacto_email } : {}),
    ...(cfg.contacto_telefono ? { telephone: cfg.contacto_telefono } : {}),
    address: { '@type': 'PostalAddress', addressLocality: 'Río Grande', addressRegion: 'Tierra del Fuego', addressCountry: 'AR', ...(cfg.contacto_direccion ? { streetAddress: cfg.contacto_direccion } : {}) },
    parentOrganization: { '@type': 'Organization', name: 'Colegio de Martilleros y Corredores de Tierra del Fuego', url: SITIO_PROVINCIAL },
  };
  return responder(c, cfg, { titulo: 'Inicio', ruta: '/', seccion: 'inicio', cuerpo, jsonld });
});

/* ------------------------------- Institucional ------------------------------- */

sitio.get('/institucional', async (c) => {
  const { cfg } = await contexto(c);
  const autoridades = await q('SELECT * FROM autoridades ORDER BY orden, id');
  const organos = [...ORGANOS, ...new Set(autoridades.map((a) => a.organo).filter((o) => !ORGANOS.includes(o)))];
  const listaAutoridades = autoridades.length
    ? organos.filter((o) => autoridades.some((a) => a.organo === o)).map((o) => {
      const items = autoridades.filter((a) => a.organo === o);
      const mandatos = [...new Set(items.map((a) => a.mandato).filter(Boolean))];
      return `<div class="organo"><h3>${esc(o)}</h3>${mandatos.length ? `<p class="meta">Mandato: ${esc(mandatos.join(' · '))}</p>` : ''}
        <dl class="autoridades">${items.map((a) => `<div><dt>${esc(a.cargo)}</dt><dd>${esc(a.nombre)}</dd></div>`).join('')}</dl></div>`;
    }).join('')
    : pendiente('La nómina de autoridades vigentes de la Departamental Río Grande se publicará una vez confirmada.');

  const funciones = cfg.funciones?.trim()
    ? contenido(cfg.funciones)
    : `<div class="prosa"><ul>
        <li>Controlar la matrícula de martilleros y corredores públicos en la provincia.</li>
        <li>Controlar el ejercicio profesional de sus matriculados.</li>
        <li>Recibir denuncias y darles curso a través del Tribunal de Disciplina y la Comisión Fiscalizadora.</li>
      </ul><p class="fuente">Fuente: ${enlaceExterno(LEY_762_URL, 'Ley Provincial 762')} y ${enlaceExterno(SITIO_PROVINCIAL, 'sitio oficial del Colegio')}.</p></div>`;

  const secciones: [string, string, string][] = [
    ['historia', 'Historia', `<div class="aviso aviso-info">${icono('info', 20)}<p>El Colegio de Martilleros y Corredores Públicos de Tierra del Fuego fue creado por la ${enlaceExterno(LEY_762_URL, 'Ley Provincial 762')} (2007), que regula el ejercicio profesional de martilleros y corredores en la provincia.</p></div>${contenido(cfg.historia, 'La historia de la Departamental Río Grande está pendiente de carga.')}`],
    ['mision', 'Misión y objetivos', `<h3>Misión</h3>${contenido(cfg.mision)}<h3>Objetivos</h3>${contenido(cfg.objetivos)}`],
    ['funciones', 'Funciones', funciones],
    ['autoridades', 'Autoridades', listaAutoridades],
    ['comisiones', 'Comisiones', contenido(cfg.comisiones)],
    ['departamental', 'La Departamental Río Grande', `${contenido(cfg.departamental_datos)}<p><a class="btn btn-contorno" href="/contacto">Datos de contacto ${icono('flecha', 16)}</a></p>`],
  ];

  const cuerpo = `${encabezado('Institucional', `Conocé al Colegio y a la ${DEPARTAMENTAL}: su historia, sus funciones y quiénes lo integran.`, [['Institucional']])}
<div class="contenedor seccion con-indice">
  <nav class="indice" aria-label="En esta página"><h2>En esta página</h2><ul>${secciones.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ul></nav>
  <div>${secciones.map(([id, t, html]) => `<section class="bloque" aria-labelledby="${id}"><h2 id="${id}">${t}</h2>${html}</section>`).join('')}</div>
</div>`;
  return responder(c, cfg, { titulo: 'Institucional', descripcion: `Historia, misión, funciones, autoridades y comisiones de la ${DEPARTAMENTAL} del Colegio de Martilleros y Corredores Públicos de Tierra del Fuego.`, ruta: '/institucional', seccion: 'institucional', cuerpo });
});

/* -------------------------------- Matriculados -------------------------------- */

sitio.get('/matriculados', async (c) => {
  const { cfg } = await contexto(c);
  const [{ n }] = await q(`SELECT count(*)::int AS n FROM matriculados WHERE estado <> 'baja'`);
  const cuerpo = `${encabezado('Matriculados', 'Padrón de profesionales, requisitos de matriculación y trámites ante la Departamental.', [['Matriculados']])}
<div class="contenedor seccion con-indice">
  <nav class="indice" aria-label="En esta página"><h2>En esta página</h2><ul>
    <li><a href="#padron">Padrón de matriculados</a></li><li><a href="#profesion">Martillero y corredor</a></li>
    <li><a href="#matricularse">Cómo matricularse</a></li><li><a href="#tramites">Trámites</a></li>
  </ul></nav>
  <div>
    <section class="bloque" aria-labelledby="padron">
      <h2 id="padron">Padrón de matriculados</h2>
      <p>Buscá por nombre, apellido o número de matrícula para verificar si un profesional está matriculado y habilitado en la ${DEPARTAMENTAL}.</p>
      <div class="aviso aviso-pend">${icono('info', 20)}<div>${formatear(cfg.padron_aviso?.trim() || AVISO_PADRON)}</div></div>
      <form id="padron-form" class="padron-form" role="search" aria-label="Buscar en el padrón">
        <div class="campo campo-q"><label for="padron-q">Nombre, apellido o N.º de matrícula</label><input id="padron-q" name="q" type="search" autocomplete="off" maxlength="80"></div>
        <div class="campo"><label for="padron-titulo">Título</label><select id="padron-titulo" name="titulo"><option value="">Todos</option>${Object.entries(TITULOS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div>
        <div class="campo"><label for="padron-estado">Estado</label><select id="padron-estado" name="estado"><option value="">Todos</option><option value="activo">Activa</option><option value="suspendido">Suspendida</option></select></div>
        <button class="btn btn-primario" type="submit">${icono('buscar', 18)} Buscar</button>
      </form>
      <p id="padron-info" class="padron-info" role="status" aria-live="polite">${n ? '' : 'Todavía no hay profesionales cargados en el padrón.'}</p>
      <div class="tabla-envoltura">
        <table>
          <caption class="sr">Resultados del padrón de matriculados</caption>
          <thead><tr><th scope="col">Matrícula</th><th scope="col">Profesional</th><th scope="col">Título</th><th scope="col">Situación</th></tr></thead>
          <tbody id="padron-resultados"><tr><td colspan="4">${n ? 'Cargando padrón…' : 'Sin registros disponibles por el momento.'}</td></tr></tbody>
        </table>
      </div>
      <p class="fuente">Fuente: registros de matriculados cargados por la ${DEPARTAMENTAL}. Ante cualquier duda, ${'<a href="/contacto">consultá con la Departamental</a>'}.</p>
    </section>

    <section class="bloque" aria-labelledby="profesion">
      <h2 id="profesion">Martillero y corredor no son lo mismo</h2>
      ${profesion()}
    </section>

    <section class="bloque" aria-labelledby="matricularse">
      <h2 id="matricularse">Cómo matricularse</h2>
      <div class="aviso aviso-info">${icono('info', 20)}<p>Para obtener la matrícula de martillero o de corredor se requiere título universitario habilitante, conforme a la ${enlaceExterno(LEY_20266_URL, 'Ley Nacional 20.266')} (modificada por la Ley 25.028) y a la ${enlaceExterno(LEY_762_URL, 'Ley Provincial 762')}.</p></div>
      <h3>Requisitos</h3>${contenido(cfg.matricula_requisitos, 'El detalle de requisitos y documentación de la Departamental Río Grande está pendiente de carga.')}
      <h3>Pasos de inscripción</h3>${contenido(cfg.matricula_pasos, 'Los pasos de inscripción están pendientes de carga. Mientras tanto, podés consultar a la Departamental.')}
      <p><a class="btn btn-contorno" href="/contacto">Consultar sobre matriculación ${icono('flecha', 16)}</a></p>
    </section>

    <section class="bloque" aria-labelledby="tramites">
      <h2 id="tramites">Trámites</h2>
      ${contenido(cfg.tramites, 'El listado de trámites ante la Departamental está pendiente de carga.')}
      <div class="tarjeta tarjeta-cuerpo tarjeta-linea">
        <h3>${icono('candado', 20)} Portal de autogestión</h3>
        <p>Los profesionales matriculados pueden consultar su estado de cuenta, actualizar sus datos de contacto y descargar su credencial.</p>
        <a class="btn btn-primario" href="/portal">Ingresar al portal</a>
      </div>
      <p>Formularios y modelos de notas disponibles en <a href="/normativa">Normativa y documentación</a>.</p>
    </section>
  </div>
</div>`;
  return responder(c, cfg, { titulo: 'Matriculados', descripcion: `Padrón de matriculados de la ${DEPARTAMENTAL}, requisitos para matricularse como martillero o corredor y trámites.`, ruta: '/matriculados', seccion: 'matriculados', cuerpo, scripts: [] });
});

/* -------------------------------- Normativa -------------------------------- */

const ORDEN_CAT = Object.keys(CATEGORIAS_DOC);
function itemDoc(d: any) {
  const externo = !d.archivo_id && d.url && urlValida(d.url);
  const href = d.archivo_id ? `/archivos/${d.archivo_id}` : externo ? d.url : '';
  const accion = href
    ? `<a class="btn btn-contorno btn-chico" href="${esc(href)}"${externo ? ' target="_blank" rel="noopener"' : ''}>${icono(externo ? 'externo' : 'descargar', 16)} ${externo ? 'Ver documento' : 'Descargar'}<span class="sr">: ${esc(d.titulo)}${externo ? ' (se abre en una pestaña nueva)' : ''}</span></a>${externo ? `<span class="fuente-doc">${esc(dominio(d.url))}</span>` : ''}`
    : `<span class="fuente-doc">Ver texto relacionado</span>`;
  return `<li class="doc" data-cat="${esc(d.categoria)}" data-texto="${esc(normalizar(`${d.titulo} ${d.descripcion ?? ''}`))}">
    <span class="ico-caja">${icono('documento', 22)}</span>
    <div>
      <p class="meta"><span class="etiqueta">${esc(CATEGORIAS_DOC[d.categoria] ?? d.categoria)}</span>${d.fecha ? `<time datetime="${iso(d.fecha).slice(0, 10)}">${fechaDia(d.fecha)}</time>` : ''}</p>
      <h3>${esc(d.titulo)}</h3>
      ${d.descripcion ? `<p>${esc(d.descripcion)}</p>` : ''}
    </div>
    <div class="doc-accion">${accion}</div>
  </li>`;
}

sitio.get('/normativa', async (c) => {
  const { cfg } = await contexto(c);
  const docs = (await q('SELECT * FROM normativas')).sort((a, b) =>
    (ORDEN_CAT.indexOf(a.categoria) - ORDEN_CAT.indexOf(b.categoria)) || (a.orden - b.orden) ||
    (new Date(b.fecha ?? 0).getTime() - new Date(a.fecha ?? 0).getTime()) || a.id - b.id);
  const conDatos = ORDEN_CAT.filter((k) => docs.some((d) => d.categoria === k));
  const sinDatos = ORDEN_CAT.filter((k) => !conDatos.includes(k) && k !== 'decreto' && k !== 'etica');

  const cuerpo = `${encabezado('Normativa y documentación', 'Leyes, resoluciones, reglamentos, circulares, formularios y modelos de notas para el ejercicio profesional.', [['Normativa y documentación']])}
<div class="contenedor seccion">
  <div class="filtros-docs">
    <div class="filtros" role="group" aria-label="Filtrar por categoría">
      <button type="button" class="chip" data-cat="" aria-pressed="true">Todas</button>
      ${conDatos.map((k) => `<button type="button" class="chip" data-cat="${k}" aria-pressed="false">${CATEGORIAS_DOC[k]}</button>`).join('')}
    </div>
    <div class="campo campo-buscar-docs"><label for="docs-q">Buscar en documentos</label><input id="docs-q" type="search" autocomplete="off" placeholder="Ej.: honorarios, Ley 762"></div>
  </div>
  <p id="docs-info" class="padron-info" role="status" aria-live="polite">${docs.length} documento${docs.length === 1 ? '' : 's'}</p>
  ${docs.length ? `<ul class="docs" id="docs">${docs.map(itemDoc).join('')}</ul>` : pendiente('Todavía no hay documentos publicados.')}
  <p id="docs-vacio" class="pendiente" hidden>${icono('info', 18)}<span>No hay documentos que coincidan con la búsqueda.</span></p>
  ${sinDatos.length ? `<div class="aviso aviso-pend">${icono('reloj', 20)}<p>Pendientes de carga: ${sinDatos.map((k) => CATEGORIAS_DOC[k].toLowerCase()).join(', ')}. Se publicarán a medida que la Departamental los apruebe.</p></div>` : ''}
</div>`;
  return responder(c, cfg, { titulo: 'Normativa y documentación', descripcion: 'Ley Provincial 762, Ley Nacional 20.266, Código Civil y Comercial, resoluciones, reglamentos, formularios y modelos de notas.', ruta: '/normativa', seccion: 'normativa', cuerpo });
});

/* -------------------------------- Novedades -------------------------------- */

const FILTROS_NOV: [string, string][] = [['', 'Todas'], ['noticia', 'Noticias'], ['comunicado', 'Comunicados'], ['capacitaciones', 'Capacitaciones'], ['reunion', 'Reuniones'], ['evento', 'Eventos']];
const POR_PAGINA = 12;

sitio.get('/novedades', async (c) => {
  const { cfg } = await contexto(c);
  const cat = c.req.query('categoria') ?? '';
  const pag = Math.max(1, Number(c.req.query('pagina')) || 1);
  let where = 'publicado_en <= now()';
  const params: unknown[] = [];
  if (cat === 'capacitaciones') where += ` AND categoria IN ('curso','jornada')`;
  else if (cat in CATEGORIAS_NOVEDAD) { params.push(cat); where += ` AND COALESCE(categoria,'noticia') = $1`; }
  const [[{ total }], items] = await Promise.all([
    q(`SELECT count(*)::int AS total FROM novedades WHERE ${where}`, params),
    q(`SELECT ${NOV} FROM novedades WHERE ${where} ORDER BY publicado_en DESC LIMIT ${POR_PAGINA} OFFSET ${(pag - 1) * POR_PAGINA}`, params),
  ]);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const link = (p: number) => {
    const qs = new URLSearchParams({ ...(cat ? { categoria: cat } : {}), ...(p > 1 ? { pagina: String(p) } : {}) }).toString();
    return qs ? `/novedades?${qs}` : '/novedades';
  };
  const titulo = cat ? (FILTROS_NOV.find(([k]) => k === cat)?.[1] ?? 'Novedades') : 'Novedades y capacitaciones';

  const cuerpo = `${encabezado('Novedades y capacitaciones', 'Noticias, comunicados, cursos, jornadas, reuniones y eventos de la Departamental.', [['Novedades', '/novedades'], ...(cat ? [[titulo]] as [string][] : [])])}
<div class="contenedor seccion">
  <nav class="filtros" aria-label="Filtrar novedades por categoría">
    ${FILTROS_NOV.map(([k, t]) => `<a class="chip" href="${k ? `/novedades?categoria=${k}` : '/novedades'}"${k === cat || (!cat && !k) ? ' aria-current="page"' : ''}>${t}</a>`).join('')}
  </nav>
  ${items.length ? `<div class="grilla grilla-3">${items.map((n) => tarjetaNovedad(n, 2)).join('')}</div>` : pendiente('No hay publicaciones en esta categoría por el momento.')}
  ${paginas > 1 ? `<nav class="paginacion" aria-label="Paginación">
    ${pag > 1 ? `<a class="btn btn-contorno" href="${link(pag - 1)}" rel="prev">Más recientes</a>` : '<span></span>'}
    <span>Página ${pag} de ${paginas}</span>
    ${pag < paginas ? `<a class="btn btn-contorno" href="${link(pag + 1)}" rel="next">Anteriores</a>` : '<span></span>'}
  </nav>` : ''}
</div>
<section class="seccion seccion-alt"><div class="contenedor contenedor-angosto">${suscripcion('suscripcion-novedades')}</div></section>`;
  return responder(c, cfg, { titulo, descripcion: `Novedades, comunicados y capacitaciones de la ${DEPARTAMENTAL} del Colegio de Martilleros y Corredores Públicos de Tierra del Fuego.`, ruta: link(pag), seccion: 'novedades', cuerpo });
});

sitio.get('/novedades/:clave', async (c) => {
  const { cfg, base } = await contexto(c);
  const id = parseInt(c.req.param('clave'), 10);
  const [n] = id ? await q(`SELECT ${NOV} FROM novedades WHERE id = $1 AND publicado_en <= now()`, [id]) : [];
  if (!n) return noEncontrado(c);
  const canonica = urlNovedad(n);
  if (c.req.path !== canonica) return c.redirect(canonica, 301);
  const otras = await q(`SELECT ${NOV} FROM novedades WHERE id <> $1 AND publicado_en <= now() ORDER BY publicado_en DESC LIMIT 3`, [n.id]);

  const ficha = [
    n.fecha_evento && `<div>${icono('calendario', 18)}<span><strong>Fecha:</strong> ${fechaHora(n.fecha_evento)}</span></div>`,
    n.lugar && `<div>${icono('ubicacion', 18)}<span><strong>Lugar:</strong> ${esc(n.lugar)}</span></div>`,
  ].filter(Boolean).join('');

  const cuerpo = `${encabezado(n.titulo, '', [['Novedades', '/novedades'], [categoriaNovedad(n.categoria), `/novedades?categoria=${['curso', 'jornada'].includes(n.categoria) ? 'capacitaciones' : n.categoria ?? 'noticia'}`], [n.titulo]])}
<div class="contenedor seccion">
  <article class="articulo">
    <p class="meta"><span class="etiqueta">${esc(categoriaNovedad(n.categoria))}</span>Publicado el <time datetime="${iso(n.publicado_en)}">${fecha(n.publicado_en)}</time></p>
    ${n.imagen_id ? `<figure class="articulo-img"><img src="/archivos/${n.imagen_id}" alt="${esc(n.imagen_alt ?? '')}" width="1200" height="675"></figure>` : ''}
    ${ficha ? `<div class="ficha">${ficha}</div>` : ''}
    <div class="prosa">${formatear(n.contenido)}</div>
    ${n.enlace && urlValida(n.enlace) ? `<p>${enlaceExterno(n.enlace, `Más información en ${dominio(n.enlace)}`, 'btn btn-contorno')}</p>` : ''}
    <p><a href="/novedades">${icono('flecha', 16)} Volver a novedades</a></p>
  </article>
</div>
${otras.length ? `<section class="seccion seccion-alt" aria-labelledby="otras-titulo"><div class="contenedor">${tituloSeccion('Otras novedades', '', 'otras-titulo')}<div class="grilla grilla-3">${otras.map((o) => tarjetaNovedad(o)).join('')}</div></div></section>` : ''}`;

  return responder(c, cfg, {
    titulo: n.titulo, descripcion: resumenNovedad(n, 160), ruta: canonica, seccion: 'novedades', cuerpo, tipoOg: 'article',
    imagen: n.imagen_id ? `${base}/archivos/${n.imagen_id}` : undefined,
    jsonld: { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: n.titulo, datePublished: iso(n.publicado_en), ...(n.imagen_id ? { image: `${base}/archivos/${n.imagen_id}` } : {}), publisher: { '@type': 'Organization', name: `${NOMBRE} — ${DEPARTAMENTAL}` } },
  });
});

/* -------------------------------- Servicios -------------------------------- */

sitio.get('/servicios', async (c) => {
  const { cfg } = await contexto(c);
  const pagoOnline = Boolean(ENV.MP_ACCESS_TOKEN);
  const servicios = [
    ['candado', 'Portal de autogestión', estado('Disponible', 'ok'), '<p>Ingresá con tu número de matrícula, DNI o correo y la contraseña entregada por la Departamental para:</p><ul><li>Consultar tu estado de cuenta.</li><li>Actualizar tus datos de contacto y domicilio profesional.</li><li>Descargar tu credencial digital y una constancia informativa de matrícula.</li></ul><p><a class="btn btn-primario" href="/portal">Ingresar al portal</a></p>'],
    ['maletin', 'Pago online de cuotas', pagoOnline ? estado('Disponible', 'ok') : estado('Pendiente', 'aviso'),
      pagoOnline ? '<p>Podés abonar la cuota societaria con Mercado Pago desde el Portal de Autogestión.</p>' : '<p>El pago online se habilitará próximamente. Mientras tanto, consultá los medios de pago con la Departamental; los pagos se registran desde la administración y se reflejan en tu estado de cuenta.</p>'],
  ].map(([ic, t, est, html]) => `<article class="tarjeta tarjeta-cuerpo servicio"><div class="servicio-cabeza"><span class="ico-caja">${icono(ic, 22)}</span><h2>${t}</h2>${est}</div>${html}</article>`).join('');

  const cuerpo = `${encabezado('Servicios al matriculado', 'Herramientas, beneficios y recursos para los profesionales matriculados en la Departamental Río Grande.', [['Servicios al matriculado']])}
<div class="contenedor seccion">
  <div class="grilla grilla-2">${servicios}</div>
  <div class="grilla grilla-2 servicios-info">
    <section class="bloque-simple" aria-labelledby="beneficios"><h2 id="beneficios">Beneficios</h2>${contenido(cfg.servicios_beneficios, 'Los beneficios para matriculados están pendientes de carga.')}</section>
    <section class="bloque-simple" aria-labelledby="convenios"><h2 id="convenios">Convenios</h2>${contenido(cfg.servicios_convenios, 'Los convenios vigentes están pendientes de carga.')}</section>
    <section class="bloque-simple" aria-labelledby="consultas"><h2 id="consultas">Consultas administrativas</h2>${cfg.servicios_consultas?.trim() ? contenido(cfg.servicios_consultas) : '<p>Para consultas sobre cuotas, matrícula o trámites, escribí a la Departamental desde la sección de contacto.</p>'}<p><a class="btn btn-contorno" href="/contacto">Hacer una consulta</a></p></section>
    <section class="bloque-simple" aria-labelledby="recursos"><h2 id="recursos">Recursos profesionales</h2>
      <ul class="lista-enlaces">
        <li><a href="/normativa">Normativa y documentación</a></li>
        <li>${enlaceExterno(LEY_762_URL, 'Ley Provincial 762 (Legislatura de TDF)')}</li>
        <li>${enlaceExterno(LEY_20266_URL, 'Ley Nacional 20.266 actualizada')}</li>
        <li>${enlaceExterno(CCYCN_URL, 'Código Civil y Comercial — contrato de corretaje')}</li>
        <li>${enlaceExterno(COFECI_URL, 'Consejo Federal de Colegios Inmobiliarios')}</li>
      </ul>
    </section>
  </div>
</div>`;
  return responder(c, cfg, { titulo: 'Servicios al matriculado', descripcion: 'Portal de autogestión, beneficios, convenios, consultas administrativas y recursos profesionales para matriculados de Río Grande.', ruta: '/servicios', seccion: 'servicios', cuerpo });
});

/* ---------------------------------- CO.FE.CI. ---------------------------------- */

sitio.get('/cofeci', async (c) => {
  const { cfg } = await contexto(c);
  const cuerpo = `${encabezado('CO.FE.CI.', 'Consejo Federal de Colegios Inmobiliarios de la República Argentina.', [['CO.FE.CI.']])}
<div class="contenedor seccion contenedor-medio">
  <div class="prosa">
    <p>El Consejo Federal de Colegios Inmobiliarios (CO.FE.CI.) reúne a los colegios profesionales de corredores inmobiliarios de todo el país. El Colegio de Martilleros y Corredores de Tierra del Fuego forma parte del Consejo.</p>
    <p>Desde su sitio oficial se difunden las actividades, convenios, campañas y novedades del sector inmobiliario a nivel federal.</p>
  </div>
  <div class="tarjeta tarjeta-cuerpo tarjeta-linea">
    <h2>${icono('red', 22)} Canales oficiales</h2>
    <ul class="lista-enlaces"><li>${enlaceExterno(COFECI_URL, 'Sitio oficial del CO.FE.CI. — cofeci.com.ar')}</li></ul>
    <p class="fuente">Para más información sobre la participación del Colegio en el Consejo, consultá el ${enlaceExterno(SITIO_PROVINCIAL + 'co-fe-ci/', 'sitio del Colegio provincial')}.</p>
  </div>
</div>`;
  return responder(c, cfg, { titulo: 'CO.FE.CI.', descripcion: 'Presentación del Consejo Federal de Colegios Inmobiliarios y enlaces a sus canales oficiales.', ruta: '/cofeci', seccion: 'cofeci', cuerpo });
});

/* ---------------------------------- Contacto ---------------------------------- */

sitio.get('/contacto', async (c) => {
  const { cfg } = await contexto(c);
  const wa = (cfg.contacto_whatsapp ?? '').replace(/\D/g, '');
  const datos = [
    cfg.contacto_direccion && ['ubicacion', 'Dirección', `${esc(cfg.contacto_direccion)}, Río Grande, Tierra del Fuego<br>${enlaceExterno(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cfg.contacto_direccion}, Río Grande, Tierra del Fuego`)}`, 'Ver ubicación en el mapa')}`],
    cfg.contacto_email && ['correo', 'Correo electrónico', `<a href="mailto:${esc(cfg.contacto_email)}">${esc(cfg.contacto_email)}</a>`],
    cfg.contacto_telefono && ['telefono', 'Teléfono', `<a href="tel:${esc(cfg.contacto_telefono.replace(/[^\d+]/g, ''))}">${esc(cfg.contacto_telefono)}</a>`],
    wa.length >= 10 && ['chat', 'WhatsApp', enlaceExterno(`https://wa.me/${wa}`, 'Escribir por WhatsApp')],
    cfg.contacto_horario && ['reloj', 'Horario de atención', esc(cfg.contacto_horario)],
  ].filter(Boolean) as [string, string, string][];

  const cuerpo = `${encabezado('Contacto', `Canales de atención de la ${DEPARTAMENTAL}.`, [['Contacto']])}
<div class="contenedor seccion contacto-grid">
  <section aria-labelledby="datos-titulo">
    <h2 id="datos-titulo">Datos de contacto</h2>
    ${datos.length ? `<ul class="datos-contacto">${datos.map(([ic, t, v]) => `<li><span class="ico-caja">${icono(ic, 22)}</span><div><strong>${t}</strong>${v}</div></li>`).join('')}</ul>` : pendiente('La dirección, el teléfono, el correo y los horarios de atención de la Departamental se publicarán una vez confirmados. Mientras tanto, podés escribirnos con el formulario.')}
    <div class="aviso aviso-info">${icono('alerta', 20)}<p>¿Querés denunciar a un profesional o a alguien que opera sin matrícula? Usá el <a href="/denuncias">canal oficial de denuncias</a>; este formulario es solo para consultas.</p></div>
  </section>
  <section aria-labelledby="form-titulo">
    <form class="tarjeta tarjeta-cuerpo" data-api="/api/contacto" data-exito="Recibimos tu consulta. La Departamental te responderá al correo indicado." novalidate aria-labelledby="form-titulo">
      <h2 id="form-titulo">Escribinos</h2>
      <p class="ayuda">Los campos marcados con * son obligatorios.</p>
      <div class="campo"><label for="ct-nombre">Nombre y apellido *</label><input id="ct-nombre" name="nombre" required minlength="3" maxlength="120" autocomplete="name" aria-describedby="ct-nombre-error"><p class="error-campo" id="ct-nombre-error" hidden></p></div>
      <div class="fila-campos">
        <div class="campo"><label for="ct-email">Correo electrónico *</label><input id="ct-email" name="email" type="email" required maxlength="120" autocomplete="email" aria-describedby="ct-email-error"><p class="error-campo" id="ct-email-error" hidden></p></div>
        <div class="campo"><label for="ct-telefono">Teléfono <span class="opcional">(opcional)</span></label><input id="ct-telefono" name="telefono" type="tel" maxlength="40" autocomplete="tel" pattern="[0-9 +()\\-]{6,40}" data-patron="Usá solo números, espacios y los signos + ( ) -." aria-describedby="ct-telefono-error"><p class="error-campo" id="ct-telefono-error" hidden></p></div>
      </div>
      <div class="campo"><label for="ct-asunto">Asunto *</label><select id="ct-asunto" name="asunto" required aria-describedby="ct-asunto-error"><option value="">Elegí una opción</option>${ASUNTOS.map((a) => `<option>${a}</option>`).join('')}</select><p class="error-campo" id="ct-asunto-error" hidden></p></div>
      <div class="campo"><label for="ct-mensaje">Mensaje *</label><textarea id="ct-mensaje" name="mensaje" required minlength="10" maxlength="4000" aria-describedby="ct-mensaje-error"></textarea><p class="error-campo" id="ct-mensaje-error" hidden></p></div>
      <div class="hp" aria-hidden="true"><label for="ct-sitio">No completar</label><input id="ct-sitio" name="sitio" tabindex="-1" autocomplete="off"></div>
      <div class="campo"><label class="check" for="ct-acepta"><input id="ct-acepta" name="acepta" type="checkbox" required aria-describedby="ct-acepta-error"> <span>Acepto que la Departamental use estos datos solo para responder mi consulta, según la <a href="/privacidad">política de privacidad</a>. *</span></label><p class="error-campo" id="ct-acepta-error" hidden></p></div>
      <button class="btn btn-primario" type="submit">Enviar consulta</button>
      <div class="form-estado" role="status" aria-live="polite" hidden></div>
    </form>
  </section>
</div>`;
  return responder(c, cfg, { titulo: 'Contacto', descripcion: `Dirección, correo, teléfono, horarios y formulario de consultas de la ${DEPARTAMENTAL}.`, ruta: '/contacto', seccion: 'contacto', cuerpo });
});

/* ---------------------------------- Denuncias ---------------------------------- */

sitio.get('/denuncias', async (c) => {
  const { cfg } = await contexto(c);
  const motivos = ['Ejercicio de la profesión sin matrícula.', 'Cobro indebido o excesivo de honorarios o comisiones.', 'Retención de dinero, depósitos o señas.', 'Incumplimiento de contratos u obligaciones profesionales.', 'Publicidad engañosa.', 'Faltas de ética o malos tratos.'];
  const cuerpo = `${encabezado('Denuncias', '¿Tuviste un problema con un martillero, un corredor o una inmobiliaria? Conocé el canal oficial para presentar tu denuncia.', [['Denuncias']])}
<div class="contenedor seccion contenedor-medio">
  <section class="bloque" aria-labelledby="como">
    <h2 id="como">Cómo se presenta una denuncia</h2>
    <p>Las denuncias se tramitan a través del formulario oficial del Colegio de Martilleros y Corredores de Tierra del Fuego, que cuenta con un mecanismo seguro para recibir datos y documentación.</p>
    <ol class="pasos">
      <li><h3>Completás el formulario oficial</h3><p>Con la mayor cantidad de datos y pruebas posibles: contratos, recibos o capturas.</p></li>
      <li><h3>Recibís un número de expediente</h3><p>Te llega por correo electrónico para que puedas hacer el seguimiento.</p></li>
      <li><h3>El Colegio interviene</h3><p>El Tribunal de Disciplina y la Comisión Fiscalizadora analizan el caso.</p></li>
    </ol>
    <p class="acciones-centro">${enlaceExterno(DENUNCIAS_OFICIAL, 'Ir al formulario oficial de denuncias', 'btn btn-primario btn-grande')}</p>
  </section>
  <section class="bloque" aria-labelledby="motivos">
    <h2 id="motivos">Qué se puede denunciar</h2>
    <div class="prosa"><ul>${motivos.map((m) => `<li>${m}</li>`).join('')}</ul></div>
  </section>
  <section class="bloque" aria-labelledby="antes">
    <h2 id="antes">Antes de operar</h2>
    <p>Verificá siempre que el profesional tenga matrícula vigente antes de firmar un contrato o entregar dinero.</p>
    <p><a class="btn btn-contorno" href="/matriculados#padron">${icono('buscar', 18)} Consultar el padrón</a></p>
  </section>
  <div class="aviso aviso-info">${icono('candado', 20)}<p>Este sitio no recibe denuncias ni documentación. Para proteger tus datos, no envíes información sensible por el formulario de contacto: usá el formulario oficial.</p></div>
</div>`;
  return responder(c, cfg, { titulo: 'Denuncias', descripcion: 'Canal oficial para denunciar irregularidades de martilleros, corredores o personas que operan sin matrícula en Tierra del Fuego.', ruta: '/denuncias', seccion: 'denuncias', cuerpo });
});

/* --------------------------------- Privacidad --------------------------------- */

sitio.get('/privacidad', async (c) => {
  const { cfg } = await contexto(c);
  const cuerpo = `${encabezado('Privacidad y datos personales', 'Cómo usamos los datos que nos dejás en este sitio.', [['Privacidad']])}
<div class="contenedor seccion contenedor-medio"><div class="prosa">
  <h2>Responsable</h2>
  <p>Los datos son administrados por la ${DEPARTAMENTAL} del ${NOMBRE}.</p>
  <h2>Qué datos recopilamos y para qué</h2>
  <ul>
    <li><strong>Suscripción a novedades:</strong> nombre, apellido y correo, para enviarte comunicados y novedades.</li>
    <li><strong>Formulario de contacto:</strong> nombre, correo, teléfono (opcional) y mensaje, solo para responder tu consulta.</li>
    <li><strong>Portal de autogestión:</strong> datos de matrícula y de contacto de los profesionales, para la gestión administrativa.</li>
  </ul>
  <p>No cedemos tus datos a terceros, salvo obligación legal. El padrón público muestra únicamente número de matrícula, nombre, título y situación de la matrícula.</p>
  <h2>Tus derechos</h2>
  <p>De acuerdo con la Ley 25.326 de Protección de Datos Personales, podés solicitar el acceso, la rectificación o la supresión de tus datos escribiendo a la Departamental desde la <a href="/contacto">sección de contacto</a>. La Agencia de Acceso a la Información Pública es el órgano de control de la Ley 25.326.</p>
  <h2>Cookies y servicios externos</h2>
  <p>El sitio usa únicamente cookies técnicas para mantener la sesión del Portal de Autogestión y de la administración. No usamos cookies de seguimiento ni publicidad. Las tipografías se cargan desde Google Fonts.</p>
</div></div>`;
  return responder(c, cfg, { titulo: 'Privacidad y datos personales', ruta: '/privacidad', cuerpo });
});

/* ------------------------------ Portal y admin ------------------------------ */

sitio.get('/portal', async (c) => {
  const { cfg } = await contexto(c);
  const cuerpo = `${encabezado('Portal de autogestión', 'Espacio exclusivo para profesionales matriculados en la Departamental Río Grande.', [['Servicios', '/servicios'], ['Portal de autogestión']])}
<div class="contenedor seccion">
  <div id="vista-login" class="login-caja" hidden>
    <form id="form-login" class="tarjeta tarjeta-cuerpo" novalidate>
      <h2>Ingresar</h2>
      <p class="ayuda">Usá tu número de matrícula, DNI o correo y la contraseña que te entregó la Departamental.</p>
      <div class="campo"><label for="usuario">Usuario</label><input id="usuario" name="usuario" required autocomplete="username"></div>
      <div class="campo"><label for="password">Contraseña</label><input id="password" name="password" type="password" required autocomplete="current-password"></div>
      <button class="btn btn-primario btn-bloque" type="submit">Ingresar</button>
      <div id="login-msg" class="form-estado" role="status" aria-live="polite" hidden></div>
      <p class="ayuda">¿Olvidaste tu contraseña? <a href="/contacto">Solicitá una nueva a la Departamental</a>.</p>
    </form>
  </div>

  <div id="vista-panel" hidden>
    <div class="panel-cabeza">
      <div><h2 id="saludo"></h2><p class="meta" id="sub-saludo"></p></div>
      <div class="acciones-fila">
        <a class="btn btn-primario" href="/api/portal/certificado" id="btn-cert">${icono('descargar', 18)} Constancia de matrícula (PDF)</a>
        <a class="btn btn-dorado" href="/api/portal/credencial" id="btn-cred">${icono('descargar', 18)} Credencial digital (PDF)</a>
        <button type="button" class="btn btn-contorno" id="salir">Cerrar sesión</button>
      </div>
    </div>
    <p class="aviso aviso-info">${icono('info', 20)}<span>La constancia y la credencial son documentos informativos. Su validez como certificado oficial está sujeta a la aprobación de la Departamental.</span></p>
    <div id="pago-msg" class="form-estado" role="status" aria-live="polite" hidden></div>
    <div class="grilla grilla-3 kpis">
      <div class="tarjeta tarjeta-cuerpo"><p class="meta">Estado de matrícula</p><p class="kpi" id="kpi-estado"></p></div>
      <div class="tarjeta tarjeta-cuerpo"><p class="meta">Deuda pendiente</p><p class="kpi" id="kpi-deuda"></p></div>
      <div class="tarjeta tarjeta-cuerpo"><p class="meta">Fecha de alta</p><p class="kpi" id="kpi-alta"></p></div>
    </div>
    <section class="tarjeta tarjeta-cuerpo bloque-panel" aria-labelledby="cuenta-titulo">
      <h2 id="cuenta-titulo">Estado de cuenta — Cuota societaria</h2>
      <div class="tabla-envoltura"><table><thead><tr><th scope="col">Período</th><th scope="col">Vencimiento</th><th scope="col">Monto</th><th scope="col">Estado</th><th scope="col"><span class="sr">Acciones</span></th></tr></thead><tbody id="cuotas"></tbody></table></div>
      <p class="ayuda" id="nota-pago"></p>
    </section>
    <div class="grilla grilla-2">
      <form id="form-datos" class="tarjeta tarjeta-cuerpo" novalidate>
        <h2>Mis datos de contacto</h2>
        <div class="campo"><label for="d-email">Correo electrónico</label><input id="d-email" name="email" type="email" required autocomplete="email"></div>
        <div class="campo"><label for="d-telefono">Teléfono</label><input id="d-telefono" name="telefono" type="tel" autocomplete="tel"></div>
        <div class="campo"><label for="d-domicilio">Domicilio profesional</label><input id="d-domicilio" name="domicilio_profesional" autocomplete="street-address"></div>
        <button class="btn btn-primario" type="submit">Guardar cambios</button>
        <div id="datos-msg" class="form-estado" role="status" aria-live="polite" hidden></div>
      </form>
      <form id="form-pass" class="tarjeta tarjeta-cuerpo" novalidate>
        <h2>Cambiar contraseña</h2>
        <div class="campo"><label for="p-actual">Contraseña actual</label><input id="p-actual" name="actual" type="password" required autocomplete="current-password"></div>
        <div class="campo"><label for="p-nueva">Nueva contraseña <span class="opcional">(mínimo 8 caracteres)</span></label><input id="p-nueva" name="nueva" type="password" minlength="8" required autocomplete="new-password"></div>
        <button class="btn btn-primario" type="submit">Actualizar contraseña</button>
        <div id="pass-msg" class="form-estado" role="status" aria-live="polite" hidden></div>
      </form>
    </div>
  </div>
</div>`;
  return responder(c, cfg, { titulo: 'Portal de autogestión', ruta: '/portal', seccion: 'servicios', cuerpo, noindex: true, scripts: ['/static/js/comun.js', '/static/js/portal.js'] });
});

sitio.get('/admin', async (c) => {
  const { cfg } = await contexto(c);
  const pestanas: [string, string][] = [
    ['novedades', 'Novedades'], ['documentos', 'Documentos'], ['contenidos', 'Contenidos'], ['autoridades', 'Autoridades'],
    ['mensajes', 'Mensajes'], ['suscriptores', 'Suscriptores'], ['matriculados', 'Matriculados'], ['cuotas', 'Cuotas'],
  ];
  const cuerpo = `<div class="contenedor seccion">
  <div id="vista-login" class="login-caja" hidden>
    <form id="form-login" class="tarjeta tarjeta-cuerpo" novalidate>
      <h1 class="h2">Administración</h1>
      <p class="ayuda">Acceso exclusivo para la Comisión Directiva de la Departamental.</p>
      <div class="campo"><label for="pw">Contraseña</label><input id="pw" name="password" type="password" required autocomplete="current-password"></div>
      <button class="btn btn-primario btn-bloque" type="submit">Ingresar</button>
      <div id="login-msg" class="form-estado" role="status" aria-live="polite" hidden></div>
    </form>
  </div>
  <div id="vista-panel" hidden>
    <div class="panel-cabeza"><h1 class="h2">Panel de administración</h1><div class="acciones-fila"><a class="btn btn-contorno" href="/" target="_blank" rel="noopener">Ver sitio</a><button type="button" class="btn btn-contorno" id="salir">Cerrar sesión</button></div></div>
    <div id="msg" class="form-estado" role="status" aria-live="polite" hidden></div>
    <div class="panel-tabs" role="tablist" aria-label="Secciones de administración">
      ${pestanas.map(([id, t], i) => `<button type="button" role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ''}>${t}<span class="contador" data-contador="${id}"></span></button>`).join('')}
    </div>
    ${pestanas.map(([id], i) => `<section role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}"${i ? ' hidden' : ''}></section>`).join('')}
  </div>
</div>`;
  return responder(c, cfg, { titulo: 'Administración', ruta: '/admin', cuerpo, noindex: true, scripts: ['/static/js/comun.js', '/static/js/admin.js'] });
});

/* ------------------------------ SEO y redirecciones ------------------------------ */

sitio.get('/robots.txt', (c) => c.text(`User-agent: *\nDisallow: /admin\nDisallow: /portal\nDisallow: /api/\nSitemap: ${baseUrl(c)}/sitemap.xml\n`));

sitio.get('/sitemap.xml', async (c) => {
  const base = baseUrl(c);
  const novedades = await q('SELECT id, titulo, publicado_en FROM novedades WHERE publicado_en <= now() ORDER BY publicado_en DESC LIMIT 500');
  const urls = ['/', '/institucional', '/matriculados', '/normativa', '/novedades', '/servicios', '/cofeci', '/contacto', '/denuncias', '/privacidad']
    .map((u) => `<url><loc>${base}${u}</loc></url>`)
    .concat(novedades.map((n) => `<url><loc>${base}${urlNovedad(n)}</loc><lastmod>${iso(n.publicado_en).slice(0, 10)}</lastmod></url>`));
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`, 200, { 'Content-Type': 'application/xml; charset=utf-8' });
});

for (const [viejo, nuevo] of [['/index.html', '/'], ['/portal.html', '/portal'], ['/admin.html', '/admin']])
  sitio.get(viejo, (c) => c.redirect(nuevo + (new URL(c.req.url).search), 301));

export async function noEncontrado(c: any) {
  const { cfg } = await contexto(c);
  const cuerpo = `<div class="contenedor seccion contenedor-medio error-404">
  <p class="eyebrow">Error 404</p>
  <h1>No encontramos esta página</h1>
  <p>Es posible que la dirección haya cambiado o que el contenido ya no esté disponible.</p>
  <p class="acciones-fila"><a class="btn btn-primario" href="/">Ir al inicio</a><a class="btn btn-contorno" href="/novedades">Ver novedades</a><a class="btn btn-contorno" href="/contacto">Contacto</a></p>
</div>`;
  return responder(c, cfg, { titulo: 'Página no encontrada', ruta: c.req.path, cuerpo, noindex: true }, 404);
}
