import { esc, ENV, NOMBRE, DEPARTAMENTAL, SITIO_PROVINCIAL, COFECI_URL, LEY_762_URL, urlValida } from './util';
import { icono, enlaceExterno } from './ui';

export interface Pagina {
  titulo: string;
  descripcion?: string;
  ruta: string;
  seccion?: string;
  cuerpo: string;
  cfg: Record<string, string>;
  base: string;
  scripts?: string[];
  noindex?: boolean;
  imagen?: string;
  tipoOg?: 'website' | 'article';
  jsonld?: unknown;
  sinSuscripcion?: boolean;
}

type Sub = [titulo: string, href: string, detalle: string];
type ItemMenu = { id: string; t: string; h: string; sub?: Sub[] };

// Navegación principal: 7 entradas, con submenús para agrupar las 10 secciones
export const MENU: ItemMenu[] = [
  { id: 'inicio', t: 'Inicio', h: '/' },
  { id: 'institucional', t: 'Institucional', h: '/institucional', sub: [
    ['Historia y misión', '/institucional#historia', 'Origen y propósito del Colegio'],
    ['Funciones', '/institucional#funciones', 'Qué hace el Colegio'],
    ['Autoridades', '/institucional#autoridades', 'Consejo Directivo y órganos'],
    ['CO.FE.CI.', '/cofeci', 'Consejo Federal de Colegios Inmobiliarios'],
  ] },
  { id: 'matriculados', t: 'Matriculados', h: '/matriculados', sub: [
    ['Padrón y consulta de matrícula', '/matriculados#padron', 'Verificá a un profesional'],
    ['Requisitos para matricularse', '/matriculados#requisitos', 'Título, documentación y pasos'],
    ['Servicios al matriculado', '/servicios', 'Beneficios, convenios y recursos'],
    ['Portal de autogestión', '/portal', 'Estado de cuenta y credencial'],
  ] },
  { id: 'tramites', t: 'Trámites', h: '/tramites' },
  { id: 'normativa', t: 'Normativa', h: '/normativa' },
  { id: 'actualidad', t: 'Actualidad', h: '/novedades', sub: [
    ['Novedades', '/novedades', 'Noticias, comunicados y actividades'],
    ['Capacitaciones', '/capacitaciones', 'Cursos, jornadas y eventos'],
  ] },
  { id: 'contacto', t: 'Contacto', h: '/contacto', sub: [
    ['Contacto', '/contacto', 'Datos y formulario de consultas'],
    ['Consultas y denuncias', '/denuncias', 'Canales institucionales'],
  ] },
];

const v = (ruta: string) => `${ruta}?v=${ENV.VERSION}`;

export const logo = (cfg: Record<string, string>, clase = 'marca-logo') =>
  cfg.logo_id
    ? `<img class="${clase}" src="/archivos/${esc(cfg.logo_id)}" alt="" width="52" height="52">`
    : `<span class="marca-sello" aria-hidden="true"><span>CM</span></span>`;

function nav(seccion?: string, ruta?: string) {
  return MENU.map((m) => {
    const actual = m.id === seccion ? ` aria-current="${ruta === m.h ? 'page' : 'true'}"` : '';
    if (!m.sub) return `<li class="nav-li"><a class="nav-a" href="${m.h}"${actual}>${m.t}</a></li>`;
    const id = `sub-${m.id}`;
    return `<li class="nav-li tiene-sub">
      <div class="nav-item"><a class="nav-a" href="${m.h}"${actual}>${m.t}</a><button type="button" class="sub-toggle" aria-expanded="false" aria-controls="${id}"><span class="sr">Mostrar opciones de ${m.t}</span>${icono('chevron', 15)}</button></div>
      <ul class="sub" id="${id}">${m.sub.map(([t, h, d]) => `<li><a href="${h}"><span class="sub-t">${t}</span><span class="sub-d">${d}</span></a></li>`).join('')}</ul>
    </li>`;
  }).join('');
}

// Suscripción a novedades (registro de personas): presente en el pie de todas las páginas
function suscripcion() {
  const id = 'sus';
  return `<form class="pie-suscripcion" data-api="/api/personas" data-exito="¡Listo! Te sumamos a la lista de novedades de la Departamental." novalidate aria-labelledby="${id}-titulo">
  <div class="pie-suscripcion-texto">
    <h2 id="${id}-titulo">Recibí las novedades de la Departamental</h2>
    <p>Comunicados, capacitaciones y actividades en tu correo. Podés darte de baja cuando quieras.</p>
  </div>
  <div class="pie-suscripcion-campos">
    <div class="campo"><label for="${id}-nombre">Nombre</label><input id="${id}-nombre" name="nombre" required maxlength="80" autocomplete="given-name" aria-describedby="${id}-nombre-error"><p class="error-campo" id="${id}-nombre-error" hidden></p></div>
    <div class="campo"><label for="${id}-apellido">Apellido</label><input id="${id}-apellido" name="apellido" required maxlength="80" autocomplete="family-name" aria-describedby="${id}-apellido-error"><p class="error-campo" id="${id}-apellido-error" hidden></p></div>
    <div class="campo campo-ancho"><label for="${id}-email">Correo electrónico</label><input id="${id}-email" name="email" type="email" required maxlength="120" autocomplete="email" aria-describedby="${id}-email-error"><p class="error-campo" id="${id}-email-error" hidden></p></div>
    <div class="hp" aria-hidden="true"><label for="${id}-sitio">No completar</label><input id="${id}-sitio" name="sitio" tabindex="-1" autocomplete="off"></div>
    <div class="campo campo-ancho">
      <label class="check" for="${id}-acepta"><input id="${id}-acepta" name="acepta" type="checkbox" required aria-describedby="${id}-acepta-error"> <span>Acepto que la Departamental use estos datos solo para enviarme novedades, según la <a href="/privacidad">política de privacidad</a>.</span></label>
      <p class="error-campo" id="${id}-acepta-error" hidden></p>
    </div>
    <div class="campo-ancho"><button class="btn btn-arena" type="submit">Suscribirme</button></div>
    <div class="form-estado campo-ancho" role="status" aria-live="polite" hidden></div>
  </div>
</form>`;
}

function pie(cfg: Record<string, string>, conSuscripcion: boolean) {
  const wa = (cfg.contacto_whatsapp ?? '').replace(/\D/g, '');
  const datos = [
    `<li>${icono('ubicacion', 16)}<span>${cfg.contacto_direccion ? `${esc(cfg.contacto_direccion)}, ` : ''}Río Grande, Tierra del Fuego</span></li>`,
    cfg.contacto_telefono && `<li>${icono('telefono', 16)}<a href="tel:${esc(cfg.contacto_telefono.replace(/[^\d+]/g, ''))}">${esc(cfg.contacto_telefono)}</a></li>`,
    wa.length >= 10 && `<li>${icono('chat', 16)}<a href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp<span class="sr"> (se abre en una pestaña nueva)</span></a></li>`,
    cfg.contacto_email && `<li>${icono('correo', 16)}<a href="mailto:${esc(cfg.contacto_email)}">${esc(cfg.contacto_email)}</a></li>`,
    cfg.contacto_horario && `<li>${icono('reloj', 16)}<span>${esc(cfg.contacto_horario)}</span></li>`,
  ].filter(Boolean);
  const pendienteContacto = !cfg.contacto_telefono && !cfg.contacto_email && !cfg.contacto_direccion;
  const redes = [
    urlValida(cfg.redes_facebook ?? '') && `<li>${enlaceExterno(cfg.redes_facebook, 'Facebook')}</li>`,
    urlValida(cfg.redes_instagram ?? '') && `<li>${enlaceExterno(cfg.redes_instagram, 'Instagram')}</li>`,
  ].filter(Boolean);
  const enlaces: [string, string][] = [
    ['Institucional', '/institucional'], ['Padrón de matriculados', '/matriculados#padron'], ['Trámites', '/tramites'],
    ['Normativa', '/normativa'], ['Novedades', '/novedades'], ['Capacitaciones', '/capacitaciones'],
    ['Servicios al matriculado', '/servicios'], ['Consultas y denuncias', '/denuncias'],
  ];
  return `<footer class="pie">
  ${conSuscripcion ? `<div class="pie-banda"><div class="contenedor">${suscripcion()}</div></div>` : ''}
  <div class="contenedor pie-grid">
    <div class="pie-identidad">
      <p class="pie-marca">${logo(cfg, 'marca-logo')}<span><span class="pie-nombre">Colegio de Martilleros y Corredores Públicos de Tierra del Fuego</span><span class="pie-dep">${DEPARTAMENTAL}</span></span></p>
      <p>Institución profesional creada por la ${enlaceExterno(LEY_762_URL, 'Ley Provincial 762')}. Acompaña a los profesionales matriculados y orienta a la comunidad.</p>
    </div>
    <div>
      <h2>Contacto y ubicación</h2>
      <ul class="pie-datos">${datos.join('')}</ul>
      ${pendienteContacto ? '<p class="pie-nota">Teléfono, correo y horarios: pendientes de confirmación.</p>' : ''}
      <p><a class="pie-link-fuerte" href="/contacto">Escribinos ${icono('flecha', 14)}</a></p>
    </div>
    <nav aria-label="Enlaces del sitio">
      <h2>El sitio</h2>
      <ul class="pie-enlaces">${enlaces.map(([t, h]) => `<li><a href="${h}">${t}</a></li>`).join('')}</ul>
    </nav>
    <div>
      <h2>Enlaces oficiales</h2>
      <ul class="pie-enlaces">
        <li>${enlaceExterno(SITIO_PROVINCIAL, 'Colegio provincial')}</li>
        <li>${enlaceExterno(COFECI_URL, 'CO.FE.CI.')}</li>
        <li>${enlaceExterno(LEY_762_URL, 'Ley Provincial 762')}</li>
      </ul>
      ${redes.length ? `<h2 class="pie-h2-extra">Redes sociales</h2><ul class="pie-enlaces">${redes.join('')}</ul>` : ''}
    </div>
  </div>
  <div class="pie-base">
    <div class="contenedor">
      <p>© ${new Date().getFullYear()} ${DEPARTAMENTAL} · Colegio de Martilleros y Corredores Públicos de Tierra del Fuego</p>
      <p><a href="/privacidad">Privacidad y datos personales</a><span aria-hidden="true"> · </span><a href="/admin">Administración</a></p>
    </div>
  </div>
</footer>`;
}

export function pagina(o: Pagina) {
  const titulo = o.ruta === '/' ? `${DEPARTAMENTAL} — Colegio de Martilleros y Corredores Públicos de Tierra del Fuego` : `${o.titulo} — ${DEPARTAMENTAL} · Colegio de Martilleros TDF`;
  const desc = o.descripcion ?? `Sitio institucional de la ${DEPARTAMENTAL} del Colegio de Martilleros y Corredores Públicos de Tierra del Fuego: consulta de matrícula, trámites, normativa, novedades y capacitaciones.`;
  const canon = o.base + o.ruta;
  const imagen = o.imagen ?? (o.cfg.portada_id ? `${o.base}/archivos/${o.cfg.portada_id}` : `${o.base}/static/img/portada-rio-grande-960.jpg`);
  return `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(desc)}">
${o.noindex ? '<meta name="robots" content="noindex, nofollow">' : `<link rel="canonical" href="${esc(canon)}">`}
<meta property="og:type" content="${o.tipoOg ?? 'website'}">
<meta property="og:locale" content="es_AR">
<meta property="og:site_name" content="Colegio de Martilleros y Corredores Públicos de TDF — ${DEPARTAMENTAL}">
<meta property="og:title" content="${esc(o.titulo)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canon)}">
<meta property="og:image" content="${esc(imagen)}">
<meta name="theme-color" content="#163C46">
<link rel="icon" href="/static/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@500;600;700;800&display=swap">
<link rel="stylesheet" href="${v('/static/css/site.css')}">
${o.jsonld ? `<script type="application/ld+json">${JSON.stringify(o.jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<a class="saltar" href="#contenido">Saltar al contenido</a>
<header class="cabecera" id="cabecera">
  <div class="contenedor cabecera-fila">
    <a class="marca" href="/" aria-label="Inicio — Colegio de Martilleros y Corredores Públicos de Tierra del Fuego, ${DEPARTAMENTAL}">
      ${logo(o.cfg)}
      <span class="marca-texto">
        <span class="marca-nombre">Colegio de Martilleros y Corredores Públicos de Tierra del Fuego</span>
        <span class="marca-sub">Antártida e Islas del Atlántico Sur</span>
        <span class="marca-dep">${DEPARTAMENTAL}</span>
      </span>
    </a>
    <nav class="nav" id="menu-principal" aria-label="Principal">
      <ul class="nav-lista">${nav(o.seccion, o.ruta)}</ul>
      <div class="nav-extra">
        <a href="/portal">${icono('candado', 16)} Portal de matriculados</a>
        <a href="/denuncias">${icono('alerta', 16)} Consultas y denuncias</a>
      </div>
    </nav>
    <a class="btn btn-petroleo btn-matricula" href="/matriculados#padron">${icono('buscar', 17)}<span>Consultar matrícula</span></a>
    <button type="button" class="menu-btn" aria-expanded="false" aria-controls="menu-principal"><span class="ico-abrir">${icono('menu', 22)}</span><span class="ico-cerrar">${icono('cerrar', 22)}</span><span class="sr menu-btn-txt">Menú</span></button>
  </div>
</header>
<main id="contenido" tabindex="-1">
${o.cuerpo}
</main>
${pie(o.cfg, !o.sinSuscripcion)}
<script src="${v('/static/js/site.js')}" defer></script>
${(o.scripts ?? []).map((s) => `<script src="${v(s)}" defer></script>`).join('\n')}
</body>
</html>`;
}
