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

## Discrepancia onDelete — TypeORM vs. esquema real (2026-09-07)

**Hallazgo:** `base_datos_cine_ia.sql` no declara `ON DELETE` en NINGUNA
foreign key del esquema (`REFERENCES tabla(columna)` simple, sin cláusula).
Postgres usa su default (`NO ACTION`) en las 16 FK del esquema — verificado
con:
```sql
SELECT conrelid::regclass, confdeltype FROM pg_constraint WHERE contype = 'f';
```
Todas dan `confdeltype = 'a'` (NO ACTION).

Las entidades TypeORM de la Fase 0, en cambio, declaraban `onDelete:
'CASCADE'`, `'SET NULL'` o `'RESTRICT'` en varias relaciones, asumiendo un
comportamiento que la base real nunca tuvo (`synchronize: false` significa
que esos decoradores nunca se aplicaron al esquema — son documentación,
no DDL real). Se corrigieron TODAS a `'NO ACTION'` para que el código
describa la base real.

**Por qué importa** (no es solo cosmético): para `RESTRICT` → `NO ACTION`
el comportamiento es equivalente (ambos bloquean un DELETE con referencias
activas), pero para los casos que decían `CASCADE` o `SET NULL` el
comportamiento real es DISTINTO — Postgres rechaza el DELETE (23503) en vez
de limpiar/desvincular solo:

| Relación | Decía (Fase 0) | Es en realidad | Impacto |
|---|---|---|---|
| `promocion_funcion` → `promociones`/`funciones` | CASCADE | NO ACTION | **Corregido**: `PromocionesService.eliminar` borra la asociación en una transacción antes de borrar la promoción. |
| `funciones.id_precio` → `precios` | SET NULL | NO ACTION | **Corregido**: `PreciosService.eliminar` rechaza con 409 si alguna función referencia el precio. |
| `ventas.id_promocion` → `promociones` | SET NULL | NO ACTION | **Corregido**: `PromocionesService.eliminar` rechaza con 409 si alguna venta usó la promoción. |
| `disponibilidad_asiento.id_funcion` → `funciones` | CASCADE | NO ACTION | **Pendiente** (dominio de Luis Blanco, módulo `funciones` sin construir todavía): si `FuncionesService` necesita borrar físicamente una función con disponibilidad ya generada, tiene que limpiar esas filas primero en una transacción, no confiar en cascada. |
| `detalle_venta_entradas.id_venta` → `ventas` | CASCADE | NO ACTION | **Pendiente** (dominio de Luis Blanco, módulo `ventas` sin construir): mismo caso, si se borra una venta con detalle ya generado. |
| `interacciones_ia.id_funcion` → `funciones` | SET NULL | NO ACTION | **Pendiente** (dominio de Roly, `ia-gateway`/interacciones sin construir): borrar una función con interacciones registradas rechazaría, no desvincularía. |
| `ventas.id_usuario_cliente` → `usuarios` | SET NULL | NO ACTION | **Pendiente** (dominio de Roly, CRUD de `usuarios` sin construir): borrar un usuario con ventas asociadas necesita el mismo chequeo que `PreciosService`/`PromocionesService`. |

**Regla general para el resto del equipo:** ninguna FK de este esquema
cascadea ni desvincula sola. Antes de implementar un `eliminar()`/`cancelar()`
que haga un DELETE físico, comprobar con `pg_constraint` qué tablas
referencian la entidad y decidir explícitamente: (a) rechazar con 409 si hay
referencias (patrón `peliculas`/`salas`/`precios`/`promociones`), o (b)
limpiar las filas dependientes dentro de una transacción antes del DELETE
(patrón `promocion_funcion` en `PromocionesService.eliminar`). Nunca asumir
que Postgres lo hace solo.

## Próximos cambios de esquema (pendientes, no ejecutados)

Ninguno todavía. Cuando Luis Ángel, Luis Blanco o Roly necesiten un campo o
índice nuevo en la Fase 1, se documenta acá antes de escribir la migración,
con el nombre de archivo (`docs/migrations/00X_descripcion.sql`) y la
justificación del patrón de acceso que la motiva.
