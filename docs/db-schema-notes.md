# Notas de esquema de base de datos

Fuente de verdad: `base_datos_cine_ia.sql` (raíz del proyecto). Este
documento registra decisiones y cambios sobre ese esquema — nunca se edita
el script original in place, ver `.claude/agents/database.md`.

## Fase 0 (2026-09-07)

- **Sin cambios de esquema.** El script original se aplicó tal cual contra
  Postgres local (`Backend/docker-compose.yml`, init automático la primera
  vez que se crea el volumen). Se verificaron manualmente las 13 tablas y
  el constraint `no_solapamiento_sala` (`EXCLUDE USING gist`).
- **Decisión de autenticación**: `usuarios` no tiene columna de contraseña.
  Se optó por login simplificado (`nombre` + `rol` exactos → JWT) para esta
  entrega, en vez de agregar una columna de credencial. Detalle completo en
  `docs/contratos-servicios.md`. Si se decide agregar una contraseña real
  más adelante, es una migración incremental (`ALTER TABLE usuarios ADD
  COLUMN password_hash ...`), no un cambio del script original.
- **Convención de PK confirmada**: `SERIAL`, no `UUID`. Todas las entidades
  TypeORM ya siguen esta convención (`Backend/src/database/entities/`).
- **`funciones.rango_ocupado` no se mapea en TypeORM a propósito** — la
  calcula el trigger `calcular_rango_ocupado()` y nunca se escribe desde la
  aplicación. Si un servicio necesita leerla, se hace con una query raw, no
  agregando la columna a la entidad (ver comentario en `funcion.entity.ts`).

## Próximos cambios de esquema (pendientes, no ejecutados)

Ninguno todavía. Cuando Luisa Ángel, Luis Blanco o Roly necesiten un campo o
índice nuevo en la Fase 1, se documenta acá antes de escribir la migración,
con el nombre de archivo (`docs/migrations/00X_descripcion.sql`) y la
justificación del patrón de acceso que la motiva.
