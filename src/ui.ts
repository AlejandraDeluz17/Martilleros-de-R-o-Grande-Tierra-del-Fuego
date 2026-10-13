import { esc, fecha, iso, urlNovedad, formatear } from './util';
import { CATEGORIAS_NOVEDAD } from './db';

// Íconos de trazo fino (24×24), siempre decorativos
const TRAZOS: Record<string, string> = {
  buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  documento: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>',
  carpeta: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 13h8"/>',
  balanza: '<path d="M12 3v18M6 21h12M4 7h16"/><path d="M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z"/>',
  capacitacion: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6"/>',
  correo: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  escudo: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  alerta: '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/>',
  telefono: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  ubicacion: '<path d="M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  externo: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  descargar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  flecha: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  maletin: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  red: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14a5 5 0 0 1 5 5"/>',
  megafono: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M17 9a4 4 0 0 1 0 6M20 6a8 8 0 0 1 0 12"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  edificio: '<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6M9 11h.01M15 11h.01"/>',
  lista: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
};

export const icono = (nombre: string, t = 20) =>
  `<svg class="ico" width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${TRAZOS[nombre] ?? ''}</svg>`;

export const CATEGORIAS_CAPACITACION = ['curso', 'jornada', 'evento'];
export const ICONO_CATEGORIA: Record<string, string> = {
  noticia: 'documento', comunicado: 'megafono', curso: 'capacitacion', jornada: 'capacitacion', reunion: 'red', evento: 'calendario',
};

export const PENDIENTE = 'Información pendiente de confirmación por la Departamental.';
export const pendiente = (texto = PENDIENTE) =>
  `<p class="pendiente">${icono('reloj', 18)}<span><strong>Pendiente de carga.</strong> ${esc(texto)}</span></p>`;
export const contenido = (valor: string | undefined, textoPendiente?: string) =>
  valor?.trim() ? `<div class="prosa">${formatear(valor)}</div>` : pendiente(textoPendiente);

export const enlaceExterno = (href: string, texto: string, clase = '') =>
  `<a href="${esc(href)}" target="_blank" rel="noopener"${clase ? ` class="${clase}"` : ''}>${esc(texto)} ${icono('externo', 14)}<span class="sr"> (se abre en una pestaña nueva)</span></a>`;

// Encabezado de páginas internas: claro, con migas, título, bajada y accesos "en esta página"
export function encabezado(o: { titulo: string; bajada?: string; grupo?: string; migas: [string, string?][]; indice?: [string, string][] }) {
  const items = [['Inicio', '/'] as [string, string?], ...o.migas].map(([t, h], i, a) =>
    i === a.length - 1 || !h ? `<li><span aria-current="page">${esc(t)}</span></li>` : `<li><a href="${h}">${esc(t)}</a></li>`).join('');
  return `<header class="cabeza-pagina">
  <div class="contenedor">
    <nav class="migas" aria-label="Ruta de navegación"><ol>${items}</ol></nav>
    <div class="cabeza-pagina-grid">
      <div>
        ${o.grupo ? `<p class="antetitulo">${esc(o.grupo)}</p>` : ''}
        <h1>${esc(o.titulo)}</h1>
        ${o.bajada ? `<p class="bajada">${esc(o.bajada)}</p>` : ''}
      </div>
      ${o.indice?.length ? `<nav class="en-pagina" aria-label="En esta página"><p>En esta página</p><ul>${o.indice.map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join('')}</ul></nav>` : ''}
    </div>
  </div>
</header>`;
}

export const tituloBloque = (o: { antetitulo?: string; titulo: string; bajada?: string; id?: string; nivel?: number }) => {
  const n = o.nivel ?? 2;
  return `<div class="titulo-bloque">${o.antetitulo ? `<p class="antetitulo">${esc(o.antetitulo)}</p>` : ''}<h${n}${o.id ? ` id="${o.id}"` : ''}>${esc(o.titulo)}</h${n}>${o.bajada ? `<p>${esc(o.bajada)}</p>` : ''}</div>`;
};

export const categoriaNovedad = (c: string | null) => CATEGORIAS_NOVEDAD[c ?? 'noticia'] ?? 'Noticia';

export function resumenNovedad(n: any, max = 180) {
  if (n.resumen) return n.resumen;
  const t = String(n.contenido ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, '')}…` : t;
}

export const fechaNovedad = (n: any) => `<time datetime="${iso(n.publicado_en)}">${fecha(n.publicado_en)}</time>`;
export const leerMas = (n: any, texto = 'Leer más') =>
  `<a class="leer-mas" href="${urlNovedad(n)}">${texto}<span class="sr">: ${esc(n.titulo)}</span> ${icono('flecha', 16)}</a>`;

// Tarjeta de novedad para grillas (imagen opcional)
export function tarjetaNovedad(n: any, nivel = 3) {
  const media = n.imagen_id
    ? `<img src="/archivos/${n.imagen_id}" alt="" loading="lazy" width="640" height="400">`
    : `<span class="sin-img">${icono(ICONO_CATEGORIA[n.categoria ?? 'noticia'] ?? 'documento', 30)}</span>`;
  return `<article class="nota">
  <div class="nota-media" aria-hidden="true">${media}</div>
  <div class="nota-cuerpo">
    <p class="meta"><span class="etiqueta">${esc(categoriaNovedad(n.categoria))}</span>${fechaNovedad(n)}</p>
    <h${nivel}><a href="${urlNovedad(n)}" class="enlace-nota">${esc(n.titulo)}</a></h${nivel}>
    <p>${esc(resumenNovedad(n))}</p>
    <span class="leer-mas" aria-hidden="true">Leer más ${icono('flecha', 16)}</span>
  </div>
</article>`;
}

// Bloque de fecha (día grande + mes) para agenda de capacitaciones
export function bloqueFecha(d: unknown) {
  const f = new Date(d as string);
  const tz = { timeZone: 'America/Argentina/Ushuaia' } as const;
  const dia = f.toLocaleDateString('es-AR', { ...tz, day: '2-digit' });
  const mes = f.toLocaleDateString('es-AR', { ...tz, month: 'short' }).replace('.', '');
  const anio = f.toLocaleDateString('es-AR', { ...tz, year: 'numeric' });
  return `<time class="bloque-fecha" datetime="${iso(d)}"><span class="dia">${dia}</span><span class="mes">${esc(mes)}</span><span class="anio">${anio}</span></time>`;
}

export const estado = (texto: string, tipo: 'ok' | 'err' | 'aviso' | 'neutro') => `<span class="estado estado-${tipo}">${esc(texto)}</span>`;
