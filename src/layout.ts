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
}

type ItemMenu = { id: string; t: string; h: string; sub?: [string, string][] };
export const MENU: ItemMenu[] = [
  { id: 'inicio', t: 'Inicio', h: '/' },
  { id: 'institucional', t: 'Institucional', h: '/institucional', sub: [
    ['Historia y misión', '/institucional#historia'], ['Funciones', '/institucional#funciones'],
    ['Autoridades', '/institucional#autoridades'], ['Comisiones', '/institucional#comisiones'],
    ['La Departamental Río Grande', '/institucional#departamental'],
  ] },
  { id: 'matriculados', t: 'Matriculados', h: '/matriculados', sub: [
    ['Padrón de matriculados', '/matriculados#padron'], ['Martillero y corredor', '/matriculados#profesion'],
    ['Cómo matricularse', '/matriculados#matricularse'], ['Trámites', '/matriculados#tramites'],
  ] },
  { id: 'normativa', t: 'Normativa', h: '/normativa' },
  { id: 'novedades', t: 'Novedades', h: '/novedades', sub: [
    ['Todas las novedades', '/novedades'], ['Comunicados', '/novedades?categoria=comunicado'],
    ['Capacitaciones', '/novedades?categoria=capacitaciones'], ['Reuniones y eventos', '/novedades?categoria=reunion'],
  ] },
  { id: 'servicios', t: 'Servicios', h: '/servicios', sub: [
    ['Servicios al matriculado', '/servicios'], ['Portal de autogestión', '/portal'],
  ] },
  { id: 'cofeci', t: 'CO.FE.CI.', h: '/cofeci' },
  { id: 'contacto', t: 'Contacto', h: '/contacto' },
  { id: 'denuncias', t: 'Denuncias', h: '/denuncias' },
];

const v = (ruta: string) => `${ruta}?v=${ENV.VERSION}`;

export const logo = (cfg: Record<string, string>, clase = 'marca-logo') =>
  cfg.logo_id
    ? `<img class="${clase}" src="/archivos/${esc(cfg.logo_id)}" alt="" width="56" height="56">`
    : `<span class="marca-sello" aria-hidden="true">CM</span>`;

function nav(seccion?: string, ruta?: string) {
  return MENU.map((m) => {
    const actual = m.id === seccion ? ` aria-current="${ruta === m.h ? 'page' : 'true'}"` : '';
    if (!m.sub) return `<li><a href="${m.h}"${actual}>${m.t}</a></li>`;
    const id = `sub-${m.id}`;
    return `<li class="tiene-sub">
      <div class="nav-item"><a href="${m.h}"${actual}>${m.t}</a><button type="button" class="sub-toggle" aria-expanded="false" aria-controls="${id}"><span class="sr">Mostrar opciones de ${m.t}</span>${icono('chevron', 16)}</button></div>
      <ul class="sub" id="${id}">${m.sub.map(([t, h]) => `<li><a href="${h}">${t}</a></li>`).join('')}</ul>
    </li>`;
  }).join('');
}

function pie(cfg: Record<string, string>) {
  const datos = [
    cfg.contacto_direccion && `<li>${icono('ubicacion', 16)} ${esc(cfg.contacto_direccion)}, Río Grande</li>`,
    cfg.contacto_telefono && `<li>${icono('telefono', 16)} <a href="tel:${esc(cfg.contacto_telefono.replace(/[^\d+]/g, ''))}">${esc(cfg.contacto_telefono)}</a></li>`,
    cfg.contacto_email && `<li>${icono('correo', 16)} <a href="mailto:${esc(cfg.contacto_email)}">${esc(cfg.contacto_email)}</a></li>`,
    cfg.contacto_horario && `<li>${icono('reloj', 16)} ${esc(cfg.contacto_horario)}</li>`,
  ].filter(Boolean);
  const redes = [
    urlValida(cfg.redes_facebook ?? '') && `<li>${enlaceExterno(cfg.redes_facebook, 'Facebook de la Departamental')}</li>`,
    urlValida(cfg.redes_instagram ?? '') && `<li>${enlaceExterno(cfg.redes_instagram, 'Instagram de la Departamental')}</li>`,
  ].filter(Boolean);
  return `<footer class="pie">
  <div class="contenedor pie-grid">
    <div>
      <p class="pie-marca">${logo(cfg, 'marca-logo marca-logo-chico')}<span>Colegio de Martilleros y Corredores Públicos<br><span class="pie-dep">${DEPARTAMENTAL}</span></span></p>
      <p>${NOMBRE}. Creado por la ${enlaceExterno(LEY_762_URL, 'Ley Provincial 762')}.</p>
    </div>
    <nav aria-label="Secciones del sitio">
      <h2>Secciones</h2>
      <ul>${MENU.filter((m) => m.id !== 'inicio').map((m) => `<li><a href="${m.h}">${m.t === 'Normativa' ? 'Normativa y documentación' : m.t === 'Servicios' ? 'Servicios al matriculado' : m.t}</a></li>`).join('')}</ul>
    </nav>
    <div>
      <h2>Contacto</h2>
      ${datos.length ? `<ul class="pie-datos">${datos.join('')}</ul>` : '<p>Datos de contacto pendientes de confirmación.</p>'}
      <p><a href="/contacto">Escribinos ${icono('flecha', 14)}</a></p>
    </div>
    <div>
      <h2>Enlaces oficiales</h2>
      <ul>
        <li>${enlaceExterno(SITIO_PROVINCIAL, 'Colegio provincial')}</li>
        <li>${enlaceExterno(COFECI_URL, 'CO.FE.CI.')}</li>
        ${redes.join('')}
      </ul>
    </div>
  </div>
  <div class="pie-base">
    <div class="contenedor">
      <p>© ${new Date().getFullYear()} ${DEPARTAMENTAL} · Colegio de Martilleros y Corredores Públicos de Tierra del Fuego</p>
      <p><a href="/privacidad">Privacidad y datos personales</a> · <a href="/admin">Administración</a></p>
    </div>
  </div>
</footer>`;
}

export function pagina(o: Pagina) {
  const titulo = o.ruta === '/' ? `${DEPARTAMENTAL} — Colegio de Martilleros y Corredores Públicos de Tierra del Fuego` : `${o.titulo} — ${DEPARTAMENTAL} · Colegio de Martilleros TDF`;
  const desc = o.descripcion ?? `Sitio institucional de la ${DEPARTAMENTAL} del Colegio de Martilleros y Corredores Públicos de Tierra del Fuego: padrón de matriculados, normativa, novedades y servicios.`;
  const canon = o.base + o.ruta;
  const imagen = o.imagen ?? (o.cfg.portada_id ? `${o.base}/archivos/${o.cfg.portada_id}` : '');
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
${imagen ? `<meta property="og:image" content="${esc(imagen)}">` : ''}
<meta name="theme-color" content="#15324B">
<link rel="icon" href="/static/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap">
<link rel="stylesheet" href="${v('/static/css/site.css')}">
${o.jsonld ? `<script type="application/ld+json">${JSON.stringify(o.jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<a class="saltar" href="#contenido">Saltar al contenido</a>
<div class="barra-sup">
  <div class="contenedor">
    <span>Ley Provincial 762 · Tierra del Fuego, Antártida e Islas del Atlántico Sur</span>
    <nav aria-label="Accesos rápidos">
      <a href="/denuncias">${icono('alerta', 15)} Denuncias</a>
      <a href="/portal">${icono('candado', 15)} Portal de matriculados</a>
    </nav>
  </div>
</div>
<header class="cabecera">
  <div class="contenedor cabecera-fila">
    <a class="marca" href="/" aria-label="Inicio — Colegio de Martilleros y Corredores Públicos de Tierra del Fuego, ${DEPARTAMENTAL}">
      ${logo(o.cfg)}
      <span class="marca-texto">
        <span class="marca-nombre">Colegio de Martilleros y Corredores Públicos</span>
        <span class="marca-sub">de Tierra del Fuego, Antártida e Islas del Atlántico Sur</span>
        <span class="marca-dep">${DEPARTAMENTAL}</span>
      </span>
    </a>
    <div class="cabecera-acciones">
      <a class="btn btn-dorado" href="/matriculados#padron">${icono('buscar', 18)} Consultar matrícula</a>
      <a class="btn btn-contorno-claro" href="/contacto">Contacto</a>
    </div>
    <a class="cabecera-rapido" href="/matriculados#padron">${icono('buscar', 20)}<span class="sr">Consultar matrícula</span></a>
    <button type="button" class="menu-btn" aria-expanded="false" aria-controls="menu-principal">${icono('menu', 20)}<span class="menu-btn-txt">Menú</span></button>
  </div>
  <nav class="nav" id="menu-principal" aria-label="Principal">
    <div class="contenedor">
      <ul class="nav-lista">${nav(o.seccion, o.ruta)}</ul>
      <div class="nav-acciones-movil">
        <a class="btn btn-dorado" href="/matriculados#padron">${icono('buscar', 18)} Consultar matrícula</a>
        <a class="btn btn-contorno-claro" href="/contacto">Contacto</a>
      </div>
    </div>
  </nav>
</header>
<main id="contenido" tabindex="-1">
${o.cuerpo}
</main>
${pie(o.cfg)}
<script src="${v('/static/js/site.js')}" defer></script>
${(o.scripts ?? []).map((s) => `<script src="${v(s)}" defer></script>`).join('\n')}
</body>
</html>`;
}
