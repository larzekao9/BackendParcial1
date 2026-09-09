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

## Normalización tipos_asiento — código desincronizado de producción (2026-09-07)

**Hallazgo:** `base_datos_cine_ia_completa.sql` (fuente de verdad actual, ya
aplicada en la Supabase real) normalizó `asientos.tipo` y `precios.tipo_asiento`
(ambas `VARCHAR` libres en el esquema anterior, `base_datos_cine_ia.sql`) a una
FK `id_tipo_asiento` hacia el catálogo `tipos_asiento`. Se verificó contra la
Supabase real con `information_schema.columns`: ninguna de las dos columnas
`VARCHAR` existe ya ahí.

El código (entidades `Asiento`/`Precio`, `PreciosContract`, `PreciosService`,
los DTOs de `precios` y `SalasService.generarAsientos`), committeado en las
fases "Luis Ángel — salas/precios" antes de esa normalización, seguía
escribiendo/leyendo las columnas viejas. Contra la Supabase real esto
rompía en runtime (`column "tipo"`/`"tipo_asiento" does not exist`) en
`POST /salas`, y en todo `/precios` (`getVigente`, `crear`).

**Corregido (2026-09-07):** las cinco piezas de arriba ahora usan
`idTipoAsiento` (FK real). `SalasService` resuelve el id de `'normal'`
consultando el catálogo `tipos_asiento` por `nombre` (nunca un id fijo
hardcodeado) antes de generar los asientos de una sala nueva.

**Regla para el resto del equipo:** cuando `base_datos_cine_ia_completa.sql`
cambie (nueva columna, tabla o FK) y ya esté aplicado en Supabase, el cambio
no está "terminado" hasta que también se actualicen: la entidad TypeORM
afectada, cualquier DTO que exponga esa columna, el service que la usa, y
(si aplica) el contrato en `src/contracts/service-contracts.ts`. `synchronize:
false` significa que TypeORM nunca avisa solo de este desfase — un mismatch
así se descubre recién en runtime contra la base real, o corriendo los tests
de integración (`*.integration.spec.ts`) contra ella.

## Login con Google (2026-09-08)

**Cambio de esquema:** se agregaron a `usuarios` las columnas `email
VARCHAR(255) UNIQUE` y `google_id VARCHAR(255) UNIQUE`, ambas nullable —
las filas creadas por el login simplificado (Fase 0, `nombre`+`rol`) no
tienen ninguna de las dos. Aplicado con `ALTER TABLE ... ADD COLUMN IF NOT
EXISTS` directo contra la Supabase real (mismas credenciales de `.env`) y
reflejado en `base_datos_cine_ia_completa.sql` para que el script siga
siendo el estado final real del esquema.

**Motivación:** requisito del cliente — login con cuenta de Google además
del login simplificado ya existente, para la parte de cliente/comprador.
`AuthService.login` (nombre+rol) no se toca ni se retira; sigue
funcionando igual, principalmente para administradores.

**Decisión de rol:** el auto-registro por Google **siempre** asigna
`rol='cliente'`. No existe ningún flujo por el que Google login otorgue
`rol='administrador'` — los administradores se siguen creando aparte
(hoy, vía el login simplificado con una fila ya sembrada en `usuarios`).
Esto es deliberado: de lo contrario cualquier cuenta de Gmail podría
auto-asignarse acceso de administrador, rompiendo RF11.

**Flujo:** `POST /auth/google` recibe el ID token que ya emitió Google
Identity Services en el frontend, lo verifica server-side con
`google-auth-library` (audience = `GOOGLE_CLIENT_ID`, nunca se confía en
lo que mande el cliente), busca `usuarios` por `email`; si no existe, lo
crea (`rol='cliente'`, `metodo_auth='google'`) y firma el mismo JWT que
ya emite `POST /auth/login`.

## Próximos cambios de esquema (pendientes, no ejecutados)

Ninguno todavía. Cuando Luis Ángel, Luis Blanco o Roly necesiten un campo o
índice nuevo en la Fase 1, se documenta acá antes de escribir la migración,
con el nombre de archivo (`docs/migrations/00X_descripcion.sql`) y la
justificación del patrón de acceso que la motiva.
