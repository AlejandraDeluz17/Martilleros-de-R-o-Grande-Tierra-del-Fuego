# Colegio de Martilleros y Corredores Públicos de Tierra del Fuego — Departamental Río Grande

Sitio institucional de la Departamental Río Grande del Colegio de Martilleros y Corredores Públicos de Tierra del Fuego, Antártida e Islas del Atlántico Sur.

## Secciones

| Ruta | Contenido |
|---|---|
| `/` | Portada: presentación, búsqueda de matrícula, accesos rápidos, comunicados destacados, novedades, servicios y suscripción |
| `/institucional` | Historia, misión, objetivos, funciones, autoridades, comisiones y datos de la Departamental |
| `/matriculados` | Padrón consultable, diferencias entre martillero y corredor, requisitos y trámites |
| `/normativa` | Leyes, resoluciones, reglamentos, circulares, formularios y modelos de notas (con filtro y búsqueda) |
| `/novedades` | Noticias, comunicados, cursos, jornadas, reuniones y eventos; `/novedades/<id>-<titulo>` abre cada nota |
| `/servicios` | Portal de autogestión, pago online (pendiente), beneficios, convenios, consultas y recursos |
| `/cofeci` | Presentación del Consejo Federal de Colegios Inmobiliarios y su sitio oficial |
| `/contacto` | Datos confirmados y formulario de consultas (se guardan en la base) |
| `/denuncias` | Explicación del trámite y derivación al formulario oficial del Colegio provincial |
| `/portal` | Portal de autogestión para matriculados |
| `/admin` | Administración de contenidos |

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
