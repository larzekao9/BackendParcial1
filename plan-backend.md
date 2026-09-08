# Plan de implementación — Backend (NestJS)

Reparto del trabajo de `backend/` entre **Luisa Ángel**, **Luis Blanco** y **Roly**, agente
sugerido: `backend-nestjs` (ver `.claude/agents/backend-nestjs.md`) para las tres personas,
con `qa-reviewer` en modo WATCH corriendo en paralelo desde la Fase 1.

Criterio de reparto: cada persona se queda con un grupo de módulos que puede desarrollar
con CRUD y reglas propias sin esperar a los otros dos. El único punto que **sí** depende de
que los otros dos hayan estabilizado su interfaz es `ia-gateway`, así que ese módulo queda
al final del trabajo de Roly, no al principio.

> **Actualización:** se agregaron las migraciones `002` (ciclo de vida de funciones), `003`
> (pagos) y `004` (normalización de `tipos_asiento`) sobre el esquema original. Esto añade
> el módulo `pagos` (antes sin dueño asignado) al trabajo de Luis Blanco, y una tabla nueva
> y pequeña (`tipos_asiento`) al de Luisa Ángel. Ver detalle en cada sección.

---

## Fase 0 — Fundaciones compartidas (los 3 juntos, antes de separar)

No se reparte: si cada quien arranca su módulo sin esto acordado, se pisan entidades y
convenciones a mitad de camino.

1. Scaffold del proyecto NestJS, conexión a Supabase, y generación de las **entidades
   TypeORM/Prisma que mapean 1 a 1** contra `database/migrations/001_init.sql` a
   `004_tipos_asiento.sql` (PK `SERIAL`, nombres de columna en español, tal como están).
   Aplicar las migraciones **en orden** contra la instancia de Supabase antes de generar
   las entidades — `001` ya está corrida ahí, `002`-`004` todavía no.
2. `shared/`: filtro global de excepciones (`{ "message", "code" }`), `ValidationPipe`
   global, `RolesGuard` y `JwtAuthGuard` (implementación mínima), `config/env.ts` tipado.
3. **Decisión de autenticación** (bloqueante solo para `auth`, no para el resto): la tabla
   `usuarios` no tiene columna de contraseña, solo `metodo_auth`. Roly propone y el equipo
   aprueba en 10 minutos: login simplificado por `nombre` + `rol` para esta entrega, o se
   agrega una columna de credencial. Se documenta la decisión en `docs/db-schema-notes.md`.
4. **Contrato de interfaces entre servicios**, acordado por escrito antes de separar
   (esto es lo que evita que `ia-gateway` se trabe en la Fase 2):
   - `PreciosService.getVigente(idTipoAsiento, fecha): Promise<Precio>`
   - `PromocionesService.getAplicable(idFuncion): Promise<Promocion | null>`
   - `PeliculasService.crear/actualizar/eliminar(dto)`
   - `FuncionesService.crear/actualizar/cancelar(dto)`
   - `VentasService.crear(dto): Promise<Venta>`
   - `PagosService.crear(idVenta, metodo): Promise<Pago>` — nueva, la consume `ventas`
     para iniciar el cobro y `ia-gateway` para informar el estado por voz sin exponer
     detalles sensibles (nunca datos de tarjeta).

Salida de la Fase 0: repo compila, entidades creadas (incluyendo `pagos` y
`tipos_asiento`), `auth` mínimo funcionando, y las firmas de arriba escritas en un doc
corto (`docs/contratos-servicios.md`) que las tres personas leyeron.

---

## Luisa Ángel — Catálogo y configuración

Módulos: `peliculas`, `salas` (+ `asientos`), `tipos_asiento`, `precios`, `promociones`
(+ `promocion_funcion`), `dulceria` (`categorias_dulceria` + `productos_dulceria`).
Cubre: **CU03**, **CU06**, **CU07**, y el catálogo que consume **CU09**.

Es el punto de partida de menor riesgo: CRUD con reglas propias, sin depender de que
`funciones` o `ventas` existan todavía.

**Entregables:**
- `peliculas`: CRUD completo. Regla: no se puede poner `estado='inactiva'` ni eliminar una
  película con funciones futuras programadas (`estado='programada'`, `fecha >= hoy`).
- `salas` + `asientos`: alta de sala con generación automática de sus asientos (fila,
  número, `id_tipo_asiento`) según capacidad. No se borra una sala con funciones futuras
  asociadas.
- `tipos_asiento`: CRUD simple (normal/preferencial/VIP ya vienen sembrados por la
  migración 004). En la práctica es catálogo de solo lectura para el resto del equipo —
  solo el admin lo edita, y rara vez.
- `precios`: CRUD con `id_tipo_asiento` (FK, ya no es texto libre — ver migración 004) y
  `vigente_desde`/`vigente_hasta`. Expone `getVigente(idTipoAsiento, fecha)` — lo consume
  Luis Blanco en `ventas`.
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
  (RF12) — el servicio lo expone Roly en la Fase 0/1, Luisa solo lo invoca.
- Tests con `/test-suite backend peliculas|salas|tipos_asiento|precios|promociones`.

**Endpoints:**
```
GET/POST/PATCH/DELETE  /peliculas
GET/POST/PATCH/DELETE  /salas
GET                    /salas/:id/asientos
GET/POST/PATCH/DELETE  /tipos-asiento
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
  2. Calcular `subtotal` con `PreciosService.getVigente(...)` (de Luisa).
  3. Calcular `descuento_aplicado` con `PromocionesService.getAplicable(...)` (de Luisa).
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
- `pagos` (nuevo): expone `PagosService.crear(idVenta, metodo)` —
  - **Stripe**: crea el `PaymentIntent`, guarda `stripe_payment_intent_id` y
    `stripe_client_secret`, responde al frontend para que confirme el cobro. La
    confirmación real llega por **webhook** (`POST /pagos/webhook/stripe`), firmado y
    verificado server-side — nunca se marca `estado='exitoso'` porque el frontend lo pida.
  - **QR**: genera `qr_codigo` + `qr_imagen_url` con expiración (`qr_fecha_expiracion`).
    El escaneo lo confirma el backend (`qr_escaneado=true`, `qr_fecha_escaneo`), no el
    cliente.
  - **Efectivo/tarjeta física**: registro manual por el administrador, marcado
    `estado='exitoso'` de forma directa (no hay confirmación asíncrona que esperar).
  - Al confirmarse cualquier pago, actualiza `ventas.estado='pagada'`,
    `ventas.fecha_pago`, y `ventas.id_pago_activo` apuntando a ese pago — todo en la misma
    transacción.
- `reportes`: totales, por película, por función/producto, con filtro de rango de fecha
  (RF08). Solo rol `administrador`.
- Tests con foco en concurrencia: dos requests de compra al mismo asiento en paralelo,
  solo una debe ganar. Además, test del webhook de Stripe con firma inválida (debe
  rechazarse) y con firma válida (debe actualizar `ventas`/`pagos` correctamente).

**Endpoints:**
```
GET/POST/PATCH/DELETE  /funciones
GET                    /funciones/:id/disponibilidad
POST                   /ventas
GET                    /ventas
GET                    /ventas/:id
POST                   /pagos                       (crea el pago según método elegido)
POST                   /pagos/webhook/stripe         (confirmación asíncrona de Stripe)
POST                   /pagos/:id/confirmar-qr       (confirma escaneo de QR)
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
nadie), pero **`ia-gateway` se arma al final**, una vez que los `Service` de Luisa y Luis
tienen su interfaz estable — es la pieza de integración, no la de arranque.

**Entregables (orden interno):**
1. `auth`: login (según lo decidido en Fase 0), emisión de JWT con `rol` embebido.
2. `usuarios`: CRUD básico, solo `administrador`.
3. `audit`: `AuditService.log(idUsuario, accion, nivelDespliegue)` que inserta en
   `log_acciones`, más un interceptor reusable para que Luisa y Luis lo enchufen sin
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

| Semana | Luisa Ángel | Luis Blanco | Roly |
|---|---|---|---|
| 1 | Fase 0 conjunta + `peliculas` ✅ | Fase 0 conjunta + `funciones` (CRUD, sin flujo de venta aún) | Fase 0 conjunta + `auth` + `usuarios` |
| 2 | `salas`/`asientos`/`tipos_asiento` ✅, `precios` | `disponibilidad_asiento` + `ventas` (cálculo y transacción) | `audit` (service + interceptor) |
| 3 | `promociones` + integrar `getAplicable` con Luis | `pagos` (Stripe + QR + webhook) + `reportes` + tests de concurrencia en `ventas` | `ia-gateway` — integra contra los servicios ya estables de Luisa y Luis |
| 4 | Tests, `/code-review`, buffer para pedidos de Roly sobre `ia-gateway` | Tests de `pagos`/`ventas`, `/code-review`, buffer | Endpoint `/interacciones`, pruebas de extremo a extremo del gateway, cierre |

**Checkpoint obligatorio a mitad de semana 3**: Roly no puede empezar `ia-gateway` en
serio hasta confirmar con Luisa y Luis que las firmas acordadas en la Fase 0 no cambiaron.
Si cambiaron, se actualiza `docs/contratos-servicios.md` antes de seguir.

**Nota de alcance:** si el equipo va ajustado de tiempo, `pagos` (Stripe + QR completos)
es lo primero recortable a una versión mínima (solo registro manual de
efectivo/tarjeta, sin integración real de pasarela) sin romper el resto del flujo — la
venta ya queda modelada con `estado='pendiente_pago'` independientemente de qué tan
completo esté el módulo de pagos.

## Verificación continua

Desde la Fase 1, correr `qa-reviewer` en modo WATCH sobre el backend: en cuanto un
endpoint responde, lo prueba (código HTTP, rol, flags de confirmación) y reporta al agente
responsable sin frenar a los otros dos. Antes de cerrar cada semana, modo FEATURE sobre lo
entregado esa semana; al final de la semana 4, modo SYSTEM completo (ver
`.claude/agents/qa-reviewer.md`).
