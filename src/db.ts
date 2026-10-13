import { SQL } from 'bun';
import { ENV, LEY_762_URL, LEY_20266_URL, CCYCN_URL } from './util';

export const sql = new SQL(ENV.DATABASE_URL);
export const q = <T = any>(text: string, params: unknown[] = []) => sql.unsafe(text, params as any[]) as Promise<T[]>;
export const esUnico = (e: any) => e?.errno === '23505' || e?.code === '23505';

/* ------------------------------- Catálogos ------------------------------- */

export const CATEGORIAS_NOVEDAD: Record<string, string> = {
  noticia: 'Noticia', comunicado: 'Comunicado', curso: 'Curso', jornada: 'Jornada', reunion: 'Reunión', evento: 'Evento',
};
// Orden en que se muestran las categorías de documentos
export const CATEGORIAS_DOC: Record<string, string> = {
  ley: 'Leyes', decreto: 'Decretos', resolucion: 'Resoluciones', reglamento: 'Reglamentos', etica: 'Código de ética',
  circular: 'Circulares', formulario: 'Formularios', modelo: 'Modelos de notas',
};
export const TITULOS: Record<string, string> = {
  martillero_corredor: 'Martillero y Corredor', martillero: 'Martillero', corredor: 'Corredor',
};
export const ORGANOS = ['Consejo Directivo', 'Tribunal de Disciplina', 'Comisión Revisora de Cuentas', 'Delegados y representantes'];
export const ASUNTOS = ['Consulta general', 'Matriculación', 'Trámites', 'Capacitaciones', 'Otro'];

export type Contenido = { clave: string; grupo: string; etiqueta: string; tipo: 'texto' | 'linea' | 'email' | 'url' | 'imagen'; ayuda?: string };
// Textos y datos institucionales editables desde Administración → Contenidos
export const CONTENIDOS: Contenido[] = [
  { clave: 'inicio_presentacion', grupo: 'Inicio', etiqueta: 'Presentación de la Departamental (portada)', tipo: 'texto', ayuda: 'Si queda vacío se muestra un texto institucional general.' },
  { clave: 'historia', grupo: 'Institucional', etiqueta: 'Historia', tipo: 'texto' },
  { clave: 'mision', grupo: 'Institucional', etiqueta: 'Misión', tipo: 'texto' },
  { clave: 'objetivos', grupo: 'Institucional', etiqueta: 'Objetivos', tipo: 'texto', ayuda: 'Una línea por objetivo, comenzando con "- ".' },
  { clave: 'funciones', grupo: 'Institucional', etiqueta: 'Funciones', tipo: 'texto', ayuda: 'Si queda vacío se muestran las funciones generales del Colegio publicadas en el sitio provincial.' },
  { clave: 'comisiones', grupo: 'Institucional', etiqueta: 'Comisiones', tipo: 'texto' },
  { clave: 'departamental_datos', grupo: 'Institucional', etiqueta: 'Datos de la Departamental Río Grande', tipo: 'texto' },
  { clave: 'padron_aviso', grupo: 'Matriculados', etiqueta: 'Aviso sobre el padrón', tipo: 'texto', ayuda: 'Si queda vacío se informa que el padrón está en actualización.' },
  { clave: 'matricula_requisitos', grupo: 'Matriculados', etiqueta: 'Requisitos para matricularse', tipo: 'texto' },
  { clave: 'matricula_pasos', grupo: 'Matriculados', etiqueta: 'Pasos de inscripción', tipo: 'texto' },
  { clave: 'tramites', grupo: 'Matriculados', etiqueta: 'Trámites ante la Departamental', tipo: 'texto' },
  { clave: 'servicios_beneficios', grupo: 'Servicios', etiqueta: 'Beneficios para matriculados', tipo: 'texto' },
  { clave: 'servicios_convenios', grupo: 'Servicios', etiqueta: 'Convenios', tipo: 'texto' },
  { clave: 'servicios_consultas', grupo: 'Servicios', etiqueta: 'Consultas administrativas', tipo: 'texto' },
  { clave: 'contacto_direccion', grupo: 'Contacto', etiqueta: 'Dirección', tipo: 'linea', ayuda: 'Calle y número. Se completa automáticamente con "Río Grande, Tierra del Fuego".' },
  { clave: 'contacto_email', grupo: 'Contacto', etiqueta: 'Correo electrónico', tipo: 'email' },
  { clave: 'contacto_telefono', grupo: 'Contacto', etiqueta: 'Teléfono', tipo: 'linea' },
  { clave: 'contacto_whatsapp', grupo: 'Contacto', etiqueta: 'WhatsApp', tipo: 'linea', ayuda: 'Solo números, con código de país y área. Ej.: 549 + código de área + número.' },
  { clave: 'contacto_horario', grupo: 'Contacto', etiqueta: 'Horario de atención', tipo: 'linea' },
  { clave: 'redes_facebook', grupo: 'Contacto', etiqueta: 'Facebook de la Departamental (URL)', tipo: 'url' },
  { clave: 'redes_instagram', grupo: 'Contacto', etiqueta: 'Instagram de la Departamental (URL)', tipo: 'url' },
  { clave: 'logo_id', grupo: 'Imágenes', etiqueta: 'Logotipo oficial', tipo: 'imagen', ayuda: 'PNG o WEBP con fondo transparente, cuadrado, de al menos 256 px.' },
  { clave: 'portada_id', grupo: 'Imágenes', etiqueta: 'Imagen de portada (Río Grande / Tierra del Fuego)', tipo: 'imagen', ayuda: 'Foto horizontal de al menos 1600 px de ancho, con permiso de uso.' },
  { clave: 'portada_alt', grupo: 'Imágenes', etiqueta: 'Descripción de la imagen de portada (texto alternativo)', tipo: 'linea' },
  { clave: 'portada_credito', grupo: 'Imágenes', etiqueta: 'Crédito de la foto de portada', tipo: 'linea' },
];

export async function leerConfig(): Promise<Record<string, string>> {
  const rows = await q<{ clave: string; valor: string }>('SELECT clave, valor FROM config');
  return Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
}

/* ------------------------------- Migraciones ------------------------------- */
// Todas son idempotentes y aditivas: no borran datos existentes.

export async function migrar() {
  const pasos = [
    `CREATE TABLE IF NOT EXISTS personas (
      id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, apellido TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE, creado_en TIMESTAMPTZ NOT NULL DEFAULT now())`,
    `ALTER TABLE personas ADD COLUMN IF NOT EXISTS acepta_privacidad BOOLEAN NOT NULL DEFAULT false`,

    `CREATE TABLE IF NOT EXISTS matriculados (
      id SERIAL PRIMARY KEY, matricula TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL, apellido TEXT NOT NULL,
      dni TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, telefono TEXT, domicilio_profesional TEXT,
      localidad TEXT NOT NULL DEFAULT 'Río Grande',
      estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','suspendido','baja')),
      fecha_alta DATE NOT NULL DEFAULT CURRENT_DATE, password_hash TEXT NOT NULL,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now())`,
    `ALTER TABLE matriculados ADD COLUMN IF NOT EXISTS titulo TEXT`,

    `CREATE TABLE IF NOT EXISTS cuotas (
      id SERIAL PRIMARY KEY, matriculado_id INTEGER NOT NULL REFERENCES matriculados(id) ON DELETE CASCADE,
      periodo TEXT NOT NULL, monto NUMERIC(12,2) NOT NULL, vencimiento DATE NOT NULL,
      pagada BOOLEAN NOT NULL DEFAULT false, fecha_pago TIMESTAMPTZ, medio_pago TEXT,
      UNIQUE (matriculado_id, periodo))`,

    `CREATE TABLE IF NOT EXISTS archivos (
      id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, tipo TEXT NOT NULL, tamano INTEGER NOT NULL,
      datos BYTEA NOT NULL, creado_en TIMESTAMPTZ NOT NULL DEFAULT now())`,

    `CREATE TABLE IF NOT EXISTS novedades (
      id SERIAL PRIMARY KEY, titulo TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'comunicado' CHECK (tipo IN ('comunicado','asamblea','legal','circular')),
      contenido TEXT NOT NULL, publicado_en TIMESTAMPTZ NOT NULL DEFAULT now())`,
    `ALTER TABLE novedades
      ADD COLUMN IF NOT EXISTS categoria TEXT,
      ADD COLUMN IF NOT EXISTS resumen TEXT,
      ADD COLUMN IF NOT EXISTS imagen_id INTEGER REFERENCES archivos(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS imagen_alt TEXT,
      ADD COLUMN IF NOT EXISTS fecha_evento TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS lugar TEXT,
      ADD COLUMN IF NOT EXISTS destacado BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS enlace TEXT`,
    `UPDATE novedades SET categoria = CASE tipo WHEN 'asamblea' THEN 'reunion' WHEN 'legal' THEN 'noticia' ELSE 'comunicado' END
      WHERE categoria IS NULL`,

    `CREATE TABLE IF NOT EXISTS normativas (
      id SERIAL PRIMARY KEY, categoria TEXT NOT NULL, titulo TEXT NOT NULL, descripcion TEXT, url TEXT,
      orden INTEGER NOT NULL DEFAULT 0)`,
    `ALTER TABLE normativas DROP CONSTRAINT IF EXISTS normativas_categoria_check`,
    `ALTER TABLE normativas
      ADD COLUMN IF NOT EXISTS fecha DATE,
      ADD COLUMN IF NOT EXISTS archivo_id INTEGER REFERENCES archivos(id) ON DELETE SET NULL`,

    `CREATE TABLE IF NOT EXISTS autoridades (
      id SERIAL PRIMARY KEY, cargo TEXT NOT NULL, nombre TEXT NOT NULL, orden INTEGER NOT NULL DEFAULT 0)`,
    `ALTER TABLE autoridades
      ADD COLUMN IF NOT EXISTS organo TEXT NOT NULL DEFAULT 'Consejo Directivo',
      ADD COLUMN IF NOT EXISTS mandato TEXT`,

    `CREATE TABLE IF NOT EXISTS config (
      clave TEXT PRIMARY KEY, valor TEXT NOT NULL DEFAULT '', actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now())`,

    `CREATE TABLE IF NOT EXISTS mensajes (
      id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, email TEXT NOT NULL, telefono TEXT, asunto TEXT NOT NULL,
      mensaje TEXT NOT NULL, leido BOOLEAN NOT NULL DEFAULT false, creado_en TIMESTAMPTZ NOT NULL DEFAULT now())`,
  ];
  for (const p of pasos) await q(p);

  // Normativa verificada en las fuentes oficiales (Legislatura de TDF y argentina.gob.ar)
  await q(`INSERT INTO normativas (categoria, titulo, descripcion, url, orden)
    SELECT 'ley', 'Ley Provincial 762 — Ejercicio profesional de martilleros y corredores',
      'Año 2007. Regula el ejercicio profesional de martilleros y corredores públicos en Tierra del Fuego, Antártida e Islas del Atlántico Sur y crea el Colegio. Texto publicado por la Legislatura provincial.',
      $1, 0
    WHERE NOT EXISTS (SELECT 1 FROM normativas WHERE titulo ILIKE '%762%')`, [LEY_762_URL]);
  await q(`INSERT INTO normativas (categoria, titulo, descripcion, url, orden)
    SELECT 'ley', 'Ley Nacional 20.266 — Martilleros y Corredores', 'Año 1973.', $1, 1
    WHERE NOT EXISTS (SELECT 1 FROM normativas WHERE titulo ILIKE 'Ley Nacional 20.266%')`, [LEY_20266_URL]);
  await q(`UPDATE normativas SET descripcion = 'Año 1973. Régimen nacional de martilleros y corredores, con las modificaciones introducidas por la Ley 25.028 (1999). Texto actualizado en el sitio oficial de normativa nacional.'
    WHERE titulo ILIKE 'Ley Nacional 20.266%' AND descripcion = 'Año 1973.'`);
  await q(`UPDATE normativas SET url = $1,
      descripcion = 'Año 1973. Régimen nacional de martilleros y corredores, con las modificaciones introducidas por la Ley 25.028 (1999). Texto actualizado en el sitio oficial de normativa nacional.'
    WHERE titulo ILIKE 'Ley Nacional 20.266%' AND url IS NULL`, [LEY_20266_URL]);
  await q(`UPDATE normativas SET descripcion = 'Año 1999. Modifica la Ley 20.266. Sus cambios están incorporados en el texto actualizado de la Ley 20.266.'
    WHERE titulo = 'Ley Nacional 25.028' AND descripcion = 'Modificatoria de la Ley 20.266.'`);
  await q(`INSERT INTO normativas (categoria, titulo, descripcion, url, orden)
    SELECT 'ley', 'Código Civil y Comercial de la Nación — Contrato de corretaje',
      'Artículos 1345 a 1355: obligaciones del corredor, comisión y prohibiciones.', $1, 3
    WHERE NOT EXISTS (SELECT 1 FROM normativas WHERE titulo ILIKE 'Código Civil y Comercial%')`, [CCYCN_URL]);

  // Noticia publicada en el sitio oficial del Colegio provincial
  await q(`INSERT INTO novedades (titulo, tipo, categoria, resumen, contenido, enlace, publicado_en)
    SELECT 'Jura en Río Grande: nueve profesionales se incorporaron a la matrícula', 'comunicado', 'noticia',
      'La Departamental Río Grande tomó juramento a nueve profesionales en la Cámara de Comercio, Industria y Producción de Río Grande.',
      $1, $2, '2026-04-07T12:00:00-03:00'
    WHERE NOT EXISTS (SELECT 1 FROM novedades WHERE titulo ILIKE 'Jura en Río Grande%')`, [
    'El 7 de abril de 2026 la Departamental Río Grande del Colegio realizó una jura de profesionales en la Cámara de Comercio, Industria y Producción de Río Grande, en la que nueve profesionales prestaron juramento.\n\nDurante el acto se advirtió sobre las personas que operan sin matrícula, una práctica que genera, entre otros problemas, tasaciones incorrectas.\n\nFuente: sitio oficial del Colegio de Martilleros y Corredores de Tierra del Fuego.',
    'https://colegiodemartillerosycorredores.ar/2026/04/07/jura-departamental-rio-grande-abril-2026/',
  ]);
}
