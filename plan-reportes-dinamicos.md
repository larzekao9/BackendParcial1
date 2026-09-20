# Plan — Reportes dinámicos y métricas (CU05/RF08)

Complementa `plan-backend.md` y `CLAUDE.md`. Auditoría hecha 2026-09-20 contra
`Backend/src/modules/reportes/**` y `Parcial1_Sw2_Frontend/src/**` reales (no se
asume nada de memoria vieja). Cubre qué falta para que el módulo de reportes deje
de ser "3 endpoints estáticos con rango de fechas" y pase a soportar las métricas
que pide RF08 (ventas totales, por película, **por producto**) más una capa
dinámica (comparativas, agrupación temporal, voz, UI generativa).

**Fecha límite real: defensa 2026-09-24.** Este plan está priorizado (P0–P3)
pensando en esos ~4 días, no en un roadmap ideal.

---

## 1. Diagnóstico del estado actual

| Capa | Estado | Evidencia |
|---|---|---|
| Backend — esquema de datos | ✅ Suficiente, sin migraciones necesarias | `ventas`, `detalle_venta_entradas`, `detalle_venta_dulceria`, `pagos`, `promociones` ya tienen todas las columnas que hacen falta para los reportes nuevos (ver sección 2). |
| Backend — endpoints existentes | ⚠️ Parcial | `reportes.controller.ts`: solo `GET /reportes/ventas`, `/por-pelicula`, `/por-funcion`, todos con `@Roles('administrador')` (RF11 ya cumplido) y filtro `RangoFechasDto { desde?, hasta? }` (`reportes.controller.ts:8-27`). |
| Backend — corrección de datos | ❌ **Bug real** | `ReportesService` nunca filtra por `venta.estado` (`reportes.service.ts:66-177`). Una venta `pendiente`, `pendiente_pago`, `anulada` o `cancelada` se cuenta igual que una `pagada`. Los KPIs del admin (monto recaudado, entradas vendidas) hoy están inflados por ventas que nunca se cobraron o se cancelaron. |
| Backend — cobertura de RF08 | ❌ Incompleto | RF08 pide explícitamente reportes "por producto" (dulcería). No existe `porProducto` ni endpoint `/reportes/por-producto`, pese a que `detalle_venta_dulceria` (`detalle-venta-dulceria.entity.ts`) ya tiene todo lo necesario. |
| Backend — pruebas | ✅ Buen punto de partida | `reportes.service.spec.ts` ya cubre `resumenVentas`/`porPelicula`/`porFuncion` con mocks de `QueryBuilder` (4 tests) — mismo patrón a replicar en los reportes nuevos. |
| Backend — voz (RF08 "por voz") | ❌ No existe | `ia-gateway` (Roly) todavía no está construido — hoy el admin **no puede pedir un reporte por voz**, solo por HTTP directo. |
| Frontend — consumo | ⚠️ Parcial, ya conectado a datos reales | `AdminReportes.tsx` + `reportes.api.ts` + `reporte.types.ts` ya consumen los 3 endpoints existentes: 3 tarjetas KPI (ventas totales, monto, entradas) + 2 tablas (`ReportesTablaPelicula`, `ReportesTablaFuncion`) + un filtro de rango de fechas. Sin gráficos, sin dulcería, sin método de pago, sin comparación de periodos. |
| Frontend — librería de gráficos | ❌ No existe | No hay `recharts`/`chart.js`/similar en `Parcial1_Sw2_Frontend/package.json`. Cualquier gráfico de tendencia requiere instalar una dependencia nueva. |
| UI generativa (RF18/CU08) | ❌ No definida para reportes | El catálogo de widgets mencionado en RF18 (`MovieGridWidget`, `SeatingMapWidget`, `DigitalTicketWidget`) no incluye ningún widget de dashboard/reporte. |

**Conclusión:** la base (esquema, guard de rol, patrón de dos queries para evitar
doble conteo por `JOIN` fan-out) está bien hecha y no hay que tocarla. Lo que falta
es (a) un bug de corrección (`estado`), (b) cobertura de métricas que RF08 ya pide
y no están, y (c) la capa "dinámica" (series de tiempo, voz, widgets) que hoy no
existe en ningún lado.

---

## 2. Corrección crítica — filtrar por `estado` (P0)

Antes de agregar nada nuevo, arreglar el conteo actual:

- Agregar `qb.andWhere('venta.estado = :estado', { estado: 'pagada' })` (o un
  parámetro opcional `estados?: EstadoVenta[]` con default `['pagada']`) en
  `resumenVentas`, `porPelicula` y `porFuncion` — en las dos queries de cada
  método (la de `ventasRepo` y la de `detalleRepo`, esta última vía el join a
  `venta`).
- Decisión a tomar con el dueño del dominio (Luis Blanco): ¿el reporte debe poder
  mostrar también `pendiente_pago` para un "en curso"? Recomendación: default
  `pagada` únicamente (dinero real cobrado), con un query param opcional
  `?incluirPendientes=true` para el caso en que el admin quiera ver el embudo
  completo. No hace falta migración, es lógica de `ReportesService`.
- Test nuevo: tabla de decisión estado → se cuenta/no se cuenta, mismo patrón que
  el que ya se hizo para RF03/RF19 en `ventas.service.spec.ts` (commit
  `9087ae8`).

Esto es el ítem de mayor impacto por menor esfuerzo del plan: sin esto, cualquier
métrica nueva hereda el mismo conteo inflado.

---

## 3. Métricas nuevas (P1 — cubren RF08 completo)

Todas siguen el patrón ya usado: dos queries separadas (una sobre `ventas`
agregada, otra sobre la tabla de detalle correspondiente) combinadas en memoria
con un `Map`, para no repetir el problema de fan-out documentado en el comentario
de cabecera de `reportes.service.ts:38-56`.

### 3.1 `GET /reportes/por-producto`

- Igual forma que `porPelicula`, pero agregando sobre `detalle_venta_dulceria`
  (`join` a `producto` → `productos_dulceria.nombre`, y a `venta` para el filtro
  de rango/estado).
- Respuesta: `{ idProducto, nombre, cantidadVendida, montoTotal }[]`.
- Nota: `detalle_venta_dulceria.precioUnitario` está congelado al momento de la
  venta (no hay que volver a mirar `productos_dulceria.precio` actual) — igual
  que ya se hace con `detalle_venta_entradas`.

### 3.2 `GET /reportes/por-metodo-pago`

- Agrega sobre `pagos` filtrando `estado = 'exitoso'` (no `pagos.estado`
  confundir con `ventas.estado`) y agrupando por `metodoPago`.
- Útil para que el admin vea cuánto entra por efectivo vs. tarjeta (Stripe/QR
  siguen rechazados en el alcance actual, van a aparecer en 0 hasta que se
  implementen — no ocultar la fila, es información real del estado del sistema).

### 3.3 `GET /reportes/por-promocion`

- Agrupa `ventas` por `idPromocion` (excluyendo `NULL`), muestra
  `nombre`/`tipoDescuento` (join a `promociones`), cantidad de ventas que la
  usaron y `SUM(descuentoAplicado)` — mide si una promoción realmente mueve
  ventas o solo resta margen.

### 3.4 `GET /reportes/dashboard` — ✅ implementado (2026-09-20)

- Endpoint combinado para la vista principal del admin: resumen general +
  comparación contra el periodo anterior de igual longitud (ej. si `desde`/`hasta`
  cubren 7 días, comparar contra los 7 días previos) → `{ actual, anterior,
  variacionPorcentual }` por cada métrica clave (monto, entradas, ventas).
- Sin `desde`/`hasta` usa los últimos 7 días terminando hoy; reutiliza
  `resumenVentas` (hereda el filtro de `estado = 'pagada'`). `variacionPorcentual`
  es `null` cuando el periodo anterior es 0 (no divide por cero).
- Implementado en `ReportesService.dashboard` + `GET /reportes/dashboard`
  (`reportes.controller.ts`), 4 tests nuevos en `reportes.service.spec.ts`.
- **Pendiente del plan:** consumirlo en el frontend (tarjetas KPI con variación
  ↑/↓ + `%`).

---

## 4. Parámetros comunes — agrupación temporal y paginación (P2)

- Nuevo DTO `FiltroReporteDto extends RangoFechasDto` con:
  - `agrupacion?: 'dia' | 'semana' | 'mes'` — para series de tiempo (necesario
    si se quiere un gráfico de línea/barras de ventas por día, no solo un total).
    Se traduce a `DATE_TRUNC('day'|'week'|'month', venta.fecha_hora)` en el
    `GROUP BY`.
  - `limit?`/`offset?` (opcionales, default sin límite por ahora) en
    `por-pelicula`/`por-funcion`/`por-producto` — hoy no hay paginación y con
    pocas películas/funciones no es urgente, pero conviene dejar el contrato listo
    antes de que el catálogo crezca.
- Nuevo método `ReportesService.serieTemporal(filtro)` → `{ fecha, montoTotal,
  cantidadEntradas }[]`, consumido por el gráfico de tendencia del dashboard.

---

## 5. Frontend — dashboard visual (P1/P2)

- Instalar una librería de gráficos ligera (recomendado: `recharts`, se integra
  bien con componentes React sin config extra). Consultar la skill `dataviz` del
  workspace al momento de implementar los charts (paleta, tipos de gráfico,
  accesibilidad) en vez de improvisar colores.
- `AdminReportes.tsx`: agregar
  - Gráfico de línea/barras con `serieTemporal` (ventas por día en el rango
    elegido).
  - Tarjetas KPI con la variación vs. periodo anterior (flecha ↑/↓ + %) usando
    `GET /reportes/dashboard`.
  - Nueva tabla `ReportesTablaProducto` (mismo patrón que
    `ReportesTablaPelicula`/`ReportesTablaFuncion` en `ReportesTablas.tsx`).
  - Nueva tabla o gráfico de torta para método de pago.
- `reportes.api.ts` / `reporte.types.ts`: agregar las funciones y tipos
  correspondientes a los 4 endpoints nuevos, mismo patrón que los 3 actuales.

---

## 6. Integración por voz (RF08 "por voz", RF09) — P3

Depende de que exista `ia-gateway` (todavía no construido, ver `AGENTS.md`). No
bloquea la defensa si no alcanza el tiempo, pero el contrato debe quedar
compatible desde ahora:

- Intención nueva en `ai-service`: `consultar_reporte` con slots `tipo`
  (ventas/película/función/producto/método de pago/dashboard) y `rango`
  (hoy/semana/mes/rango custom).
- **RF09 aplica literalmente acá**: si el admin dice "dame el reporte de ventas"
  sin especificar periodo, el agente **pregunta** ("¿de qué periodo? hoy, esta
  semana, este mes, o me das un rango") en vez de asumir un default en silencio.
- **RF10 con matiz para reportes**: al ser de solo lectura, no hace falta el
  doble-check de confirmación que sí exige una mutación (RF06/RF07/RF19) — el
  `ia-gateway` llama directo a `GET /reportes/*` (nunca lee la base directamente)
  y verbaliza el resultado.
- Registrar la intención + el reporte devuelto en `interacciones_ia` (esto es
  para RF18/trazabilidad de UI generativa, **no** en `log_acciones`, que es solo
  para mutaciones administrativas por RF12).

---

## 7. UI generativa — widget de reporte (RF18/CU08) — P3

- Definir un `ReportWidget`/`DashboardWidget` en el catálogo de widgets junto a
  `MovieGridWidget`/`SeatingMapWidget`/`DigitalTicketWidget`: recibe el tipo de
  reporte + los datos ya calculados por el backend y decide entre tabla, tarjetas
  KPI o gráfico según el `tipo` detectado por la intención.
- Sin esto, un reporte pedido por voz igual puede responderse solo con audio
  (cumple el piso de RF16), pero pierde el refuerzo visual que pide RF18.

---

## 8. Rendimiento (P2, revisar antes de P3)

- Confirmar índice sobre `ventas.fecha_hora` (todas las queries filtran por ahí)
  y sobre `ventas.estado` una vez que la corrección de la sección 2 esté en
  producción — documentar en `docs/db-schema-notes.md` si se agrega un índice
  nuevo (regla del proyecto: cualquier cambio de esquema, aunque sea un índice,
  se documenta ahí).
- Con el volumen de datos actual (proyecto de defensa, no producción real) no
  hace falta caché ni vista materializada. Dejarlo anotado como "no ahora,
  reevaluar si el dataset de prueba crece antes del 2026-09-24".

---

## 9. Fuera de alcance de este plan

- Exportación a CSV/PDF — deseable pero no bloqueante para un prototipo
  funcional; se puede agregar después de la defensa reutilizando las mismas
  queries.
- Reportes por rol de vendedor/cajero — no existe ese concepto en el esquema
  actual (`usuarios.rol` es solo cliente/administrador).
- Cualquier cambio de esquema (`base_datos_cine_ia_completa.sql`) — este plan no
  necesita ninguno, todo son queries nuevas sobre tablas ya existentes.

---

## 10. Tareas priorizadas

| # | Tarea | Prioridad | Capa | Estimación |
|---|---|---|---|---|
| 1 | Filtrar `venta.estado = 'pagada'` en los 3 endpoints existentes (+ tests) | P0 | Backend | ~1h |
| 2 | `GET /reportes/por-producto` (dulcería) + tests | P1 | Backend | ✅ Hecho (backend + 3 tests) — falta consumo en frontend |
| 3 | `GET /reportes/dashboard` (comparación vs. periodo anterior) + tests | P1 | Backend | ✅ Hecho (2026-09-20) — falta solo consumo en frontend |
| 4 | Frontend: tabla de producto + tarjetas KPI con variación % | P1 | Frontend | ~2h |
| 5 | `GET /reportes/por-metodo-pago` + tests | P2 | Backend | ~1.5h |
| 6 | `GET /reportes/por-promocion` + tests | P2 | Backend | ~1.5h |
| 7 | `agrupacion` (día/semana/mes) + `serieTemporal` + gráfico en frontend | P2 | Full-stack | ~4h |
| 8 | Paginación opcional en `por-pelicula`/`por-funcion`/`por-producto` | P2 | Backend | ~1h |
| 9 | Integración de voz (`consultar_reporte` en `ia-gateway`) | P3 | ai-service + Backend | Depende de que exista `ia-gateway` |
| 10 | `ReportWidget`/`DashboardWidget` (RF18) | P3 | Frontend + ai-service | Depende de la tarea 9 |
| 11 | Exportación CSV | P3 (post-defensa) | Backend | ~2h |

Orden recomendado dado el límite del 2026-09-24: **1 → 2 → 3 → 4**, y solo si
sobra tiempo, avanzar con 5–8. Las tareas 9–11 no son razonables en la ventana
que queda y no deberían intentarse a costa de las P0/P1.

---

## 11. Pruebas

- Backend: replicar el patrón de `reportes.service.spec.ts` (mocks de
  `QueryBuilder` vía `buildQueryBuilderMock`/`buildService`) para cada método
  nuevo — ya hay 4 tests de referencia ahí mismo.
- Agregar la tabla de decisión de `estado` (ventas pagada/pendiente/anulada/
  cancelada → se cuenta o no) como test explícito, mismo estilo que la tabla de
  decisión de RF03/RF19 ya hecha para `ventas` (commit `9087ae8`).
- Si el resto del proyecto corre contra Supabase real para integración (106/106
  tests actuales), sumar al menos un test de integración real por endpoint nuevo,
  no solo mocks.
