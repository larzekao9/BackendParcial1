# Plan — Historial de compras (cliente) y CRUD de dulcería (admin)

> **Estado (2026-09-16): las 6 tareas de la sección 3 están completas.** Ver el
> detalle de qué se hizo (y qué se desvió del diseño original) en cada fila de la
> tabla y en "6. Cierre" al final del documento. Quedó pendiente, fuera del alcance
> de este plan puntual, un trabajo adicional que surgió en el camino: ver
> "7. Trabajo extra (no estaba en este plan)".

Complementa `plan-backend.md` y `CLAUDE.md`. Cubre dos huecos reportados por el
usuario: el cliente no puede ver las funciones que compró, y el administrador no
tiene forma de crear productos de dulcería. Auditoría hecha 2026-09-16 contra
`base_datos_cine_ia_completa.sql`, `Backend/src/modules/**` y
`Parcial1_Sw2_Frontend/src/**` reales (no se asume nada de `CLAUDE.md`, que está
desactualizado en la sección "estado del frontend" — el frontend sí tiene una capa
`src/api/*.ts` con `fetch` real, no es solo mockup).

---

## 1. Diagnóstico

### 1.1 "El cliente no puede ver las funciones que compró"

| Capa | Estado | Evidencia |
|---|---|---|
| Esquema SQL | ✅ Listo, sin cambios necesarios | `ventas → funciones → peliculas/salas`, `detalle_venta_entradas → asientos`, `detalle_venta_dulceria → productos_dulceria`, todo con FK ya declaradas |
| Backend — autorización | ✅ Listo | `VentasController.listar`/`buscarPorId` (`ventas.controller.ts:27-43`) ya filtran por `idUsuarioCliente` del JWT y devuelven 403 si un cliente pide una venta ajena. RF11 cumplido. |
| Backend — forma de la respuesta | ⚠️ **Incompleto** | `VentasService.listar`/`buscarPorId` (`ventas.service.ts:149-163`) hacen `find`/`findOne` **sin `relations`** → la respuesta trae solo `idFuncion`, `idPromocion`, sin datos de película/horario/sala/asientos/dulcería. Insuficiente para pintar "mis compras" sin que el frontend haga N llamadas extra por venta. |
| Frontend — API | ❌ No existe | `ventas.api.ts` solo tiene `crearVenta` (`POST /ventas`). No hay función que llame `GET /ventas`. |
| Frontend — vista | ❌ No existe | No hay ninguna vista tipo "mis compras"/"mis entradas" en `src/views/`. |

**Conclusión: el backend está ~80% listo.** Los guards de rol y ownership (lo difícil,
lo que exige cuidado de seguridad) ya están bien hechos. Falta un ajuste chico
(cargar relaciones) antes de que el frontend pueda consumirlo con una sola llamada
por venta. El 100% del trabajo de UI está por hacer.

### 1.2 "El administrador no puede crear más productos de dulcería"

| Capa | Estado | Evidencia |
|---|---|---|
| Esquema SQL | ✅ Listo | `productos_dulceria`, `categorias_dulceria` completas |
| Backend | ✅ **100% listo, nada que tocar** | `DulceriaProductosController` (`dulceria.controller.ts:85-120`) ya expone `POST/PATCH/DELETE /dulceria/productos` con `@Roles('administrador')` + `@Audit(...)`, DTOs validados (`crear-producto.dto.ts`), soft-delete (`disponible=false`) igual que `peliculas`. Módulo completo con tests. |
| Frontend — API | ❌ No existe | No hay `dulceria.api.ts` en `src/api/`. |
| Frontend — vista admin | ❌ No existe | No hay `AdminDulceria.tsx` (comparado contra `AdminCartelera`, `AdminPreciosPromos`, etc. en `src/views/admin/`). |
| Frontend — vista cliente | ⚠️ **Desincronizada de la BD** | `CandyBarSelection.tsx` (usado en el flujo de compra) tiene los productos **hardcodeados en JSX** ("Combo Pareja Épico", etc.), no llama `GET /dulceria/productos`. Si el admin llegara a crear productos hoy por Swagger/Postman, el cliente igual nunca los vería. |

**Conclusión: el backend está 100% listo.** Este es un hueco puramente de frontend,
y de hecho doble: falta el CRUD de admin Y falta conectar la vista de cliente que ya
existe a datos reales.

---

## 2. Diseño propuesto

### 2.1 Backend — ajuste mínimo (sin cambio de esquema)

En `VentasService` (`Backend/src/modules/ventas/ventas.service.ts`):

- `listar(idUsuarioCliente?)`: agregar `relations: ['funcion', 'funcion.pelicula', 'funcion.sala', 'promocion']`.
- `buscarPorId(idVenta)`: mismas relations, más `detalleEntradas.asiento` y `detalleDulceria.producto` (requiere exponer esas relaciones inversas en `Venta` — hoy no están mapeadas como `OneToMany`; agregarlas es puramente TypeORM, no toca la tabla).
- Evaluar si conviene un DTO de respuesta (`VentaDetalladaDto`) en vez de devolver la entidad completa con relaciones anidadas — mismo patrón de "no filtrar detalles de implementación" que ya usan en `dulceria.controller.ts`. Recomendado para no acoplar el frontend a la forma interna de TypeORM.
- Sin migraciones: son cambios de código de aplicación, el esquema ya soporta todo.
- Regla del proyecto (`CLAUDE.md`): documentar el cambio en `Backend/docs/db-schema-notes.md` solo si se toca alguna columna — en este caso no aplica, es solo capa de servicio.

### 2.2 Frontend — Cliente: "Mis compras"

- `src/api/ventas.api.ts`: agregar `listarMisCompras(): GET /ventas` (el backend ya filtra por JWT, no hace falta mandar el id de usuario).
- Nueva vista `src/views/MisCompras.tsx`: lista de ventas del cliente autenticado, ordenadas por fecha (el backend ya ordena `DESC`), con:
  - Película, horario, sala, asientos, estado (badge: pendiente_pago / pagada / cancelada / anulada).
  - Reutilizar `DigitalTicketWidget` si ya existe como componente de UI generativa (RF18) para mantener consistencia visual con el comprobante que se muestra justo después de pagar.
- Entrada de navegación visible solo para rol `cliente` (mismo patrón de guard de rutas que ya use el resto del router).

### 2.3 Frontend — Admin: CRUD de dulcería

- Nuevo `src/api/dulceria.api.ts`, mismo patrón que `precios.api.ts`/`peliculas.api.ts`:
  `GET/POST/PATCH/DELETE /dulceria/categorias`, `GET/POST/PATCH/DELETE /dulceria/productos`.
- Nueva vista `src/views/admin/AdminDulceria.tsx`, mismo patrón que `AdminPreciosPromos.tsx`
  (tabla + formulario alta/edición + botón eliminar con confirmación, ya que el DELETE de
  producto es soft-delete en el backend).
- **Corrección necesaria en `CandyBarSelection.tsx`**: reemplazar el arreglo hardcodeado
  por `GET /dulceria/productos` (con `?idCategoria=` si aplica). Sin esto, el CRUD de
  admin queda "sordo" — se puede crear un producto pero nunca aparece en la compra real.

---

## 3. Plan de trabajo (orden sugerido)

| # | Tarea | Repo | Depende de | Criterio de aceptación | Estado |
|---|---|---|---|---|---|
| 1 | Enriquecer `VentasService.listar`/`buscarPorId` con relations | Backend | — | `GET /ventas` y `GET /ventas/:id` devuelven película, horario, sala, asientos y (si aplica) dulcería en una sola respuesta; tests existentes (`ventas.service.spec.ts`) siguen en verde + test nuevo que verifica las relaciones cargadas | ✅ Hecho |
| 2 | `src/api/dulceria.api.ts` | Frontend | — | Funciones tipadas para los 8 endpoints de `/dulceria/*` | ✅ Hecho |
| 3 | `AdminDulceria.tsx` (CRUD admin) | Frontend | #2 | Admin crea/edita/elimina (soft) productos y categorías; solo visible con rol `administrador` | ✅ Hecho |
| 4 | Conectar `CandyBarSelection.tsx` a `GET /dulceria/productos` | Frontend | #2 | Un producto creado en #3 aparece en el flujo de compra del cliente sin redeploy | ✅ Hecho |
| 5 | `listarMisCompras()` en `ventas.api.ts` | Frontend | #1 | Llamada tipada a `GET /ventas` | ✅ Hecho |
| 6 | `MisCompras.tsx` | Frontend | #1, #5 | Cliente ve sus compras con estado y detalle; un cliente no ve compras ajenas (probar con 2 usuarios) | ✅ Hecho |

Las tareas #2–#4 y #5–#6 son independientes entre sí — se pueden paralelizar entre dos
personas, igual que la separación por dueño de módulo en `plan-backend.md`.

**Nota sobre el orden real:** las tareas #2–#4 (dulcería) se hicieron primero; #5–#6
("mis compras") quedaron pausadas más tiempo del previsto — se retomaron recién
cuando el usuario preguntó explícitamente por qué el cliente todavía no veía sus
compras. Quedan documentadas acá para que no vuelva a pasar desapercibido en el
resto del proyecto: si una tarea de este documento no se hace en el momento, hay
que decirlo explícitamente en vez de dejarla implícita.

## 4. Verificación

- Backend: extender `ventas.service.spec.ts` (unit, relations mockeadas) y agregar caso a
  `ventas.service.integration.spec.ts` si existe, o crear uno, contra Supabase real.
- Frontend: probar manualmente en navegador (no hay suite e2e de frontend hoy, según lo
  reportado en la auditoría) — flujo completo: admin crea producto dulcería → aparece en
  `CandyBarSelection` → cliente compra → aparece en `MisCompras` con el detalle correcto.
- Regresión: correr `qa-reviewer` en modo FEATURE sobre `ventas` después del cambio de
  relations, por el riesgo de N+1 o de romper el shape que ya consume `ProcesoCompra.tsx`
  (que hoy solo lee la respuesta de `POST /ventas`, no de `GET /ventas` — bajo riesgo pero
  confirmar).

## 5. No-regresión / riesgos

- El cambio de `relations` en TypeORM no altera el esquema ni rompe compatibilidad hacia
  atrás: los campos planos (`idFuncion`, `subtotal`, etc.) siguen presentes, solo se
  agregan objetos anidados.
- Si se decide usar un DTO de respuesta en vez de devolver la entidad con relaciones, eso
  sí es un cambio de contrato — avisar a quien consuma `GET /ventas/:id` hoy (revisar si
  `ProcesoCompra.tsx` o el agente de voz ya lo llaman) antes de cerrarlo.
- Nada de esto necesita tocar `base_datos_cine_ia_completa.sql` ni
  `docs/db-schema-notes.md`.

## 6. Cierre — qué se implementó realmente (2026-09-16)

Diferencias puntuales contra el diseño de las secciones 1-5, para que quien lea esto
después no busque algo que se decidió no hacer:

- **`VentaDetalladaDto`** (sección 2.1, "evaluar si conviene"): se descartó. Se
  optó por devolver la entidad con `relations` directo, igual que el resto del
  proyecto no envuelve sus respuestas en DTOs de lectura — mantiene consistencia
  con el resto del código en vez de introducir un patrón nuevo para un solo
  endpoint.
- **`Venta.detalleEntradas`/`detalleDulceria` como `@OneToMany`** (sección 2.1):
  tampoco se agregaron como relaciones de la entidad. `VentasService.buscarPorId`
  consulta `DetalleVentaEntrada`/`DetalleVentaDulceria` con sus propios repos
  filtrando por `idVenta`, en vez de declarar las primeras `@OneToMany` del
  esquema — mismo resultado, sin tocar la entidad `Venta`.
- **`DigitalTicketWidget`** (sección 2.2): no se reutilizó — no existía un
  componente con ese nombre en el proyecto real (era una referencia del RF18 /
  UI generativa, todavía no construida). `MisCompras.tsx` es una vista nueva con
  su propio diseño (tarjetas expandibles), no un ticket reutilizado.
- **`GET /dulceria/productos?idCategoria=`** (sección 2.3): no se implementó
  como query param en el backend — `CandyBarSelection.tsx` filtra por categoría
  del lado del cliente sobre la lista completa ya traída, alcanza para el volumen
  de productos que maneja este proyecto.
- **`ProcesoCompra.tsx` / agente de voz consumiendo `GET /ventas/:id`** (sección
  5, riesgo de romper el shape): confirmado que no lo hacen — `ProcesoCompra.tsx`
  solo lee la respuesta de `POST /ventas` (`Venta` plano, sin tocar), y
  `ia-gateway.service.ts` tampoco llama `buscarPorId`. El cambio de shape en
  `buscarPorId` no rompió ningún consumidor existente.

## 7. Trabajo extra (no estaba en este plan)

Surgió en el camino, documentado en `plan-backend.md`/`docs/db-schema-notes.md`
(cuando implicó esquema) en vez de acá, pero se deja la referencia para que quede
todo conectado:

- **`productos_dulceria.imagen_url`** (columna nueva, Cloudinary) — ver
  `docs/db-schema-notes.md`, "Imagen real de productos de dulcería".
- **Dulcería viajando en `POST /ventas`** (`detalle_venta_dulceria` insertado
  desde `VentasService.crear`, no solo desde el catálogo) — ver `plan-backend.md`,
  nota "Corrección (2026-09-16) — paso 6 de `ventas`".
- **Atajo de precio en `FuncionForm.tsx`** ("+ Nuevo" con dedup contra precios
  vigentes existentes) — no tocó esquema ni esta feature, es una mejora de UX
  del módulo `precios`/`funciones`, sin documento propio.
