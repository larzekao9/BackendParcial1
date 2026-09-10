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

## Reversión: tipo de asiento por sala, no por butaca (2026-09-10)

**Hallazgo (Luis Blanco, revisando el esquema antes de empezar `funciones`):**
la normalización de `tipos_asiento` (entrada anterior) asumía que dentro de
una misma sala podían convivir butacas de distinto tipo (normal/preferencial/
VIP), y que el precio dependía de esa mezcla. En la práctica del negocio eso
no es así: **todas las butacas de una sala son físicamente iguales** — no se
vende un asiento VIP suelto dentro de una sala normal. La diferenciación real
de formato/categoría (y por lo tanto de precio) es de la **sala** (`salas.tipo`:
2D/3D/VIP), no de la butaca individual.

Esto dejaba dos ejes de precio compitiendo en el esquema: `funciones.id_precio`
(un precio por función, nunca leído por ningún service) y `precios.id_tipo_asiento`
(un precio por tipo de asiento, el que sí usaba `PreciosContract.getVigente`).
Sobraba uno de los dos.

**Cambio aplicado (contra la Supabase real, 2026-09-10):**
```sql
ALTER TABLE asientos DROP COLUMN id_tipo_asiento;
ALTER TABLE precios  DROP COLUMN id_tipo_asiento;
DROP TABLE tipos_asiento;
```
Verificado antes de ejecutar que `salas`, `asientos`, `precios` y `peliculas`
estaban vacías en producción (0 filas) — no hubo pérdida de datos reales.
`tipos_asiento` sí tenía sus 3 filas semilla, que se pierden (no había nada
más referenciándolas fuera de las columnas que se acaban de borrar).

`precios` queda como una lista simple de precios vigentes por fecha
(`valor`, `vigente_desde`, `vigente_hasta`), sin ninguna FK a tipo de
asiento. El precio de una entrada es el de la función a la que pertenece
(`funciones.id_precio`), no varía butaca por butaca.

**Código actualizado en el mismo cambio** (dominio de Luis Ángel —
avisarle antes de pushear, no estaba presente cuando se hizo):
- `Asiento`/`Precio` (entidades TypeORM): sin `idTipoAsiento`.
- `TipoAsiento` (entidad): eliminada.
- `PreciosContract.getVigente`: firma pasó de `(idTipoAsiento, fecha)` a
  `(fecha)`.
- `PreciosService`, `CrearPrecioDto`, `SalasService.generarAsientos`
  (ya no resuelve ningún id de `tipos_asiento` al crear una sala).
- Tests unitarios y de integración de `precios`/`salas`/`promociones`
  ajustados para no referenciar `idTipoAsiento`.

**Regla para el resto del equipo:** si en algún momento un formato de sala
necesita un precio distinto (ej. "VIP cuesta más que 2D"), eso se resuelve
eligiendo un `id_precio` distinto al crear la función para esa sala — no
agregando de nuevo un tipo de asiento por butaca.

## Poster real de películas — columna `poster_url` (2026-09-10)

`peliculas` no tenía ninguna columna para el poster — el frontend usaba un placeholder
genérico fijo. Se agrega para poder subir un poster real desde el panel admin.

**Cambio aplicado (contra la Supabase real, 2026-09-10):**
```sql
ALTER TABLE peliculas ADD COLUMN poster_url VARCHAR(500);
```
Nullable, sin default — una película sin poster subido sigue funcionando (el frontend
cae al placeholder si `posterUrl` es `null`, ver `src/core/posters.ts` del frontend).

**Cómo llega la imagen**: el frontend sube el archivo directo a Cloudinary (cuenta propia
del equipo, upload preset *unsigned*, sin pasar por este backend) y solo guarda la
`secure_url` que devuelve Cloudinary en esta columna. El backend nunca recibe ni procesa
el binario de la imagen — `CrearPeliculaDto.posterUrl` valida que sea una URL (`@IsUrl()`),
nada más. Ver `src/api/cloudinary.api.ts` en el frontend.

**Código actualizado en el mismo cambio** (dominio de Luis Ángel — avisarle, no estaba
presente cuando se hizo):
- `Pelicula` (entidad TypeORM): agrega `posterUrl: string | null`.
- `CrearPeliculaInput` (`service-contracts.ts`) y `CrearPeliculaDto`: agregan `posterUrl?`.
- `PeliculasService.crear`: pasa `posterUrl ?? null`. `actualizar` no se tocó (ya hacía
  `Object.assign` directo con todo lo que llegue).

## Módulo `pagos` activado — mapeo de columnas ya existentes (2026-09-10)

**Sin cambio de esquema.** La tabla `pagos` y las columnas `ventas.metodo_pago_elegido`,
`ventas.fecha_pago`, `ventas.id_pago_activo` ya estaban en `base_datos_cine_ia_completa.sql`
desde antes (ver sección 9 y la FK `ventas_pago_activo_fkey`), pero ningún código las leía ni
escribía — `VentasService.crear` dejaba toda venta en `estado='pendiente_pago'` para siempre.

**Código agregado (dominio de Luis Blanco):**
- `Pago` (entidad TypeORM nueva, `src/database/entities/pago.entity.ts`): mapea solo las
  columnas que usa el alcance actual (`id_pago`, `id_venta`, `monto`, `moneda`, `metodo_pago`,
  `estado`, `fecha_creacion`, `fecha_confirmacion`) — los campos `stripe_*`/`qr_*`/`metadata`/
  auditoría quedan sin mapear hasta que se implemente esa pasarela.
- `Venta` (entidad): agrega `metodoPagoElegido`, `fechaPago`, `idPagoActivo`.
- Módulo `pagos` (`POST /pagos`, `PagosService.crear`): pago controlado por el propio sistema,
  sin pasarela externa — solo acepta `metodo` `'efectivo'`/`'tarjeta'` (rechaza `'stripe'`/`'qr'`
  con 400, todavía no implementados). Inserta el `Pago` en `estado='exitoso'` y actualiza la
  venta a `estado='pagada'` en una transacción.

**Regla para el resto del equipo:** cuando se implemente Stripe/QR real, es un cambio de
`PagosService` (agregar los métodos y mapear las columnas `stripe_*`/`qr_*` que faltan) — no
requiere tocar `base_datos_cine_ia_completa.sql`, ya está todo ahí.

## Próximos cambios de esquema (pendientes, no ejecutados)

Ninguno todavía. Cuando Luis Ángel, Luis Blanco o Roly necesiten un campo o
índice nuevo en la Fase 1, se documenta acá antes de escribir la migración,
con el nombre de archivo (`docs/migrations/00X_descripcion.sql`) y la
justificación del patrón de acceso que la motiva.
