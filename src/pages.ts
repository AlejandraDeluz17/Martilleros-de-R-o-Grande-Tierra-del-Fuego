import { Hono } from 'hono';
import { q, leerConfig, CATEGORIAS_DOC, CATEGORIAS_NOVEDAD, TITULOS, ORGANOS, ASUNTOS } from './db';
import {
  ENV, esc, baseUrl, fecha, fechaDia, fechaHora, iso, urlNovedad, formatear, dominio, normalizar, urlValida,
  NOMBRE, DEPARTAMENTAL, SITIO_PROVINCIAL, DENUNCIAS_OFICIAL, COFECI_URL, LEY_762_URL, LEY_20266_URL, CCYCN_URL, FOTO_PORTADA,
} from './util';
import { pagina, type Pagina } from './layout';
import {
  icono, pendiente, contenido, enlaceExterno, encabezado, tituloBloque, tarjetaNovedad, categoriaNovedad,
  resumenNovedad, estado, fechaNovedad, leerMas, bloqueFecha, CATEGORIAS_CAPACITACION, ICONO_CATEGORIA,
} from './ui';

export const sitio = new Hono();

type Datos = Omit<Pagina, 'cfg' | 'base'>;
async function contexto(c: any) {
  return { cfg: await leerConfig(), base: baseUrl(c) };
}
const responder = (c: any, cfg: Record<string, string>, d: Datos, status = 200) =>
  c.html(pagina({ ...d, cfg, base: baseUrl(c) }), status);

const NOV = 'id, titulo, categoria, resumen, contenido, imagen_id, imagen_alt, fecha_evento, lugar, destacado, enlace, publicado_en';
const CAP_SQL = `categoria IN ('curso','jornada','evento')`;
const AVISO_PADRON = `El padrón de la ${DEPARTAMENTAL} se encuentra en proceso de actualización. Si no encontrás a un profesional, consultá directamente con la Departamental.`;

/* --------------------------------- Bloques compartidos --------------------------------- */

const profesion = () => `<div class="profesiones">
  <article class="profesion">
    <p class="antetitulo">Martillero público</p>
    <h3>Remates y subastas</h3>
    <ul class="lista-check">
      <li>${icono('check', 16)} Realiza ventas en remate público de bienes muebles e inmuebles.</li>
      <li>${icono('check', 16)} Actúa en subastas judiciales y particulares.</li>
      <li>${icono('check', 16)} Tasa los bienes que va a rematar.</li>
    </ul>
  </article>
  <article class="profesion">
    <p class="antetitulo">Corredor público inmobiliario</p>
    <h3>Compraventa y alquiler</h3>
    <ul class="lista-check">
      <li>${icono('check', 16)} Intermedia en compraventas, alquileres y otras operaciones sobre inmuebles.</li>
      <li>${icono('check', 16)} Administra propiedades y tasa inmuebles.</li>
    </ul>
  </article>
</div>
<p class="nota-legal">${icono('info', 16)}<span>Ambas matrículas exigen título universitario habilitante (Ley Nacional 20.266, modificada por la Ley 25.028, y Ley Provincial 762). Son profesiones distintas: quien posee solo matrícula de martillero no puede ejercer el corretaje inmobiliario.</span></p>`;

const MARCO_LEGAL: [string, string, string, string][] = [
  ['Ley Provincial 762', '2007', 'Regula el ejercicio profesional en Tierra del Fuego y crea el Colegio.', LEY_762_URL],
  ['Ley Nacional 20.266', '1973', 'Régimen nacional de martilleros y corredores, modificado por la Ley 25.028.', LEY_20266_URL],
  ['Código Civil y Comercial', 'Arts. 1345–1355', 'Contrato de corretaje: obligaciones del corredor y comisión.', CCYCN_URL],
];
const marcoLegal = () => `<ul class="marco-legal">${MARCO_LEGAL.map(([t, a, d, u]) => `<li>
  <p class="meta"><span>${esc(a)}</span></p>
  <h3>${enlaceExterno(u, t)}</h3>
  <p>${esc(d)}</p>
</li>`).join('')}</ul>`;

function docsLista(docs: any[]) {
  return `<ul class="docs">${docs.map((d) => {
    const externo = !d.archivo_id && d.url && urlValida(d.url);
    const href = d.archivo_id ? `/archivos/${d.archivo_id}` : externo ? d.url : '';
    const accion = href
      ? `<a class="btn btn-linea btn-chico" href="${esc(href)}"${externo ? ' target="_blank" rel="noopener"' : ''}>${icono(externo ? 'externo' : 'descargar', 16)} ${externo ? 'Ver documento' : 'Descargar'}<span class="sr">: ${esc(d.titulo)}${externo ? ' (se abre en una pestaña nueva)' : ''}</span></a>${externo ? `<span class="fuente-doc">${esc(dominio(d.url))}</span>` : ''}`
      : '<span class="fuente-doc">Texto incluido en la norma actualizada</span>';
    return `<li class="doc" data-cat="${esc(d.categoria)}" data-texto="${esc(normalizar(`${d.titulo} ${d.descripcion ?? ''}`))}">
      <span class="doc-ico">${icono('documento', 22)}</span>
      <div class="doc-info">
        <h3>${esc(d.titulo)}</h3>
        ${d.descripcion ? `<p>${esc(d.descripcion)}</p>` : ''}
        ${d.fecha ? `<p class="meta"><time datetime="${iso(d.fecha).slice(0, 10)}">${fechaDia(d.fecha)}</time></p>` : ''}
      </div>
      <div class="doc-accion">${accion}</div>
    </li>`;
  }).join('')}</ul>`;
}

const ORDEN_CAT = Object.keys(CATEGORIAS_DOC);
const ordenarDocs = (docs: any[]) => docs.sort((a, b) =>
  (ORDEN_CAT.indexOf(a.categoria) - ORDEN_CAT.indexOf(b.categoria)) || (a.orden - b.orden) ||
  (new Date(b.fecha ?? 0).getTime() - new Date(a.fecha ?? 0).getTime()) || a.id - b.id);

/* ---------------------------------- Inicio ---------------------------------- */

sitio.get('/', async (c) => {
  const { cfg, base } = await contexto(c);
  const [novedades, proximas] = await Promise.all([
    q(`SELECT ${NOV} FROM novedades WHERE publicado_en <= now() ORDER BY destacado DESC, publicado_en DESC LIMIT 4`),
    q(`SELECT ${NOV} FROM novedades WHERE ${CAP_SQL} AND fecha_evento >= now() AND publicado_en <= now() ORDER BY fecha_evento LIMIT 2`),
  ]);
  const [destacada, ...secundarias] = novedades;

  const foto = cfg.portada_id
    ? `<img src="/archivos/${esc(cfg.portada_id)}" alt="${esc(cfg.portada_alt || 'Vista de Río Grande, Tierra del Fuego')}" width="1600" height="900" fetchpriority="high">`
    : `<img src="${FOTO_PORTADA.srcChica}" srcset="${FOTO_PORTADA.srcChica} 1000w, ${FOTO_PORTADA.src} 2000w" sizes="100vw" alt="${esc(FOTO_PORTADA.alt)}" width="${FOTO_PORTADA.ancho}" height="${FOTO_PORTADA.alto}" fetchpriority="high">`;
  const creditoTexto = cfg.portada_id ? cfg.portada_credito : FOTO_PORTADA.credito;

  // A + B · Presentación institucional y fotografía a todo el ancho
  const portada = `<section class="portada" aria-labelledby="portada-titulo">
  <div class="contenedor">
    <p class="antetitulo">Institución · Río Grande</p>
    <h1 id="portada-titulo">Una institución al servicio de la profesión y la comunidad.</h1>
    <p class="portada-bajada">Información institucional, orientación al ciudadano y herramientas para nuestros matriculados.</p>
    <div class="portada-botones">
      <a class="btn btn-petroleo btn-grande" href="/matriculados#padron">Consultar matrícula ${icono('flecha', 18)}</a>
      <a class="btn btn-arena-linea btn-grande" href="/institucional">Conocer el Colegio</a>
    </div>
  </div>
</section>
<figure class="portada-foto">
  ${foto}
  ${creditoTexto ? `<figcaption class="portada-credito">${esc(creditoTexto)}</figcaption>` : ''}
</figure>`;

  // C · Accesos de interés
  const accesos = `<section class="accesos" aria-labelledby="accesos-titulo">
  <div class="contenedor">
    <h2 id="accesos-titulo">Accesos de interés</h2>
    <ul class="accesos-grilla">
      ${[
        ['usuarios', 'Padrón profesional', 'Verificá si un martillero o corredor está matriculado.', '/matriculados#padron'],
        ['balanza', 'Leyes y normativa', 'Ley 762, Ley 20.266 y documentación vigente.', '/normativa'],
        ['carpeta', 'Trámites y formularios', 'Procedimientos, requisitos y formularios.', '/tramites'],
        ['calendario', 'Agenda institucional', 'Capacitaciones, jornadas y eventos.', '/capacitaciones'],
      ].map(([ic, t, d, h]) => `<li><a class="acceso" href="${h}">${icono(ic, 24)}<span class="acceso-nombre">${t}</span><span class="acceso-detalle">${d}</span></a></li>`).join('')}
    </ul>
  </div>
</section>`;

  // D · Actualidad institucional
  const notaDestacada = destacada ? `<article class="nota-destacada">
      <div class="nota-destacada-media" aria-hidden="true">${destacada.imagen_id
        ? `<img src="/archivos/${destacada.imagen_id}" alt="" width="960" height="600" loading="lazy">`
        : `<span class="sin-img sin-img-grande">${icono(ICONO_CATEGORIA[destacada.categoria ?? 'noticia'] ?? 'documento', 44)}<span>${esc(categoriaNovedad(destacada.categoria))}</span></span>`}</div>
      <div class="nota-destacada-cuerpo">
        <p class="meta"><span class="etiqueta">${esc(categoriaNovedad(destacada.categoria))}</span>${fechaNovedad(destacada)}</p>
        <h3><a href="${urlNovedad(destacada)}">${esc(destacada.titulo)}</a></h3>
        <p>${esc(resumenNovedad(destacada, 240))}</p>
        ${leerMas(destacada)}
      </div>
    </article>` : pendiente('Todavía no hay novedades publicadas.');
  const listaSecundaria = secundarias.length ? `<ul class="notas-breves">${secundarias.map((n) => `<li>
      <p class="meta"><span class="etiqueta etiqueta-suave">${esc(categoriaNovedad(n.categoria))}</span>${fechaNovedad(n)}</p>
      <h3><a href="${urlNovedad(n)}">${esc(n.titulo)}</a></h3>
      <p>${esc(resumenNovedad(n, 130))}</p>
      ${leerMas(n)}
    </li>`).join('')}</ul>` : '';
  const agenda = `<aside class="agenda-breve" aria-labelledby="agenda-titulo">
      <h3 id="agenda-titulo">${icono('calendario', 18)} Próximas capacitaciones</h3>
      ${proximas.length ? `<ul>${proximas.map((n) => `<li>${bloqueFecha(n.fecha_evento)}<div><a href="${urlNovedad(n)}">${esc(n.titulo)}</a>${n.lugar ? `<span>${esc(n.lugar)}</span>` : ''}</div></li>`).join('')}</ul>`
        : '<p>No hay capacitaciones programadas por el momento.</p>'}
      <a class="leer-mas" href="/capacitaciones">Ver agenda ${icono('flecha', 16)}</a>
    </aside>`;
  const actualidad = `<section class="seccion actualidad" aria-labelledby="actualidad-titulo">
  <div class="contenedor">
    <div class="fila-titulo">
      ${tituloBloque({ titulo: 'Actualidad institucional', bajada: 'Noticias, comunicados y capacitaciones de la Departamental Río Grande.', id: 'actualidad-titulo' })}
      <a class="btn btn-linea" href="/novedades">Todas las novedades ${icono('flecha', 16)}</a>
    </div>
    <div class="actualidad-grid">
      ${notaDestacada}
      <div class="actualidad-lateral">${listaSecundaria}${agenda}</div>
    </div>
  </div>
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
  return responder(c, cfg, { titulo: 'Inicio', ruta: '/', cuerpo: portada + accesos + actualidad, jsonld });
});

/* ------------------------------- Institucional ------------------------------- */

sitio.get('/institucional', async (c) => {
  const { cfg } = await contexto(c);
  const autoridades = await q('SELECT * FROM autoridades ORDER BY orden, id');
  const organos = [...ORGANOS, ...new Set(autoridades.map((a) => a.organo).filter((o) => !ORGANOS.includes(o)))];
  const listaAutoridades = autoridades.length
    ? `<div class="organos">${organos.filter((o) => autoridades.some((a) => a.organo === o)).map((o) => {
      const items = autoridades.filter((a) => a.organo === o);
      const mandatos = [...new Set(items.map((a) => a.mandato).filter(Boolean))];
      return `<section class="organo"><h3>${esc(o)}</h3>${mandatos.length ? `<p class="meta">Mandato ${esc(mandatos.join(' · '))}</p>` : ''}
        <dl>${items.map((a) => `<div><dt>${esc(a.cargo)}</dt><dd>${esc(a.nombre)}</dd></div>`).join('')}</dl></section>`;
    }).join('')}</div>`
    : pendiente('La nómina de autoridades vigentes de la Departamental Río Grande se publicará una vez confirmada.');

  const funciones = cfg.funciones?.trim()
    ? contenido(cfg.funciones)
    : `<ol class="funciones">
        <li><span class="punto-num">01</span><h3>Matrícula</h3><p>Controla la matrícula de martilleros y corredores públicos en la provincia.</p></li>
        <li><span class="punto-num">02</span><h3>Ejercicio profesional</h3><p>Controla el ejercicio profesional de sus matriculados.</p></li>
        <li><span class="punto-num">03</span><h3>Denuncias</h3><p>Recibe denuncias y les da curso a través del Tribunal de Disciplina y la Comisión Fiscalizadora.</p></li>
      </ol>
      <p class="fuente">Fuente: ${enlaceExterno(LEY_762_URL, 'Ley Provincial 762')} y ${enlaceExterno(SITIO_PROVINCIAL, 'sitio oficial del Colegio')}.</p>`;

  const cuerpo = `${encabezado({ titulo: 'Institucional', grupo: 'El Colegio', bajada: `Conocé al Colegio y a la ${DEPARTAMENTAL}: su origen, su propósito, sus funciones y quiénes lo integran.`, migas: [['Institucional']],
    indice: [['historia', 'Historia'], ['mision', 'Misión y objetivos'], ['funciones', 'Funciones'], ['autoridades', 'Autoridades'], ['comisiones', 'Comisiones'], ['departamental', 'La Departamental']] })}

<section class="seccion" aria-labelledby="historia">
  <div class="contenedor dos-col">
    <div>
      ${tituloBloque({ antetitulo: 'Origen', titulo: 'Historia', id: 'historia' })}
      <p class="destacado-texto">El Colegio de Martilleros y Corredores Públicos de Tierra del Fuego fue creado por la Ley Provincial 762 (2007), que regula el ejercicio profesional de martilleros y corredores en la provincia.</p>
      ${contenido(cfg.historia, 'La historia de la Departamental Río Grande está pendiente de carga.')}
    </div>
    <aside class="panel-lateral" aria-labelledby="marco-titulo">
      <h2 id="marco-titulo" class="antetitulo">Marco legal</h2>
      ${marcoLegal()}
      <a class="leer-mas" href="/normativa">Toda la normativa ${icono('flecha', 16)}</a>
    </aside>
  </div>
</section>

<section class="seccion seccion-piedra" aria-labelledby="mision">
  <div class="contenedor">
    ${tituloBloque({ antetitulo: 'Propósito', titulo: 'Misión y objetivos', id: 'mision' })}
    <div class="mision-grid">
      <div class="mision-cita">${cfg.mision?.trim() ? `<blockquote>${formatear(cfg.mision)}</blockquote>` : pendiente('La misión institucional está pendiente de carga.')}</div>
      <div><h3 class="h-chica">Objetivos</h3>${contenido(cfg.objetivos, 'Los objetivos están pendientes de carga.')}</div>
    </div>
  </div>
</section>

<section class="seccion" aria-labelledby="funciones">
  <div class="contenedor">
    ${tituloBloque({ antetitulo: 'Qué hace', titulo: 'Funciones del Colegio', id: 'funciones' })}
    ${funciones}
  </div>
</section>

<section class="seccion seccion-blanca" aria-labelledby="autoridades">
  <div class="contenedor">
    ${tituloBloque({ antetitulo: 'Quiénes lo integran', titulo: 'Autoridades', id: 'autoridades' })}
    ${listaAutoridades}
    <div class="dos-col dos-col-parejo separado">
      <section aria-labelledby="comisiones">${tituloBloque({ titulo: 'Comisiones', id: 'comisiones', nivel: 2 })}${contenido(cfg.comisiones, 'Las comisiones de trabajo están pendientes de carga.')}</section>
      <section aria-labelledby="departamental">${tituloBloque({ titulo: 'La Departamental Río Grande', id: 'departamental', nivel: 2 })}${contenido(cfg.departamental_datos, 'Los datos de la Departamental están pendientes de carga.')}<a class="leer-mas" href="/contacto">Contacto y ubicación ${icono('flecha', 16)}</a></section>
    </div>
  </div>
</section>

<section class="seccion" aria-label="CO.FE.CI.">
  <div class="contenedor">
    <a class="franja-enlace" href="/cofeci">
      <span class="acceso-ico">${icono('red', 24)}</span>
      <span><span class="acceso-t">El Colegio integra el CO.FE.CI.</span><span class="acceso-d">Consejo Federal de Colegios Inmobiliarios de la República Argentina.</span></span>
      <span class="acceso-flecha">${icono('flecha', 20)}</span>
    </a>
  </div>
</section>`;
  return responder(c, cfg, { titulo: 'Institucional', descripcion: `Historia, misión, funciones y autoridades de la ${DEPARTAMENTAL} del Colegio de Martilleros y Corredores Públicos de Tierra del Fuego.`, ruta: '/institucional', seccion: 'institucional', cuerpo });
});

/* -------------------------------- Matriculados -------------------------------- */

sitio.get('/matriculados', async (c) => {
  const { cfg } = await contexto(c);
  const [{ n }] = await q(`SELECT count(*)::int AS n FROM matriculados WHERE estado <> 'baja'`);
  const cuerpo = `${encabezado({ titulo: 'Matriculados', grupo: 'Padrón oficial', bajada: 'Consultá el padrón de profesionales, conocé los requisitos para matricularte y accedé a los servicios para matriculados.', migas: [['Matriculados']],
    indice: [['padron', 'Consulta de matrícula'], ['profesion', 'Martillero y corredor'], ['requisitos', 'Requisitos'], ['portal-acceso', 'Portal de autogestión']] })}

<section class="herramienta" aria-labelledby="padron">
  <div class="contenedor">
    <div class="herramienta-cabeza">
      <div>
        <p class="antetitulo antetitulo-claro">Consulta pública</p>
        <h2 id="padron">Consulta de matrícula</h2>
        <p>Buscá por nombre, apellido o número de matrícula.</p>
      </div>
      <div class="aviso aviso-claro">${icono('info', 20)}<div>${formatear(cfg.padron_aviso?.trim() || AVISO_PADRON)}</div></div>
    </div>
    <form id="padron-form" class="padron-form" role="search" aria-label="Buscar en el padrón">
      <div class="campo campo-q"><label for="padron-q">Nombre, apellido o N.º de matrícula</label><input id="padron-q" name="q" type="search" autocomplete="off" maxlength="80"></div>
      <div class="campo"><label for="padron-titulo">Título</label><select id="padron-titulo" name="titulo"><option value="">Todos</option>${Object.entries(TITULOS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div>
      <div class="campo"><label for="padron-estado">Estado</label><select id="padron-estado" name="estado"><option value="">Todos</option><option value="activo">Activa</option><option value="suspendido">Suspendida</option></select></div>
      <button class="btn btn-arena" type="submit">${icono('buscar', 18)} Buscar</button>
    </form>
  </div>
</section>
<section class="seccion seccion-ajustada" aria-label="Resultados del padrón">
  <div class="contenedor resultados-grid">
    <div>
      <p id="padron-info" class="info-resultados" role="status" aria-live="polite">${n ? '' : 'Todavía no hay profesionales cargados en el padrón oficial.'}</p>
      <div class="tabla-envoltura">
        <table>
          <caption class="sr">Resultados del padrón de matriculados</caption>
          <thead><tr><th scope="col">Matrícula</th><th scope="col">Profesional</th><th scope="col">Título</th><th scope="col">Situación</th></tr></thead>
          <tbody id="padron-resultados"><tr><td colspan="4">${n ? 'Cargando padrón…' : 'Sin registros disponibles por el momento.'}</td></tr></tbody>
        </table>
      </div>
      <p class="fuente">Fuente: padrón oficial de la ${DEPARTAMENTAL}. Ante cualquier duda, <a href="/contacto">consultá con la Departamental</a>.</p>
    </div>
    <aside class="panel-lateral" aria-labelledby="leer-titulo">
      <h2 id="leer-titulo" class="antetitulo">Cómo leer el resultado</h2>
      <dl class="glosario">
        <div><dt>${estado('Habilitado', 'ok')}</dt><dd>Matrícula activa y en condiciones de ejercer.</dd></div>
        <div><dt>${estado('No habilitado', 'err')}</dt><dd>Matrícula activa con obligaciones pendientes ante el Colegio.</dd></div>
        <div><dt>${estado('Matrícula suspendida', 'aviso')}</dt><dd>No puede ejercer mientras dure la suspensión.</dd></div>
      </dl>
      <p>¿No figura en el padrón? <a href="/denuncias">Conocé los canales de consulta y denuncia</a>.</p>
    </aside>
  </div>
</section>

<section class="seccion comunidad" aria-labelledby="comunidad-titulo">
  <div class="contenedor comunidad-grid">
    <div class="comunidad-intro">
      <p class="antetitulo antetitulo-claro">Para la comunidad</p>
      <h2 id="comunidad-titulo">Por qué consultar a un profesional matriculado</h2>
      <p>Comprar, vender, alquilar o rematar un bien son decisiones importantes. El Colegio existe para que esas operaciones estén en manos de profesionales habilitados.</p>
      <div class="comunidad-botones"><a class="enlace-claro" href="/denuncias">Consultas y denuncias ${icono('flecha', 16)}</a></div>
    </div>
    <ol class="comunidad-puntos">
      <li><span class="punto-num" aria-hidden="true">01</span><div><h3>Qué hace el Colegio</h3><p>Controla la matrícula y el ejercicio profesional de martilleros y corredores públicos en la provincia, según la Ley Provincial 762.</p></div></li>
      <li><span class="punto-num" aria-hidden="true">02</span><div><h3>Su función institucional</h3><p>Registra a los profesionales habilitados, publica el padrón y recibe las denuncias, que analizan el Tribunal de Disciplina y la Comisión Fiscalizadora.</p></div></li>
      <li><span class="punto-num" aria-hidden="true">03</span><div><h3>Por qué importa</h3><p>Un profesional matriculado acredita título universitario habilitante y responde ante el Colegio por su actuación. Operar con personas sin matrícula genera riesgos, entre ellos tasaciones incorrectas.</p></div></li>
    </ol>
  </div>
</section>

<section class="seccion seccion-blanca" aria-labelledby="profesion">
  <div class="contenedor">
    ${tituloBloque({ antetitulo: 'La profesión', titulo: 'Martillero y corredor no son lo mismo', id: 'profesion' })}
    ${profesion()}
  </div>
</section>

<section class="seccion" aria-labelledby="requisitos">
  <div class="contenedor dos-col">
    <div>
      <span id="matricularse"></span>
      ${tituloBloque({ antetitulo: 'Inscripción', titulo: 'Requisitos para matricularse', id: 'requisitos' })}
      <p class="destacado-texto">Para obtener la matrícula de martillero o de corredor se requiere título universitario habilitante, conforme a la Ley Nacional 20.266 (modificada por la Ley 25.028) y a la Ley Provincial 762.</p>
      <h3 class="h-chica">Requisitos y documentación</h3>
      ${contenido(cfg.matricula_requisitos, 'El detalle de requisitos y documentación está pendiente de carga.')}
      <h3 class="h-chica">Pasos de inscripción</h3>
      ${contenido(cfg.matricula_pasos, 'Los pasos de inscripción están pendientes de carga. Mientras tanto, podés consultar a la Departamental.')}
    </div>
    <aside class="panel-lateral">
      <h2 class="antetitulo">También te puede servir</h2>
      <ul class="lista-enlaces">
        <li><a href="/tramites">${icono('carpeta', 18)} Trámites y formularios</a></li>
        <li><a href="/normativa">${icono('balanza', 18)} Normativa de la profesión</a></li>
        <li><a href="/contacto">${icono('correo', 18)} Consultar sobre matriculación</a></li>
      </ul>
    </aside>
  </div>
</section>

<section class="seccion seccion-ajustada" aria-labelledby="portal-acceso">
  <div class="contenedor">
    <div class="franja-petroleo">
      <div><h2 id="portal-acceso">Portal de autogestión</h2><p>Estado de cuenta, actualización de datos de contacto, constancia de matrícula y credencial digital.</p></div>
      <div class="acciones-fila"><a class="btn btn-arena" href="/portal">${icono('candado', 18)} Ingresar al portal</a><a class="enlace-claro" href="/servicios">Servicios al matriculado ${icono('flecha', 16)}</a></div>
    </div>
  </div>
</section>`;
  return responder(c, cfg, { titulo: 'Matriculados', descripcion: `Padrón oficial y consulta de matrícula de la ${DEPARTAMENTAL}, diferencias entre martillero y corredor y requisitos para matricularse.`, ruta: '/matriculados', seccion: 'matriculados', cuerpo });
});

/* ---------------------------------- Trámites ---------------------------------- */

sitio.get('/tramites', async (c) => {
  const { cfg } = await contexto(c);
  const formularios = ordenarDocs(await q(`SELECT * FROM normativas WHERE categoria IN ('formulario','modelo')`));
  const pagoOnline = Boolean(ENV.MP_ACCESS_TOKEN);
  const procedimientos: [string, string, string][] = [
    ['Inscripción en la matrícula', 'carpeta', `<p>Requiere título universitario habilitante de martillero o corredor. Consultá los requisitos y pasos de inscripción.</p><p><a class="leer-mas" href="/matriculados#requisitos">Ver requisitos ${icono('flecha', 16)}</a></p>`],
    ['Actualización de datos de contacto', 'usuario', `<p>Los profesionales matriculados pueden actualizar su correo, teléfono y domicilio profesional desde el Portal de Autogestión.</p><p><a class="leer-mas" href="/portal">Ingresar al portal ${icono('flecha', 16)}</a></p>`],
    ['Constancia de matrícula y credencial', 'documento', `<p>Desde el Portal de Autogestión se descargan la constancia de matrícula y la credencial digital, de carácter informativo.</p><p><a class="leer-mas" href="/portal">Ingresar al portal ${icono('flecha', 16)}</a></p>`],
    ['Pago de la cuota societaria', 'maletin', pagoOnline
      ? `<p>La cuota se puede abonar con Mercado Pago desde el Portal de Autogestión.</p>`
      : `<p>El estado de cuenta se consulta en el Portal de Autogestión. ${estado('Pago online pendiente', 'aviso')} Mientras tanto, consultá los medios de pago con la Departamental.</p>`],
    ['Consultas y denuncias', 'alerta', `<p>Las denuncias por irregularidades se presentan por el canal oficial del Colegio.</p><p><a class="leer-mas" href="/denuncias">Ver canales ${icono('flecha', 16)}</a></p>`],
  ];
  const cuerpo = `${encabezado({ titulo: 'Trámites', grupo: 'Matriculados', bajada: 'Procedimientos ante la Departamental, formularios y documentación para descargar.', migas: [['Trámites']],
    indice: [['procedimientos', 'Procedimientos'], ['formularios', 'Formularios y modelos'], ['documentacion', 'Documentación']] })}
<section class="seccion" aria-labelledby="procedimientos">
  <div class="contenedor dos-col">
    <div>
      ${tituloBloque({ antetitulo: 'Paso a paso', titulo: 'Procedimientos', id: 'procedimientos' })}
      <div class="acordeon">${procedimientos.map(([t, ic, html], i) => `<details${i === 0 ? ' open' : ''}><summary><span class="acordeon-ico">${icono(ic, 20)}</span><span>${t}</span>${icono('chevron', 18)}</summary><div class="acordeon-cuerpo">${html}</div></details>`).join('')}</div>
      ${cfg.tramites?.trim() ? `<h3 class="h-chica separado">Otros trámites ante la Departamental</h3>${contenido(cfg.tramites)}` : `<div class="separado">${pendiente('El detalle de otros trámites ante la Departamental (plazos, costos y lugares de presentación) está pendiente de carga.')}</div>`}
    </div>
    <aside class="panel-lateral" aria-labelledby="formularios">
      <h2 id="formularios" class="antetitulo">Formularios y modelos de notas</h2>
      ${formularios.length ? docsLista(formularios) : '<p class="pendiente-breve">Los formularios y modelos de notas se publicarán a medida que la Departamental los apruebe.</p>'}
      <a class="leer-mas" href="/normativa">Ver toda la documentación ${icono('flecha', 16)}</a>
    </aside>
  </div>
</section>
<section class="seccion seccion-piedra" aria-labelledby="documentacion">
  <div class="contenedor">
    ${tituloBloque({ antetitulo: 'Antes de presentarte', titulo: 'Documentación', id: 'documentacion', bajada: 'Información de referencia para preparar tus trámites.' })}
    <div class="dos-col dos-col-parejo">
      <div><h3 class="h-chica">Para la matriculación</h3>${contenido(cfg.matricula_requisitos, 'El listado de documentación para matricularse está pendiente de carga.')}</div>
      <div><h3 class="h-chica">¿Tenés dudas?</h3><p>Escribinos desde el formulario de contacto indicando el trámite que necesitás realizar.</p><a class="btn btn-linea" href="/contacto">Hacer una consulta</a></div>
    </div>
  </div>
</section>`;
  return responder(c, cfg, { titulo: 'Trámites', descripcion: `Procedimientos, formularios y documentación para trámites ante la ${DEPARTAMENTAL}.`, ruta: '/tramites', seccion: 'matriculados', cuerpo });
});

/* -------------------------------- Normativa -------------------------------- */

sitio.get('/normativa', async (c) => {
  const { cfg } = await contexto(c);
  const docs = ordenarDocs(await q('SELECT * FROM normativas'));
  const conDatos = ORDEN_CAT.filter((k) => docs.some((d) => d.categoria === k));
  const sinDatos = ['resolucion', 'reglamento', 'circular', 'formulario', 'modelo'].filter((k) => !conDatos.includes(k));
  const cuerpo = `${encabezado({ titulo: 'Normativa', grupo: 'Marco legal', bajada: 'Leyes, resoluciones y reglamentos que regulan el ejercicio profesional de martilleros y corredores.', migas: [['Normativa']] })}
<section class="seccion" aria-label="Documentos">
  <div class="contenedor normativa-grid">
    <aside class="normativa-filtros" aria-label="Filtrar documentos">
      <div class="campo"><label for="docs-q">Buscar</label><input id="docs-q" type="search" autocomplete="off" placeholder="Ej.: Ley 762, corretaje"></div>
      <p class="antetitulo">Categorías</p>
      <div class="filtros-vertical" role="group" aria-label="Categorías">
        <button type="button" class="filtro" data-cat="" aria-pressed="true">Todas <span>${docs.length}</span></button>
        ${conDatos.map((k) => `<button type="button" class="filtro" data-cat="${k}" aria-pressed="false">${CATEGORIAS_DOC[k]} <span>${docs.filter((d) => d.categoria === k).length}</span></button>`).join('')}
      </div>
      ${sinDatos.length ? `<p class="pendiente-breve">${icono('reloj', 16)} Pendientes de carga: ${sinDatos.map((k) => CATEGORIAS_DOC[k].toLowerCase()).join(', ')}.</p>` : ''}
    </aside>
    <div>
      <p id="docs-info" class="info-resultados" role="status" aria-live="polite">${docs.length} documento${docs.length === 1 ? '' : 's'}</p>
      ${docs.length ? `<div id="docs">${conDatos.map((k) => `<section class="grupo-docs" data-grupo="${k}" aria-labelledby="grupo-${k}"><h2 id="grupo-${k}" class="grupo-titulo">${CATEGORIAS_DOC[k]}</h2>${docsLista(docs.filter((d) => d.categoria === k))}</section>`).join('')}</div>` : pendiente('Todavía no hay documentos publicados.')}
      <p id="docs-vacio" class="pendiente" hidden>${icono('info', 18)}<span>No hay documentos que coincidan con la búsqueda.</span></p>
    </div>
  </div>
</section>`;
  return responder(c, cfg, { titulo: 'Normativa', descripcion: 'Ley Provincial 762, Ley Nacional 20.266, Código Civil y Comercial, resoluciones y reglamentos para martilleros y corredores.', ruta: '/normativa', seccion: 'normativa', cuerpo });
});

/* -------------------------------- Novedades -------------------------------- */

const FILTROS_NOV: [string, string][] = [['', 'Todas'], ['noticia', 'Noticias'], ['comunicado', 'Comunicados'], ['reunion', 'Actividades']];
const POR_PAGINA = 9;

sitio.get('/novedades', async (c) => {
  const cat = c.req.query('categoria') ?? '';
  if (cat === 'capacitaciones' || CATEGORIAS_CAPACITACION.includes(cat)) return c.redirect('/capacitaciones', 301);
  const { cfg } = await contexto(c);
  const pag = Math.max(1, Number(c.req.query('pagina')) || 1);
  let where = 'publicado_en <= now()';
  const params: unknown[] = [];
  if (cat in CATEGORIAS_NOVEDAD) { params.push(cat); where += ` AND COALESCE(categoria,'noticia') = $1`; }
  const [[{ total }], items] = await Promise.all([
    q(`SELECT count(*)::int AS total FROM novedades WHERE ${where}`, params),
    q(`SELECT ${NOV} FROM novedades WHERE ${where} ORDER BY publicado_en DESC LIMIT ${POR_PAGINA} OFFSET ${(pag - 1) * POR_PAGINA}`, params),
  ]);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const link = (p: number) => {
    const qs = new URLSearchParams({ ...(cat ? { categoria: cat } : {}), ...(p > 1 ? { pagina: String(p) } : {}) }).toString();
    return qs ? `/novedades?${qs}` : '/novedades';
  };
  const nombreFiltro = FILTROS_NOV.find(([k]) => k === cat)?.[1];
  const [primera, ...resto] = pag === 1 ? items : [null, ...items];

  const cuerpo = `${encabezado({ titulo: 'Novedades', grupo: 'Actualidad', bajada: 'Noticias, comunicados y actividades de la Departamental.', migas: [['Novedades', '/novedades'], ...(cat && nombreFiltro ? [[nombreFiltro]] as [string][] : [])] })}
<section class="seccion" aria-label="Publicaciones">
  <div class="contenedor">
    <nav class="filtros" aria-label="Filtrar novedades">
      ${FILTROS_NOV.map(([k, t]) => `<a class="chip" href="${k ? `/novedades?categoria=${k}` : '/novedades'}"${k === cat || (!cat && !k) ? ' aria-current="page"' : ''}>${t}</a>`).join('')}
      <a class="chip chip-enlace" href="/capacitaciones">${icono('capacitacion', 16)} Capacitaciones</a>
    </nav>
    ${!items.length ? pendiente('No hay publicaciones en esta categoría por el momento.') : ''}
    ${primera ? `<article class="nota-destacada nota-destacada-ancha">
      <div class="nota-destacada-media" aria-hidden="true">${primera.imagen_id ? `<img src="/archivos/${primera.imagen_id}" alt="" width="960" height="600">` : `<span class="sin-img sin-img-grande">${icono(ICONO_CATEGORIA[primera.categoria ?? 'noticia'] ?? 'documento', 44)}<span>${esc(categoriaNovedad(primera.categoria))}</span></span>`}</div>
      <div class="nota-destacada-cuerpo">
        <p class="meta"><span class="etiqueta">${esc(categoriaNovedad(primera.categoria))}</span>${fechaNovedad(primera)}</p>
        <h2><a href="${urlNovedad(primera)}">${esc(primera.titulo)}</a></h2>
        <p>${esc(resumenNovedad(primera, 260))}</p>
        ${leerMas(primera)}
      </div>
    </article>` : ''}
    ${resto.length ? `<div class="grilla-notas">${resto.map((n) => tarjetaNovedad(n, 2)).join('')}</div>` : ''}
    ${paginas > 1 ? `<nav class="paginacion" aria-label="Paginación">
      ${pag > 1 ? `<a class="btn btn-linea" href="${link(pag - 1)}" rel="prev">Más recientes</a>` : '<span></span>'}
      <span>Página ${pag} de ${paginas}</span>
      ${pag < paginas ? `<a class="btn btn-linea" href="${link(pag + 1)}" rel="next">Anteriores</a>` : '<span></span>'}
    </nav>` : ''}
  </div>
</section>`;
  return responder(c, cfg, { titulo: nombreFiltro && cat ? `${nombreFiltro} — Novedades` : 'Novedades', descripcion: `Noticias, comunicados y actividades de la ${DEPARTAMENTAL} del Colegio de Martilleros y Corredores Públicos de Tierra del Fuego.`, ruta: link(pag), seccion: 'actualidad', cuerpo });
});

sitio.get('/novedades/:clave', async (c) => {
  const { cfg, base } = await contexto(c);
  const id = parseInt(c.req.param('clave'), 10);
  const [n] = id ? await q(`SELECT ${NOV} FROM novedades WHERE id = $1 AND publicado_en <= now()`, [id]) : [];
  if (!n) return noEncontrado(c);
  const canonica = urlNovedad(n);
  if (c.req.path !== canonica) return c.redirect(canonica, 301);
  const esCapacitacion = CATEGORIAS_CAPACITACION.includes(n.categoria);
  const otras = await q(`SELECT ${NOV} FROM novedades WHERE id <> $1 AND publicado_en <= now() ORDER BY publicado_en DESC LIMIT 3`, [n.id]);
  const ficha = [
    n.fecha_evento && `<div><dt>${icono('calendario', 18)} Fecha</dt><dd>${fechaHora(n.fecha_evento)}</dd></div>`,
    n.lugar && `<div><dt>${icono('ubicacion', 18)} Lugar</dt><dd>${esc(n.lugar)}</dd></div>`,
  ].filter(Boolean).join('');

  const cuerpo = `<article class="articulo">
  <header class="articulo-cabeza">
    <div class="contenedor contenedor-texto">
      <nav class="migas" aria-label="Ruta de navegación"><ol><li><a href="/">Inicio</a></li><li><a href="${esCapacitacion ? '/capacitaciones' : '/novedades'}">${esCapacitacion ? 'Capacitaciones' : 'Novedades'}</a></li><li><span aria-current="page">${esc(n.titulo)}</span></li></ol></nav>
      <p class="meta"><span class="etiqueta">${esc(categoriaNovedad(n.categoria))}</span>Publicado el ${fechaNovedad(n)}</p>
      <h1>${esc(n.titulo)}</h1>
      ${n.resumen ? `<p class="bajada">${esc(n.resumen)}</p>` : ''}
    </div>
  </header>
  <div class="contenedor contenedor-texto articulo-cuerpo">
    ${n.imagen_id ? `<figure class="articulo-img"><img src="/archivos/${n.imagen_id}" alt="${esc(n.imagen_alt ?? '')}" width="1200" height="750"></figure>` : ''}
    ${ficha ? `<dl class="ficha">${ficha}</dl>` : ''}
    <div class="prosa">${formatear(n.contenido)}</div>
    ${n.enlace && urlValida(n.enlace) ? `<p>${enlaceExterno(n.enlace, `Más información en ${dominio(n.enlace)}`, 'btn btn-linea')}</p>` : ''}
    <p class="volver"><a href="${esCapacitacion ? '/capacitaciones' : '/novedades'}">← Volver a ${esCapacitacion ? 'capacitaciones' : 'novedades'}</a></p>
  </div>
</article>
${otras.length ? `<section class="seccion seccion-piedra" aria-labelledby="otras-titulo"><div class="contenedor">${tituloBloque({ antetitulo: 'Seguí leyendo', titulo: 'Otras publicaciones', id: 'otras-titulo' })}<div class="grilla-notas">${otras.map((o) => tarjetaNovedad(o)).join('')}</div></div></section>` : ''}`;

  return responder(c, cfg, {
    titulo: n.titulo, descripcion: resumenNovedad(n, 160), ruta: canonica, seccion: 'actualidad', cuerpo, tipoOg: 'article',
    imagen: n.imagen_id ? `${base}/archivos/${n.imagen_id}` : undefined,
    jsonld: { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: n.titulo, datePublished: iso(n.publicado_en), ...(n.imagen_id ? { image: `${base}/archivos/${n.imagen_id}` } : {}), publisher: { '@type': 'Organization', name: `${NOMBRE} — ${DEPARTAMENTAL}` } },
  });
});

/* ------------------------------- Capacitaciones ------------------------------- */

sitio.get('/capacitaciones', async (c) => {
  const { cfg } = await contexto(c);
  const [proximas, realizadas] = await Promise.all([
    q(`SELECT ${NOV} FROM novedades WHERE ${CAP_SQL} AND publicado_en <= now() AND fecha_evento >= now() ORDER BY fecha_evento`),
    q(`SELECT ${NOV} FROM novedades WHERE ${CAP_SQL} AND publicado_en <= now() AND (fecha_evento IS NULL OR fecha_evento < now()) ORDER BY COALESCE(fecha_evento, publicado_en) DESC LIMIT 24`),
  ]);
  const item = (n: any) => `<li class="evento">
    ${n.fecha_evento ? bloqueFecha(n.fecha_evento) : `<span class="bloque-fecha bloque-fecha-vacio">${icono('capacitacion', 22)}</span>`}
    <div class="evento-info">
      <p class="meta"><span class="etiqueta">${esc(categoriaNovedad(n.categoria))}</span>${n.fecha_evento ? `<span>${esc(new Date(n.fecha_evento).toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Ushuaia', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))} h</span>` : ''}${n.lugar ? `<span>${icono('ubicacion', 14)} ${esc(n.lugar)}</span>` : ''}</p>
      <h3><a href="${urlNovedad(n)}">${esc(n.titulo)}</a></h3>
      <p>${esc(resumenNovedad(n, 200))}</p>
    </div>
    ${leerMas(n, 'Ver detalle')}
  </li>`;
  const cuerpo = `${encabezado({ titulo: 'Capacitaciones', grupo: 'Actualidad', bajada: 'Cursos, jornadas y eventos de formación profesional para matriculados.', migas: [['Capacitaciones']], indice: [['proximas', 'Próximas'], ['realizadas', 'Realizadas']] })}
<section class="seccion" aria-labelledby="proximas">
  <div class="contenedor">
    ${tituloBloque({ antetitulo: 'Agenda', titulo: 'Próximas capacitaciones', id: 'proximas' })}
    ${proximas.length ? `<ol class="agenda">${proximas.map(item).join('')}</ol>` : `<div class="vacio-agenda">${icono('calendario', 28)}<div><p><strong>No hay capacitaciones programadas por el momento.</strong></p><p>Suscribite a las novedades al pie de la página para recibir la próxima convocatoria.</p></div></div>`}
  </div>
</section>
<section class="seccion seccion-piedra" aria-labelledby="realizadas">
  <div class="contenedor">
    ${tituloBloque({ antetitulo: 'Archivo', titulo: 'Capacitaciones realizadas', id: 'realizadas' })}
    ${realizadas.length ? `<ol class="agenda agenda-pasada">${realizadas.map(item).join('')}</ol>` : pendiente('Todavía no hay capacitaciones anteriores publicadas.')}
  </div>
</section>`;
  return responder(c, cfg, { titulo: 'Capacitaciones', descripcion: `Cursos, jornadas y eventos de formación profesional de la ${DEPARTAMENTAL}.`, ruta: '/capacitaciones', seccion: 'actualidad', cuerpo });
});

/* -------------------------------- Servicios -------------------------------- */

sitio.get('/servicios', async (c) => {
  const { cfg } = await contexto(c);
  const pagoOnline = Boolean(ENV.MP_ACCESS_TOKEN);
  const cuerpo = `${encabezado({ titulo: 'Servicios al matriculado', grupo: 'Matriculados', bajada: 'Herramientas, beneficios y recursos para los profesionales matriculados en la Departamental Río Grande.', migas: [['Matriculados', '/matriculados'], ['Servicios al matriculado']] })}
<section class="seccion" aria-label="Servicios en línea">
  <div class="contenedor servicios-grid">
    <article class="servicio servicio-principal">
      <div class="servicio-cabeza"><span class="acceso-ico">${icono('candado', 24)}</span>${estado('Disponible', 'ok')}</div>
      <h2>Portal de autogestión</h2>
      <p>Ingresá con tu número de matrícula, DNI o correo y la contraseña entregada por la Departamental.</p>
      <ul class="lista-check"><li>${icono('check', 16)} Consultar tu estado de cuenta.</li><li>${icono('check', 16)} Actualizar tus datos de contacto y domicilio profesional.</li><li>${icono('check', 16)} Descargar tu credencial digital y una constancia informativa de matrícula.</li></ul>
      <a class="btn btn-arena" href="/portal">Ingresar al portal</a>
    </article>
    <article class="servicio">
      <div class="servicio-cabeza"><span class="acceso-ico">${icono('maletin', 24)}</span>${pagoOnline ? estado('Disponible', 'ok') : estado('Pendiente', 'aviso')}</div>
      <h2>Pago online de cuotas</h2>
      ${pagoOnline ? '<p>Podés abonar la cuota societaria con Mercado Pago desde el Portal de Autogestión.</p>' : '<p>El pago online se habilitará próximamente. Mientras tanto, consultá los medios de pago con la Departamental; los pagos registrados se reflejan en tu estado de cuenta.</p>'}
    </article>
  </div>
</section>
<section class="seccion seccion-blanca" aria-label="Beneficios y recursos">
  <div class="contenedor tres-col">
    <section aria-labelledby="beneficios"><h2 id="beneficios" class="h-media">Beneficios</h2>${contenido(cfg.servicios_beneficios, 'Los beneficios para matriculados están pendientes de carga.')}</section>
    <section aria-labelledby="convenios"><h2 id="convenios" class="h-media">Convenios</h2>${contenido(cfg.servicios_convenios, 'Los convenios vigentes están pendientes de carga.')}</section>
    <section aria-labelledby="consultas"><h2 id="consultas" class="h-media">Consultas administrativas</h2>${cfg.servicios_consultas?.trim() ? contenido(cfg.servicios_consultas) : '<p>Para consultas sobre cuotas, matrícula o trámites, escribí a la Departamental desde la sección de contacto.</p>'}<a class="leer-mas" href="/contacto">Hacer una consulta ${icono('flecha', 16)}</a></section>
  </div>
</section>
<section class="seccion" aria-labelledby="recursos">
  <div class="contenedor">
    ${tituloBloque({ antetitulo: 'Recursos profesionales', titulo: 'Normas de consulta frecuente', id: 'recursos' })}
    ${marcoLegal()}
  </div>
</section>`;
  return responder(c, cfg, { titulo: 'Servicios al matriculado', descripcion: 'Portal de autogestión, beneficios, convenios, consultas administrativas y recursos profesionales para matriculados de Río Grande.', ruta: '/servicios', seccion: 'matriculados', cuerpo });
});

/* ---------------------------------- CO.FE.CI. ---------------------------------- */

sitio.get('/cofeci', async (c) => {
  const { cfg } = await contexto(c);
  const cuerpo = `${encabezado({ titulo: 'CO.FE.CI.', grupo: 'Institucional', bajada: 'Consejo Federal de Colegios Inmobiliarios de la República Argentina.', migas: [['Institucional', '/institucional'], ['CO.FE.CI.']] })}
<section class="seccion" aria-label="Información">
  <div class="contenedor dos-col">
    <div class="prosa prosa-grande">
      <p>El Consejo Federal de Colegios Inmobiliarios (CO.FE.CI.) reúne a los colegios profesionales de corredores inmobiliarios de todo el país.</p>
      <p>El Colegio de Martilleros y Corredores de Tierra del Fuego forma parte del Consejo. Desde su sitio oficial se difunden las actividades, convenios, campañas y novedades del sector inmobiliario a nivel federal.</p>
    </div>
    <aside class="panel-lateral panel-petroleo" aria-labelledby="canales">
      <h2 id="canales" class="antetitulo antetitulo-claro">Canales oficiales</h2>
      <p class="panel-titulo">cofeci.com.ar</p>
      <p>Sitio oficial del Consejo Federal de Colegios Inmobiliarios.</p>
      ${enlaceExterno(COFECI_URL, 'Visitar el sitio oficial', 'btn btn-arena')}
      <p class="fuente">Más información sobre la participación del Colegio en el ${enlaceExterno(`${SITIO_PROVINCIAL}co-fe-ci/`, 'sitio del Colegio provincial')}.</p>
    </aside>
  </div>
</section>`;
  return responder(c, cfg, { titulo: 'CO.FE.CI.', descripcion: 'Presentación del Consejo Federal de Colegios Inmobiliarios y enlaces a sus canales oficiales.', ruta: '/cofeci', seccion: 'institucional', cuerpo });
});

/* ---------------------------------- Contacto ---------------------------------- */

sitio.get('/contacto', async (c) => {
  const { cfg } = await contexto(c);
  const wa = (cfg.contacto_whatsapp ?? '').replace(/\D/g, '');
  const datos = [
    ['ubicacion', 'Ubicación', `${cfg.contacto_direccion ? `${esc(cfg.contacto_direccion)}, ` : ''}Río Grande, Tierra del Fuego${cfg.contacto_direccion ? `<br>${enlaceExterno(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cfg.contacto_direccion}, Río Grande, Tierra del Fuego`)}`, 'Ver en el mapa')}` : '<br><span class="pendiente-breve">Dirección exacta pendiente de confirmación.</span>'}`],
    cfg.contacto_email && ['correo', 'Correo electrónico', `<a href="mailto:${esc(cfg.contacto_email)}">${esc(cfg.contacto_email)}</a>`],
    cfg.contacto_telefono && ['telefono', 'Teléfono', `<a href="tel:${esc(cfg.contacto_telefono.replace(/[^\d+]/g, ''))}">${esc(cfg.contacto_telefono)}</a>`],
    wa.length >= 10 && ['chat', 'WhatsApp', enlaceExterno(`https://wa.me/${wa}`, 'Escribir por WhatsApp')],
    cfg.contacto_horario && ['reloj', 'Horario de atención', esc(cfg.contacto_horario)],
  ].filter(Boolean) as [string, string, string][];
  const faltan = [!cfg.contacto_email && 'correo', !cfg.contacto_telefono && 'teléfono', !cfg.contacto_horario && 'horarios'].filter(Boolean);

  const cuerpo = `${encabezado({ titulo: 'Contacto', grupo: 'Atención', bajada: `Canales de atención de la ${DEPARTAMENTAL}.`, migas: [['Contacto']] })}
<section class="seccion" aria-label="Contacto">
  <div class="contenedor contacto-grid">
    <div class="contacto-datos">
      <h2 class="antetitulo">Datos de contacto</h2>
      <ul class="datos-contacto">${datos.map(([ic, t, v]) => `<li><span class="acceso-ico">${icono(ic, 20)}</span><div><strong>${t}</strong><span>${v}</span></div></li>`).join('')}</ul>
      ${faltan.length ? `<p class="pendiente-breve">${icono('reloj', 16)} Pendientes de confirmación: ${faltan.join(', ')}.</p>` : ''}
      <div class="aviso aviso-info">${icono('alerta', 20)}<p>¿Querés denunciar a un profesional o a alguien que opera sin matrícula? Usá el <a href="/denuncias">canal oficial de denuncias</a>. Este formulario es solo para consultas.</p></div>
    </div>
    <form class="formulario" data-api="/api/contacto" data-exito="Recibimos tu consulta. La Departamental te responderá al correo indicado." novalidate aria-labelledby="form-titulo">
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
      <button class="btn btn-petroleo" type="submit">Enviar consulta</button>
      <div class="form-estado" role="status" aria-live="polite" hidden></div>
    </form>
  </div>
</section>`;
  return responder(c, cfg, { titulo: 'Contacto', descripcion: `Ubicación, correo, teléfono, horarios y formulario de consultas de la ${DEPARTAMENTAL}.`, ruta: '/contacto', seccion: 'contacto', cuerpo });
});

/* ---------------------------- Consultas y denuncias ---------------------------- */

sitio.get('/denuncias', async (c) => {
  const { cfg } = await contexto(c);
  const motivos = ['Ejercicio de la profesión sin matrícula.', 'Cobro indebido o excesivo de honorarios o comisiones.', 'Retención de dinero, depósitos o señas.', 'Incumplimiento de contratos u obligaciones profesionales.', 'Publicidad engañosa.', 'Faltas de ética o malos tratos.'];
  const cuerpo = `${encabezado({ titulo: 'Consultas y denuncias', grupo: 'Atención', bajada: 'Elegí el canal que corresponde a tu situación.', migas: [['Contacto', '/contacto'], ['Consultas y denuncias']] })}
<section class="seccion" aria-label="Canales">
  <div class="contenedor caminos">
    <article class="camino">
      <span class="acceso-ico">${icono('chat', 26)}</span>
      <h2>Quiero hacer una consulta</h2>
      <p>Dudas sobre la matrícula, trámites, capacitaciones u otros temas institucionales. La Departamental te responde por correo electrónico.</p>
      <a class="btn btn-linea" href="/contacto">Ir al formulario de contacto</a>
    </article>
    <article class="camino camino-petroleo">
      <span class="acceso-ico">${icono('escudo', 26)}</span>
      <h2>Quiero presentar una denuncia</h2>
      <p>Irregularidades de un martillero, un corredor, una inmobiliaria o de alguien que opera sin matrícula. Se presentan por el formulario oficial del Colegio.</p>
      ${enlaceExterno(DENUNCIAS_OFICIAL, 'Ir al formulario oficial de denuncias', 'btn btn-arena')}
    </article>
  </div>
</section>
<section class="seccion seccion-blanca" aria-labelledby="como">
  <div class="contenedor dos-col">
    <div>
      ${tituloBloque({ antetitulo: 'Procedimiento', titulo: 'Cómo se tramita una denuncia', id: 'como' })}
      <ol class="pasos">
        <li><h3>Completás el formulario oficial</h3><p>Con la mayor cantidad de datos y pruebas posibles: contratos, recibos o capturas.</p></li>
        <li><h3>Recibís un número de expediente</h3><p>Te llega por correo electrónico para que puedas hacer el seguimiento.</p></li>
        <li><h3>El Colegio interviene</h3><p>El Tribunal de Disciplina y la Comisión Fiscalizadora analizan el caso.</p></li>
      </ol>
    </div>
    <aside class="panel-lateral" aria-labelledby="motivos">
      <h2 id="motivos" class="antetitulo">Qué se puede denunciar</h2>
      <ul class="lista-check">${motivos.map((m) => `<li>${icono('check', 16)} ${m}</li>`).join('')}</ul>
    </aside>
  </div>
</section>
<section class="seccion seccion-ajustada" aria-label="Antes de operar">
  <div class="contenedor">
    <div class="franja-petroleo">
      <div><h2>Antes de operar, verificá la matrícula</h2><p>Consultá el padrón antes de firmar un contrato o entregar dinero.</p></div>
      <a class="btn btn-arena" href="/matriculados#padron">${icono('buscar', 18)} Consultar el padrón</a>
    </div>
    <p class="aviso aviso-info">${icono('candado', 20)}<span>Este sitio no recibe denuncias ni documentación. Para proteger tus datos, no envíes información sensible por el formulario de contacto.</span></p>
  </div>
</section>`;
  return responder(c, cfg, { titulo: 'Consultas y denuncias', descripcion: 'Canales para consultas institucionales y para denunciar irregularidades de martilleros, corredores o personas que operan sin matrícula.', ruta: '/denuncias', seccion: 'contacto', cuerpo });
});

/* --------------------------------- Privacidad --------------------------------- */

sitio.get('/privacidad', async (c) => {
  const { cfg } = await contexto(c);
  const cuerpo = `${encabezado({ titulo: 'Privacidad y datos personales', bajada: 'Cómo usamos los datos que nos dejás en este sitio.', migas: [['Privacidad']] })}
<section class="seccion"><div class="contenedor contenedor-texto"><div class="prosa">
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
</div></div></section>`;
  return responder(c, cfg, { titulo: 'Privacidad y datos personales', ruta: '/privacidad', cuerpo });
});

/* ------------------------------ Portal y admin ------------------------------ */

sitio.get('/portal', async (c) => {
  const { cfg } = await contexto(c);
  const cuerpo = `${encabezado({ titulo: 'Portal de autogestión', grupo: 'Matriculados', bajada: 'Espacio exclusivo para profesionales matriculados en la Departamental Río Grande.', migas: [['Matriculados', '/matriculados'], ['Portal de autogestión']] })}
<section class="seccion"><div class="contenedor">
  <div id="vista-login" class="login-caja" hidden>
    <form id="form-login" class="formulario" novalidate>
      <h2>Ingresar</h2>
      <p class="ayuda">Usá tu número de matrícula, DNI o correo y la contraseña que te entregó la Departamental.</p>
      <div class="campo"><label for="usuario">Usuario</label><input id="usuario" name="usuario" required autocomplete="username"></div>
      <div class="campo"><label for="password">Contraseña</label><input id="password" name="password" type="password" required autocomplete="current-password"></div>
      <button class="btn btn-petroleo btn-bloque" type="submit">Ingresar</button>
      <div id="login-msg" class="form-estado" role="status" aria-live="polite" hidden></div>
      <p class="ayuda">¿Olvidaste tu contraseña? <a href="/contacto">Solicitá una nueva a la Departamental</a>.</p>
    </form>
  </div>

  <div id="vista-panel" hidden>
    <div class="panel-cabeza">
      <div><h2 id="saludo"></h2><p class="meta" id="sub-saludo"></p></div>
      <div class="acciones-fila">
        <a class="btn btn-petroleo" href="/api/portal/certificado" id="btn-cert">${icono('descargar', 18)} Constancia de matrícula (PDF)</a>
        <a class="btn btn-arena" href="/api/portal/credencial" id="btn-cred">${icono('descargar', 18)} Credencial digital (PDF)</a>
        <button type="button" class="btn btn-linea" id="salir">Cerrar sesión</button>
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
      <h2 id="cuenta-titulo" class="h-media">Estado de cuenta — Cuota societaria</h2>
      <div class="tabla-envoltura"><table><thead><tr><th scope="col">Período</th><th scope="col">Vencimiento</th><th scope="col">Monto</th><th scope="col">Estado</th><th scope="col"><span class="sr">Acciones</span></th></tr></thead><tbody id="cuotas"></tbody></table></div>
      <p class="ayuda" id="nota-pago"></p>
    </section>
    <div class="grilla grilla-2">
      <form id="form-datos" class="formulario" novalidate>
        <h2 class="h-media">Mis datos de contacto</h2>
        <div class="campo"><label for="d-email">Correo electrónico</label><input id="d-email" name="email" type="email" required autocomplete="email"></div>
        <div class="campo"><label for="d-telefono">Teléfono</label><input id="d-telefono" name="telefono" type="tel" autocomplete="tel"></div>
        <div class="campo"><label for="d-domicilio">Domicilio profesional</label><input id="d-domicilio" name="domicilio_profesional" autocomplete="street-address"></div>
        <button class="btn btn-petroleo" type="submit">Guardar cambios</button>
        <div id="datos-msg" class="form-estado" role="status" aria-live="polite" hidden></div>
      </form>
      <form id="form-pass" class="formulario" novalidate>
        <h2 class="h-media">Cambiar contraseña</h2>
        <div class="campo"><label for="p-actual">Contraseña actual</label><input id="p-actual" name="actual" type="password" required autocomplete="current-password"></div>
        <div class="campo"><label for="p-nueva">Nueva contraseña <span class="opcional">(mínimo 8 caracteres)</span></label><input id="p-nueva" name="nueva" type="password" minlength="8" required autocomplete="new-password"></div>
        <button class="btn btn-petroleo" type="submit">Actualizar contraseña</button>
        <div id="pass-msg" class="form-estado" role="status" aria-live="polite" hidden></div>
      </form>
    </div>
  </div>
</div></section>`;
  return responder(c, cfg, { titulo: 'Portal de autogestión', ruta: '/portal', seccion: 'matriculados', cuerpo, noindex: true, sinSuscripcion: true, scripts: ['/static/js/comun.js', '/static/js/portal.js'] });
});

sitio.get('/admin', async (c) => {
  const { cfg } = await contexto(c);
  const pestanas: [string, string][] = [
    ['novedades', 'Novedades'], ['documentos', 'Documentos'], ['contenidos', 'Contenidos'], ['autoridades', 'Autoridades'],
    ['mensajes', 'Mensajes'], ['suscriptores', 'Suscriptores'], ['matriculados', 'Matriculados'], ['cuotas', 'Cuotas'],
  ];
  const cuerpo = `<section class="seccion"><div class="contenedor">
  <div id="vista-login" class="login-caja" hidden>
    <form id="form-login" class="formulario" novalidate>
      <h1 class="h2">Administración</h1>
      <p class="ayuda">Acceso exclusivo para la Comisión Directiva de la Departamental.</p>
      <div class="campo"><label for="pw">Contraseña</label><input id="pw" name="password" type="password" required autocomplete="current-password"></div>
      <button class="btn btn-petroleo btn-bloque" type="submit">Ingresar</button>
      <div id="login-msg" class="form-estado" role="status" aria-live="polite" hidden></div>
    </form>
  </div>
  <div id="vista-panel" hidden>
    <div class="panel-cabeza"><h1 class="h2">Panel de administración</h1><div class="acciones-fila"><a class="btn btn-linea" href="/" target="_blank" rel="noopener">Ver sitio</a><button type="button" class="btn btn-linea" id="salir">Cerrar sesión</button></div></div>
    <p class="ayuda">Las capacitaciones se cargan como novedades con categoría <strong>Curso</strong>, <strong>Jornada</strong> o <strong>Evento</strong> y una fecha de evento; aparecen automáticamente en la agenda.</p>
    <div id="msg" class="form-estado" role="status" aria-live="polite" hidden></div>
    <div class="panel-tabs" role="tablist" aria-label="Secciones de administración">
      ${pestanas.map(([id, t], i) => `<button type="button" role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ''}>${t}<span class="contador" data-contador="${id}"></span></button>`).join('')}
    </div>
    ${pestanas.map(([id], i) => `<section role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}"${i ? ' hidden' : ''}></section>`).join('')}
  </div>
</div></section>`;
  return responder(c, cfg, { titulo: 'Administración', ruta: '/admin', cuerpo, noindex: true, sinSuscripcion: true, scripts: ['/static/js/comun.js', '/static/js/admin.js'] });
});

/* ------------------------------ SEO y redirecciones ------------------------------ */

sitio.get('/robots.txt', (c) => c.text(`User-agent: *\nDisallow: /admin\nDisallow: /portal\nDisallow: /api/\nSitemap: ${baseUrl(c)}/sitemap.xml\n`));

sitio.get('/sitemap.xml', async (c) => {
  const base = baseUrl(c);
  const novedades = await q('SELECT id, titulo, publicado_en FROM novedades WHERE publicado_en <= now() ORDER BY publicado_en DESC LIMIT 500');
  const urls = ['/', '/institucional', '/matriculados', '/tramites', '/normativa', '/novedades', '/capacitaciones', '/servicios', '/cofeci', '/contacto', '/denuncias', '/privacidad']
    .map((u) => `<url><loc>${base}${u}</loc></url>`)
    .concat(novedades.map((n) => `<url><loc>${base}${urlNovedad(n)}</loc><lastmod>${iso(n.publicado_en).slice(0, 10)}</lastmod></url>`));
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`, 200, { 'Content-Type': 'application/xml; charset=utf-8' });
});

for (const [viejo, nuevo] of [['/index.html', '/'], ['/portal.html', '/portal'], ['/admin.html', '/admin'], ['/consultas-y-denuncias', '/denuncias'], ['/consultas', '/denuncias']])
  sitio.get(viejo, (c) => c.redirect(nuevo + (new URL(c.req.url).search), 301));

export async function noEncontrado(c: any) {
  const { cfg } = await contexto(c);
  const cuerpo = `<section class="seccion"><div class="contenedor contenedor-texto error-404">
  <p class="antetitulo">Error 404</p>
  <h1>No encontramos esta página</h1>
  <p class="bajada">Es posible que la dirección haya cambiado o que el contenido ya no esté disponible.</p>
  <p class="acciones-fila"><a class="btn btn-petroleo" href="/">Ir al inicio</a><a class="btn btn-linea" href="/matriculados#padron">Consultar matrícula</a><a class="btn btn-linea" href="/contacto">Contacto</a></p>
</div></section>`;
  return responder(c, cfg, { titulo: 'Página no encontrada', ruta: c.req.path, cuerpo, noindex: true }, 404);
}
