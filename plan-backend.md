# Plan de implementación — Backend (NestJS)

Reparto del trabajo de `backend/` entre **Luis Ángel**, **Luis Blanco** y **Roly**, agente
sugerido: `backend-nestjs` (ver `.claude/agents/backend-nestjs.md`) para las tres personas,
con `qa-reviewer` en modo WATCH corriendo en paralelo desde la Fase 1.

Criterio de reparto: cada persona se queda con un grupo de módulos que puede desarrollar
con CRUD y reglas propias sin esperar a los otros dos. El único punto que **sí** depende de
que los otros dos hayan estabilizado su interfaz es `ia-gateway`, así que ese módulo queda
al final del trabajo de Roly, no al principio.

> **Actualización (2026-09-07):** se agregaron al esquema original el ciclo de vida de
> funciones, la tabla `pagos`, y una normalización de `tipos_asiento`. Esto añade el
> módulo `pagos` (antes sin dueño asignado) al trabajo de Luis Blanco, y una tabla nueva
> y pequeña (`tipos_asiento`) al de Luis Ángel. Ver detalle en cada sección.
>
> **Actualización (2026-09-10) — REVERSIÓN:** `tipos_asiento` se dio de baja la misma
> semana que se agregó. Dentro de una sala todas las butacas son físicamente iguales — la
> diferenciación real de precio/formato es por SALA (`salas.tipo`: 2D/3D/VIP) y por
> FUNCIÓN (`funciones.id_precio`), no por butaca individual. Se eliminaron la tabla
> `tipos_asiento` y las columnas `asientos.id_tipo_asiento` / `precios.id_tipo_asiento`.
> Todo lo que este documento describe más abajo sobre `tipos_asiento` (CRUD propio,
> endpoints `/tipos-asiento`, FK en `precios`/`asientos`) **ya no aplica** — se deja
> tachado/corregido inline donde corresponde. Ver
> `Backend/docs/db-schema-notes.md`, "Reversión: tipo de asiento por sala, no por
> butaca", y `Backend/src/contracts/service-contracts.ts` (`PreciosContract.getVigente`
> cambió de firma como parte de esta reversión).
>
> **Actualización (2026-09-10) — `pagos` implementado (alcance mínimo):** se cerró el
> único módulo pendiente de Luis Blanco. `PagosService.crear` confirma el cobro al
> instante para `efectivo`/`tarjeta` (sin pasarela externa) y marca la venta como
> `pagada`. Stripe/QR quedan fuera de alcance a propósito — la tabla `pagos` ya tiene
> las columnas listas, es trabajo futuro sin cambio de esquema. Mismo día se corrigió un
> bug real en `VentasService.crear` (usaba `PreciosService.getVigente` en vez del
> `idPrecio` de la función, cobrando el precio equivocado cuando había más de un precio
> vigente a la vez) y se agregó `peliculas.poster_url` (Cloudinary) al módulo de Luis
> Ángel. Detalle en cada sección y en `docs/db-schema-notes.md`.

---

## Fase 0 — Fundaciones compartidas (los 3 juntos, antes de separar)

No se reparte: si cada quien arranca su módulo sin esto acordado, se pisan entidades y
convenciones a mitad de camino.

1. Scaffold del proyecto NestJS, conexión a Supabase, y generación de las **entidades
   TypeORM que mapean 1 a 1** contra `base_datos_cine_ia_completa.sql` (PK `SERIAL`,
   nombres de columna en español, tal como están). **Corrección (2026-09-10):** no hay
   migraciones versionadas separadas — el esquema vive en ese único archivo SQL, que se
   edita directo y se aplica a mano contra Supabase; cada cambio se documenta en
   `docs/db-schema-notes.md` en el mismo commit (así se hizo con la reversión de
   `tipos_asiento`).
2. `shared/`: filtro global de excepciones (`{ "message", "code" }`), `ValidationPipe`
   global, `RolesGuard` y `JwtAuthGuard` (implementación mínima), `config/env.ts` tipado.
3. **Decisión de autenticación** (bloqueante solo para `auth`, no para el resto): la tabla
   `usuarios` no tiene columna de contraseña, solo `metodo_auth`. Roly propone y el equipo
   aprueba en 10 minutos: login simplificado por `nombre` + `rol` para esta entrega, o se
   agrega una columna de credencial. Se documenta la decisión en `docs/db-schema-notes.md`.
4. **Contrato de interfaces entre servicios**, acordado por escrito antes de separar
   (esto es lo que evita que `ia-gateway` se trabe en la Fase 2). La versión viva y
   autoritativa de este contrato es `Backend/src/contracts/service-contracts.ts` — si algo
   de acá abajo no coincide con ese archivo, gana el archivo:
   - `PreciosService.getVigente(fecha): Promise<Precio>` — **corrección (2026-09-10):**
     ya no recibe `idTipoAsiento` (ver reversión arriba).
   - `PromocionesService.getAplicable(idFuncion): Promise<Promocion | null>`
   - `PeliculasService.crear/actualizar/eliminar(dto)`
   - `FuncionesService.crear/actualizar/cancelar(dto)`
   - `VentasService.crear(dto): Promise<Venta>`
   - `PagosService.crear(idVenta, metodo): Promise<Venta>` — **implementada (2026-09-10,
     alcance mínimo)**, ver `PagosContract` real en `service-contracts.ts`. Distinto de lo
     que decía esta línea antes de esa fecha: devuelve la `Venta` ya actualizada
     (`estado='pagada'`), no el `Pago` — es lo que necesita el frontend para la pantalla de
     confirmación, y evita que el caller tenga que pedir la venta de nuevo. Solo acepta
     `metodo` `'efectivo'`/`'tarjeta'` (pago controlado por el propio sistema, confirmado al
     instante); `'stripe'`/`'qr'` se rechazan con 400 hasta que se implementen esas
     pasarelas — ver "Nota de alcance" más abajo, se tomó ese recorte a propósito.

Salida de la Fase 0: repo compila, entidades creadas, `auth` mínimo funcionando, y las
firmas de arriba escritas en un doc corto (`docs/contratos-servicios.md`) que las tres
personas leyeron. (`tipos_asiento` llegó a existir como entidad brevemente y ya no —
ver reversión arriba.)

---

## Luis Ángel — Catálogo y configuración

Módulos: `peliculas`, `salas` (+ `asientos`), `precios`, `promociones`
(+ `promocion_funcion`), `dulceria` (`categorias_dulceria` + `productos_dulceria`).
(`tipos_asiento` estuvo acá brevemente y se revirtió el 2026-09-10 — ya no es un módulo,
ver nota de reversión arriba.)
Cubre: **CU03**, **CU06**, **CU07**, y el catálogo que consume **CU09**.

Es el punto de partida de menor riesgo: CRUD con reglas propias, sin depender de que
`funciones` o `ventas` existan todavía.

**Entregables:**
- `peliculas`: CRUD completo. Regla: no se puede poner `estado='inactiva'` ni eliminar una
  película con funciones futuras programadas (`estado='programada'`, `fecha >= hoy`).
- `salas` + `asientos`: alta de sala con generación automática de sus asientos (fila,
  número) según capacidad. **Corrección (2026-09-10):** los asientos ya NO tienen tipo
  individual (`id_tipo_asiento` se retiró) — el formato (2D/3D/VIP) es de la sala entera
  (`salas.tipo`), no de la butaca. No se borra una sala con funciones futuras asociadas.
- ~~`tipos_asiento`: CRUD simple~~ — dado de baja el 2026-09-10, la tabla ya no existe.
- `precios`: CRUD con `vigente_desde`/`vigente_hasta`. **Corrección (2026-09-10):** ya no
  lleva `id_tipo_asiento` (se retiró junto con `tipos_asiento`) — el precio cuelga de la
  función (`funciones.id_precio`), no de un tipo de asiento. Expone `getVigente(fecha)`
  (firma actualizada, ya sin `idTipoAsiento`) — lo consume Luis Blanco en `ventas`.
- `promociones`: CRUD con `fecha_inicio`/`fecha_fin`/`activa`, asociación N:M con
  `funciones` vía `promocion_funcion`. Expone `getAplicable(idFuncion)` — lo consume Luis
  Blanco en `ventas`.
- `dulceria` (nuevo, CU09/RF20): CRUD de `categorias_dulceria` y `productos_dulceria`
  (solo admin escribe; lectura abierta a cliente y admin). Alcance simplificado a
  propósito: sin motor de variantes/modificadores — cada combinación de tamaño o sabor es
  un producto distinto en la tabla. Expone `getDisponibles(idCategoria?)` — lo consume
  Luis Blanco cuando agregue dulcería al carrito dentro de `ventas` (`detalle_venta_dulceria`
  usa la misma transacción de `VentasService.crear`, no un endpoint de venta separado).
- Guards de rol: todo endpoint de escritura es `@Roles('administrador')`; lectura abierta a
  `cliente` y `administrador` (RF11).
- Toda mutación de `peliculas`/`precios`/`promociones` llama a `AuditService.log(...)`
  (RF12) — el servicio lo expone Roly en la Fase 0/1, Luis Ángel solo lo invoca.
- Tests con `/test-suite backend peliculas|salas|precios|promociones`.

**Endpoints:**
```
GET/POST/PATCH/DELETE  /peliculas
GET/POST/PATCH/DELETE  /salas
GET                    /salas/:id/asientos
GET/POST/PATCH/DELETE  /precios
GET/POST/PATCH/DELETE  /promociones
POST                   /promociones/:id/funciones/:idFuncion
GET/POST/PATCH/DELETE  /dulceria/categorias
GET/POST/PATCH/DELETE  /dulceria/productos
```

---

## Luis Blanco — Funciones, ventas, pagos y reportes

Módulos: `funciones`, `disponibilidad_asiento`, `ventas`, `detalle_venta_entradas`,
`pagos`, `reportes`. Cubre: **CU02**, **CU04**, **CU05**. Es el núcleo transaccional — la
parte con más reglas de negocio y la que más plata mueve, conviene que la lleve la persona
con más experiencia en lógica de dominio.

**Entregables:**
- `funciones`: CRUD. El anti-solapamiento ya lo resuelve Postgres
  (`EXCLUDE USING gist` en `funciones`, ver `.claude/agents/database.md`) — el trabajo acá
  es **capturar el `SQLSTATE 23P01`** y devolverlo como `409 Conflict` con mensaje legible
  (RF07), nunca reimplementar la detección de conflictos en TypeScript. La generación y
  cancelación de `disponibilidad_asiento` ya las hacen los triggers de la migración `002`
  (`trg_crear_disponibilidad` / `trg_cancelar_disponibilidad`) — el servicio no necesita
  duplicar esa lógica, solo confiar en que ya ocurrió tras el `INSERT`/`UPDATE`.
- `ventas`: el flujo completo de CU02 —
  1. Validar que los asientos pedidos están `disponible` para esa función.
  2. Calcular `subtotal` con el precio de la función — **corrección (2026-09-10):** usa
     `PreciosService.buscarPorId(funcion.idPrecio)` cuando la función tiene un precio
     propio asignado; solo cae a `PreciosService.getVigente(funcion.fecha)` si `idPrecio`
     es `null`. Antes siempre llamaba a `getVigente`, ignorando `idPrecio` — con más de un
     precio "vigente" a la vez (ej. tarifa normal + VIP, mismo `vigente_desde`) eso cobraba
     el precio equivocado a funciones que sí tenían uno específico asignado. Bug real,
     encontrado en prueba manual con 2 precios reales cargados; tiene test de regresión en
     `ventas.service.spec.ts`.
  3. Calcular `descuento_aplicado` con `PromocionesService.getAplicable(...)` (de Luis Ángel).
  4. **Rechazar la creación si falta `confirmacion_no_reembolso`** (RF03) **o, cuando
     `tipo_registro='voz'`, si falta `confirmacion_verbal_check`** (RF19). Esta validación
     va en el `VentasService`, nunca confiada al caller.
  5. Todo el paso 1 (marcar asientos como `ocupado`) + insertar `venta` +
     `detalle_venta_entradas` corre en **una transacción de base de datos** — dos compras
     simultáneas del mismo asiento no pueden ambas tener éxito.
  6. Si el pedido incluye dulcería (CU09/RF20), sus filas van a `detalle_venta_dulceria`
     **dentro de la misma transacción** del paso anterior — es el mismo carrito, nunca una
     venta aparte. El subtotal de dulcería se suma al de entradas antes de calcular
     `total`.
  7. La venta nace en `estado='pendiente_pago'`; pasa a `'pagada'` solo cuando `pagos`
     confirma el cobro (ver abajo), nunca antes.
- `pagos`: **implementado (2026-09-10) en su alcance mínimo** — pago controlado por el
  propio sistema, sin pasarela externa todavía. `PagosService.crear(idVenta, metodo)`:
  - Rechaza con 404 si la venta no existe, 409 si `venta.estado !== 'pendiente_pago'`
    (ya pagada, anulada, etc.), 400 si `metodo` no es `'efectivo'` ni `'tarjeta'`.
  - **Efectivo/tarjeta**: confirmación instantánea — inserta el `Pago` directo en
    `estado='exitoso'` (sin pasar por `'procesando'`) y en la misma transacción actualiza
    `ventas.estado='pagada'`, `ventas.fecha_pago`, `ventas.id_pago_activo`.
  - **Stripe/QR**: siguen sin implementar (la tabla `pagos` ya tiene las columnas
    `stripe_*`/`qr_*` para cuando se hagan) — quedan como trabajo futuro, ver "Nota de
    alcance" más abajo.
  - Verificado end-to-end contra el frontend real: crear función → comprar → "Confirmar y
    Pagar" → venta queda `pagada` en Supabase, confirmado con Playwright y consulta directa
    a la base.
- `reportes`: totales, por película, por función/producto, con filtro de rango de fecha
  (RF08). Solo rol `administrador`.
- Tests con foco en concurrencia: dos requests de compra al mismo asiento en paralelo,
  solo una debe ganar (implementado, ver `ventas.service.concurrencia.integration.spec.ts`).
  El webhook de Stripe queda pendiente junto con la integración real de esa pasarela — no
  existe todavía, ver "Nota de alcance".

**Endpoints:**
```
GET/POST/PATCH/DELETE  /funciones
GET                    /funciones/:id/disponibilidad
POST                   /ventas
GET                    /ventas
GET                    /ventas/:id
POST                   /pagos                       (pago controlado — efectivo/tarjeta; implementado)
POST                   /pagos/webhook/stripe         (pendiente, junto con Stripe real)
POST                   /pagos/:id/confirmar-qr       (pendiente, junto con QR real)
GET                    /reportes/ventas?desde=&hasta=
GET                    /reportes/por-pelicula
GET                    /reportes/por-funcion
```

---

## Roly — Seguridad, auditoría e integración con la IA

Módulos: `auth`, `usuarios`, `audit`, `ia-gateway` (+ el `shared/` inicial de la Fase 0).
Cubre: **RF10, RF11, RF12** transversalmente, y es quien deja lista la puerta de entrada
para que `ai-voice` pueda operar sobre el sistema real.

Esta línea empieza en paralelo a las otras dos (auth, usuarios, audit no dependen de
nadie), pero **`ia-gateway` se arma al final**, una vez que los `Service` de Luis Ángel y Luis Blanco
tienen su interfaz estable — es la pieza de integración, no la de arranque.

**Entregables (orden interno):**
1. `auth`: login (según lo decidido en Fase 0), emisión de JWT con `rol` embebido.
2. `usuarios`: CRUD básico, solo `administrador`.
3. `audit`: `AuditService.log(idUsuario, accion, nivelDespliegue)` que inserta en
   `log_acciones`, más un interceptor reusable para que Luis Ángel y Luis Blanco lo enchufen sin
   escribir el `INSERT` a mano. Endpoint `GET /audit/log-acciones` para que QA y el panel
   admin puedan consultarlo (RF12).
4. `ia-gateway`: **el único endpoint que `ai-service` puede llamar para mutar datos**
   (RF10). Recibe la acción ya confirmada por voz —
   `{ rol, intencion, entidad, payload, evidenciaConfirmacion }` — la revalida server-side
   (nunca confía en lo que dice la IA) y despacha a `PeliculasService`, `FuncionesService`,
   `VentasService`, `PagosService`, `PromocionesService` o `PreciosService` según
   corresponda. Devuelve el resultado real de la ejecución, nunca un "ok" simulado. Para
   `pagos`, el agente de voz solo puede **iniciar** el cobro o **consultar** su estado —
   nunca marcarlo como exitoso (eso lo hace el webhook de Stripe o la confirmación de QR,
   fuera del alcance del agente).
5. `POST /interacciones`: endpoint simple para que `ai-service` registre cada interacción
   en `interacciones_ia` (intención, widget generado, texto transcrito — RF18/CU08), aunque
   no sea una mutación de negocio, pasa por el backend para mantener una sola fuente de
   escritura en la base.

**Endpoints:**
```
POST                   /auth/login
GET/POST/PATCH/DELETE  /usuarios
GET                    /audit/log-acciones
POST                   /ia-gateway/acciones
POST                   /interacciones
```

---

## Cronograma sugerido (4 semanas)

| Semana | Luis Ángel | Luis Blanco | Roly |
|---|---|---|---|
| 1 | Fase 0 conjunta + `peliculas` ✅ | Fase 0 conjunta + `funciones` (CRUD, sin flujo de venta aún) | Fase 0 conjunta + `auth` + `usuarios` |
| 2 | `salas`/`asientos` ✅, `precios` ✅ | `disponibilidad_asiento` + `ventas` (cálculo y transacción) | `audit` (service + interceptor) |
| 3 | `promociones` ✅ — **pendiente**: módulo `dulceria` (CU09/RF20) | `pagos` ✅ (alcance mínimo: efectivo/tarjeta; Stripe/QR quedan para después) + `reportes` ✅ + tests de concurrencia en `ventas` ✅ | `ia-gateway` — integra contra los servicios ya estables de Luis Ángel y Luis Blanco |
| 4 | Tests, `/code-review`, buffer para pedidos de Roly sobre `ia-gateway` | Tests de `pagos`/`ventas`, `/code-review`, buffer | Endpoint `/interacciones`, pruebas de extremo a extremo del gateway, cierre |

**Estado real (2026-09-10)**: `peliculas` (con `poster_url`/Cloudinary agregado esta misma
fecha, ver `docs/db-schema-notes.md`), `salas`+`asientos`, `precios` y `promociones` de
Luis Ángel están completos y con tests (build/lint/test en verde). El intento de
`tipos_asiento` de la actualización de esquema del 2026-09-07 se revirtió esta misma
semana (ver nota de reversión arriba) — ya no es trabajo pendiente, no existe la tabla.
Sigue pendiente el módulo `dulceria` completo (`categorias_dulceria` + `productos_dulceria`,
CU09/RF20). De Roly: `auth`, `usuarios` (solo métodos internos, sin CRUD/controller) y
`audit` completos; `ia-gateway` sin empezar. De Luis Blanco: `funciones`
(CRUD + anti-solapamiento + `GET /funciones/:id/disponibilidad`), `ventas` (flujo
transaccional completo, RF03/RF19, verificado con test de concurrencia real contra
Postgres; corrección 2026-09-10 en el cálculo de precio, ver arriba), `reportes` (3
endpoints) y **`pagos`** (alcance mínimo: efectivo/tarjeta, confirmación instantánea sin
pasarela externa — ver arriba) completos y con tests (unitarios + integración contra
Supabase, y verificado end-to-end desde el frontend real, incluyendo el botón "Confirmar y
Pagar" del kiosco — ver `service-contracts.ts` para los contratos). Con esto, **todos los
módulos asignados a Luis Blanco en este documento están completos** salvo la integración
real de Stripe/QR, que queda fuera de alcance a propósito (ver "Nota de alcance").

**Checkpoint obligatorio a mitad de semana 3**: Roly no puede empezar `ia-gateway` en
serio hasta confirmar con Luis Ángel y Luis Blanco que las firmas acordadas en la Fase 0 no cambiaron.
Si cambiaron, se actualiza `docs/contratos-servicios.md` antes de seguir.

**Nota de alcance:** `pagos` (Stripe + QR completos) se recortó a la versión mínima
prevista acá mismo — solo pago controlado por el sistema para `efectivo`/`tarjeta`
(confirmación instantánea, sin pasarela externa), implementado el 2026-09-10. La tabla
`pagos` ya tiene las columnas `stripe_*`/`qr_*` listas (ver `base_datos_cine_ia_completa.sql`
y `docs/db-schema-notes.md`) para cuando se retome esa integración — no hace falta ningún
cambio de esquema, solo agregar los métodos correspondientes a `PagosService` y los
endpoints de webhook/confirmación-QR que ya estaban listados arriba.

## Verificación continua

Desde la Fase 1, correr `qa-reviewer` en modo WATCH sobre el backend: en cuanto un
endpoint responde, lo prueba (código HTTP, rol, flags de confirmación) y reporta al agente
responsable sin frenar a los otros dos. Antes de cerrar cada semana, modo FEATURE sobre lo
entregado esa semana; al final de la semana 4, modo SYSTEM completo (ver
`.claude/agents/qa-reviewer.md`).
