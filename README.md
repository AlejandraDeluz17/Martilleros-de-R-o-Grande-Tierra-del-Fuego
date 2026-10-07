# Colegio de Martilleros y Corredores Públicos de Tierra del Fuego

Sitio institucional y portal de autogestión para Río Grande, Ushuaia y Tolhuin.

En producción: https://sitio-web-production-ac04.up.railway.app

## Funciones

- **Información institucional**: autoridades, leyes, decretos, código de ética, resoluciones y sedes.
- **Registro de personas** (nombre, apellido y email).
- **Padrón público de matriculados**: búsqueda por nombre, matrícula o DNI, con estado y habilitación.
- **Novedades y circulares** publicadas por la Comisión Directiva.
- **Portal de matriculados** (`/portal.html`): estado de cuenta, pago de cuotas (Mercado Pago, opcional), actualización de datos, certificado de vigencia y credencial en PDF.
- **Administración** (`/admin.html`): personas registradas, matriculados, cuotas, novedades y contenido institucional.

## Estructura

```
function/server.ts   Backend (Bun + Hono + Postgres con Bun.sql)
public/              Frontend (HTML, CSS y JS sin dependencias)
build.ps1            Genera dist/index.tsx embebiendo public/ dentro del backend
dist/index.tsx       Archivo único que se sube a Railway Functions
```

## Despliegue (Railway)

El sitio corre como una **Railway Function** (un único archivo Bun) junto a un servicio **PostgreSQL**.
Las tablas se crean solas al iniciar.

1. Editar `function/server.ts` y/o `public/*`.
2. Ejecutar `powershell -ExecutionPolicy Bypass -File .\build.ps1`.
3. Pegar el contenido de `dist/index.tsx` como código de la función en Railway.

### Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | Secreto aleatorio para firmar las sesiones |
| `ADMIN_PASSWORD` | Contraseña del panel de administración |
| `MP_ACCESS_TOKEN` | (Opcional) Token de Mercado Pago para habilitar el pago online |
| `PUBLIC_URL` | (Opcional) URL pública, si se usa un dominio propio |
