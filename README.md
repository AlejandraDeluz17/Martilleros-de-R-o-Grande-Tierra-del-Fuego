# Colegio de Martilleros y Corredores Públicos de Tierra del Fuego — Departamental Río Grande

Sitio institucional de la Departamental Río Grande del Colegio de Martilleros y Corredores Públicos de Tierra del Fuego, Antártida e Islas del Atlántico Sur.

En producción: https://martilleros-rio-grande.up.railway.app

## Secciones

| Ruta | Contenido |
|---|---|
| `/` | Portada: presentación con foto de Río Grande, consulta de matrícula, accesos de interés, actualidad institucional (nota destacada + secundarias + próximas capacitaciones) e información para la comunidad |
| `/institucional` | Historia, misión y objetivos, funciones, autoridades, comisiones y datos de la Departamental |
| `/matriculados` | Padrón oficial y consulta de matrícula, diferencias entre martillero y corredor y requisitos |
| `/tramites` | Procedimientos, formularios y modelos de notas para descargar y documentación |
| `/normativa` | Leyes, resoluciones, reglamentos y demás documentos, con filtro por categoría y búsqueda |
| `/novedades` | Noticias, comunicados y actividades; `/novedades/<id>-<titulo>` abre cada publicación |
| `/capacitaciones` | Agenda de cursos, jornadas y eventos (próximos y realizados) |
| `/servicios` | Portal de autogestión, pago online (pendiente), beneficios, convenios, consultas y recursos |
| `/cofeci` | Presentación del Consejo Federal de Colegios Inmobiliarios y su sitio oficial |
| `/contacto` | Datos confirmados y formulario de consultas (se guardan en la base) |
| `/denuncias` | Consultas y denuncias: derivación al formulario de contacto o al formulario oficial de denuncias |
| `/portal` | Portal de autogestión para matriculados |
| `/admin` | Administración de contenidos |

La suscripción a novedades (nombre, apellido y correo) está en el pie de todas las páginas.

La foto de portada por defecto es una vista aérea de una avenida de Río Grande (`public/static/img/portada-avenida.jpg`), ampliada 2× con interpolación bicúbica y enfoque suave a partir de un original de 678 × 362 px. Para reemplazarla por una foto oficial en mejor resolución, usá Administración → Contenidos → Imágenes; el crédito se completa en el mismo lugar o en `FOTO_PORTADA.credito` (`src/util.ts`).

Todo el contenido institucional (textos, contacto, logo, foto de portada, autoridades, novedades y documentos) se carga desde `/admin`, sin tocar el código. Si un dato no está cargado, el sitio muestra "Información pendiente de confirmación" en lugar de inventarlo.

## Tecnología

- [Bun](https://bun.sh) + [Hono](https://hono.dev): el servidor genera el HTML de cada página.
- PostgreSQL (`Bun.sql`): datos, contenidos y archivos subidos (imágenes y PDF, hasta 8 MB).
- `pdfkit`: constancia de matrícula y credencial digital del portal.
- Sin frameworks en el navegador: HTML, CSS y JavaScript livianos en `public/static/`.

```
src/server.ts   Arranque, cabeceras de seguridad y archivos estáticos
src/db.ts       Conexión, migraciones (idempotentes) y catálogos de contenidos
src/pages.ts    Páginas públicas, portal y administración
src/layout.ts   Encabezado, menú, pie y metadatos (SEO)
src/ui.ts       Íconos y componentes reutilizables
src/api.ts      API pública, del portal y de la administración
src/pdf.ts      Documentos PDF del portal
public/static/  CSS, JavaScript e imágenes
```

## Despliegue (Railway)

El servicio se construye con el `Dockerfile` y se publica automáticamente con cada cambio en la rama `main`. Las tablas se crean o actualizan solas al iniciar.

### Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | Secreto aleatorio para firmar las sesiones |
| `ADMIN_PASSWORD` | Contraseña del panel de administración |
| `MP_ACCESS_TOKEN` | (Opcional) Token de Mercado Pago para habilitar el pago online de cuotas |
| `PUBLIC_URL` | (Opcional) URL pública definitiva, si se usa un dominio propio |

Nunca subas estas claves al repositorio: se configuran solo en Railway.
