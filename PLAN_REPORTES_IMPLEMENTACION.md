# Plan de Implementación — Vista de Reportes Admin (RF08/CU05)

**Objetivo:** Vista de reportes 100% funcional, conectada al backend, alineada al
mockup `Parcial1_Sw2_Frontend/vista de reportes/` ("Cinematic Pro Dark"), sin bugs.
**Fecha límite:** Defensa 2026-09-24 (4 días desde hoy 2026-09-20).

**Referencia de diseño:** `Parcial1_Sw2_Frontend/vista de reportes/DESIGN.md` +
`screen.png` + `code.html`. Los tokens de color ya coinciden con
`Parcial1_Sw2_Frontend/src/index.css` (mismo `on-surface-variant: #d8c3ad`, etc.) —
**no hace falta retematizar**, solo ajustar fuente de headlines (`Syne` actual vs
`Outfit`/`Plus Jakarta Sans` del mockup, decidir si se cambia o se deja `Syne`) y
construir los componentes/datos que hoy faltan.

---

## Estado actual

| Componente | Estado |
|------------|--------|
| Backend endpoints | ✅ 11 endpoints + tests (25 passing) |
| Frontend tipos/API/tablas/charts | ✅ Implementados (versión simple, sin alinear al mockup) |
| Bug crítico `variacionPorcentual: null` | ✅ Fixado |
| Circular dependency `Venta↔Pago` | ✅ Resuelto |
| Layout con sidebar admin (`AdminConsole.tsx`) | ✅ Ya existe y coincide con el mockup |
| Diseño "Cinematic Pro Dark" (mockup) | ⚠️ Nuevo — no estaba contemplado en la v1 de este plan |

---

## Gaps pendientes (priorizados)

### P0 — Funcionalidad core + alineación visual con el mockup (bloquean "demo lista")

| # | Tarea | Esfuerzo | Archivos |
|---|-------|----------|----------|
| 1 | Reset offset al cambiar filtros (`desde`, `hasta`, `agrupacion`) | ✅ Hecho (2026-09-20) | `AdminReportes.tsx` |
| 2 | Manejo de error visible (toast/snackbar) en `catch` | ✅ Hecho (2026-09-20) | `AdminReportes.tsx` + `hooks/useToast.tsx` |
| 3 | Loading por sección (skeleton/spinner por tabla/gráfico) | ✅ Hecho (2026-09-20) | `AdminReportes.tsx` + `ReportesSkeletons.tsx` |
| 4 | Empty state en gráficos cuando `serieTemporal.length === 0` | ✅ Hecho (2026-09-20) | `ReportesChart.tsx` |
| 5 | Validación de fechas (`hasta < desde` → swap) | ✅ Hecho (2026-09-20) | `AdminReportes.tsx` |
| 6 | **4to KPI "Productos vendidos"** (suma de `porProducto`) | ✅ Hecho (2026-09-20) | `AdminReportes.tsx` |
| 7 | **Chart único "Evolución de Ventas"** con Monto + Entradas combinados (eje dual) | ✅ Hecho (2026-09-20) | `ReportesChart.tsx` (modo `combinado`) |
| 8 | **Cards de Métodos de Pago / Promociones** con barra de `% del total` (reemplaza tablas planas) | ✅ Hecho (2026-09-20) | `ReportesCards.tsx` |
| 9 | **Filtros rápidos** (Hoy/Ayer/Esta semana/Este mes/Mes anterior) + botones explícitos "Filtrar"/"Restablecer" + toggle pill "Agrupar Día/Semana/Mes" | ✅ Hecho (2026-09-20) | `ReportesFiltros.tsx` |

### P1 — Calidad de UX + resto del mockup

| # | Tarea | Esfuerzo | Archivos |
|---|-------|----------|----------|
| 10 | **Panel "Análisis del período & Insights"** — texto narrativo derivado de los datos cargados (no LLM: reglas simples) | ✅ Hecho (2026-09-20) | `ReportesInsights.tsx` + `reportes.utils.ts` |
| 11 | **Banner de conciliación** + resumen "Mostrando X días • Período comparado: Y días previos" | ✅ Hecho (2026-09-20) | `AdminReportes.tsx` |
| 12 | Debounce en filtros (evitar request por cada keystroke en dates) | 20 min | `AdminReportes.tsx` |
| 13 | Persistencia de filtros en `localStorage` | 15 min | `AdminReportes.tsx` |
| 14 | Exportar CSV (botón por tabla/card) | 45 min | `AdminReportes.tsx` + util |
| 15 | Responsive tables/cards (scroll horizontal en móvil + columnas prioritarias) | 20 min | `ReportesTablas.tsx` |
| 16 | Tooltip en KPIs (explicar variación) | 10 min | `AdminReportes.tsx` |

### P2 — Pulido visual (solo si sobra tiempo, recortar primero si el cronograma aprieta)

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 17 | Animaciones de entrada (fade/slide) en KPIs/tablas | 20 min |
| 18 | Ajustar fuente headline `Syne` → `Outfit`/mantener (decisión de diseño, no bloqueante) | 15 min |
| 19 | Accesibilidad (aria-labels en botones paginación, roles de tabla) | 20 min |

---

## Plan de ejecución (4 días)

### Día 1 (hoy, 2026-09-20) — Core funcional + primeras piezas visuales del mockup
- [x] Reset offset al cambiar `desde`/`hasta`/`agrupacion` (#1)
- [x] Validación `hasta < desde` (#5)
- [x] Error toast visible (#2)
- [x] Loading por sección (#3)
- [x] 4to KPI "Productos vendidos" (#6)
- [x] Chart combinado "Evolución de Ventas" (#7)
- **Test:** Cambiar filtros → offset=0; sin datos → mensaje; error 500 → toast; KPI de productos coincide con suma de `porProducto`.

### Día 2 (2026-09-21) — Resto del mockup (P0 + arranque P1)
- [x] Cards de Métodos de Pago / Promociones con % del total (#8) — `ReportesCardMetodoPago`/`ReportesCardPromocion` en `ReportesCards.tsx`
- [x] Filtros rápidos + botones Filtrar/Restablecer + toggle pill agrupación (#9) — `ReportesFiltros.tsx`
- [x] Panel de Insights narrativo (#10) — `ReportesInsights.tsx` + lógica pura en `src/core/reportes.utils.ts`
- [x] Banner de conciliación + resumen de período (#11) — en `AdminReportes.tsx`
- [x] **Test:** 8 tests unitarios (`tests/reportes.utils.test.ts`, node:test sin deps nuevas): cada preset genera el rango correcto; `calcularShare` suma 100 y maneja 0/vacío; `generarInsights` refleja los datos reales del rango.

### Día 3 (2026-09-22) — UX fluida + integración real
- [ ] Debounce en filtros (#12)
- [ ] Persistencia `localStorage` (#13)
- [ ] Export CSV (#14)
- [ ] Responsive (#15) + Tooltips KPI (#16)
- [ ] Probar contra backend real (docker up) los 11 endpoints
- [ ] Casos: sin ventas, solo promos, solo dulcería, rango sin datos
- [ ] Verificar paginación: offset reset, hasMore correcto, total matches
- **Test:** Mobile view; recargar página → filtros guardados; exportar → archivo válido; edge cases sin crash.

### Día 4 (2026-09-23/24) — Pulido + Defensa
- [ ] P2 solo si el tiempo alcanza (animaciones, fuente, a11y)
- [ ] Comparar visualmente contra `screen.png` (checklist punto por punto)
- [ ] Documentar en README: endpoints, tipos, cómo probar
- [ ] Commit final + push + tag `v1.0-reports`
- **Ensayo:** Demo completa 5 min (filtros rápidos → insights → gráfico combinado → cards % → paginación → export).

---

## Checklist de verificación (Definition of Done)

| Criterio | Comprobación |
|----------|--------------|
| **Backend OK** | `npm run test` (25 tests) + integración passing |
| **Frontend build** | `npm run build` sin warnings críticos |
| **Docker up** | `docker compose up -d` → 3000/3333 responden |
| **Filtros** | Presets rápidos + rango manual → offset=0, datos actualizan |
| **Paginación** | Anterior/Siguiente funciona, página X/Y correcta, hasMore |
| **KPIs** | 4 cards (ventas, monto, entradas, productos) con variación % |
| **Gráfico combinado** | Monto + Entradas en un solo chart, empty state si no hay datos |
| **Cards % Métodos/Promos** | Barra de share visual, coincide con datos reales |
| **Insights** | Texto narrativo correcto según datos del rango activo |
| **Export CSV** | Botón descarga archivo válido con headers correctos |
| **Errores** | 500/401/red → toast visible, no crash |
| **Loading** | Skeletons/spinners por sección, no bloqueo global |
| **Persistencia** | Recargar → filtros/paginación restaurados |
| **Visual vs mockup** | Comparación lado a lado con `screen.png` sin discrepancias mayores |
| **Accesibilidad** | Tab navigation, aria-labels, contraste OK |

---

## Comandos de verificación rápida

```bash
# Backend
cd Backend && npm run test          # 25 tests reportes + integración
cd Backend && npm run test:e2e      # si hay DB real

# Frontend
cd Parcial1_Sw2_Frontend && npm run build
cd Parcial1_Sw2_Frontend && npm run lint

# Docker
docker compose up -d --build
curl -s http://localhost:3333/api/reportes/ventas
curl -s http://localhost:3000
```

---

## Riesgos y mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Backend cambia contrato | Media | Alto | Tipos compartidos en `core/types/reporte.types.ts`; tests de contrato |
| El chart combinado (eje dual) consume más tiempo del estimado en `recharts` | Media | Medio | Si se traba, hacer fallback a los 2 charts actuales y priorizar #8/#9/#10 |
| Panel de insights mal calibrado (texto raro con pocos datos) | Media | Bajo | Reglas con guardas explícitas para `0`/`null`, mensaje genérico si no hay suficiente variación |
| `recharts` bundle grande | Baja | Medio | Ya incluido; lazy load si necesario |
| Supabase lento en tests | Media | Medio | Tests unitarios mockeados; integración solo CI |
| Poco tiempo para P2 | Alta | Bajo | P2 es el primer recorte si el cronograma aprieta — no bloquea la demo |

---

## Entregables finales

1. **Código** en `main` con commits atómicos por feature
2. **Tag** `v1.0-reports` en ambos repos
3. **README** actualizado: endpoints, tipos, cómo probar localmente
4. **Demo script** (5 min) para defensa
