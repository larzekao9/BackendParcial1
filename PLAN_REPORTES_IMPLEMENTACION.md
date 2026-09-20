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
| Diseño "Cinematic Pro Dark" (mockup) | ⚠️ Funcional completo; **layout/registro visual difiere del mockup** (ver "Checklist visual vs mockup") |

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
| 12 | Debounce en filtros (evitar request por cada keystroke en dates) | ✅ Hecho (2026-09-20) | `AdminReportes.tsx` + `hooks/useDebounce.ts` |
| 13 | Persistencia de filtros en `localStorage` | ✅ Hecho (2026-09-20) | `AdminReportes.tsx` + `hooks/useLocalStorage` |
| 14 | Exportar CSV (botón por tabla/card) | ✅ Hecho (2026-09-20) | `ReportesTablas.tsx` (`TablaConExport`) + `exportarCSV` en `reportes.utils.ts` |
| 15 | Responsive tables/cards (scroll horizontal en móvil + columnas prioritarias) | ✅ Hecho (2026-09-20) | `ReportesTablas.tsx` (overflow-x-auto + `min-w`) |
| 16 | Tooltip en KPIs (explicar variación) | ✅ Hecho (2026-09-20) | `AdminReportes.tsx` |

### P2 — Pulido visual (solo si sobra tiempo, recortar primero si el cronograma aprieta)

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 17 | Animaciones de entrada (fade/slide) en KPIs/tablas | ✅ Hecho (2026-09-20) `.entrada-suave` en `index.css` + `AdminReportes.tsx` |
| 18 | Ajustar fuente headline `Syne` → `Outfit`/mantener (decisión de diseño, no bloqueante) | ⚠️ Decisión: **mantener `Syne`** (consistencia con el modo kiosco que usa `--font-display-hero: Syne`). El mockup usa Outfit solo para display; cambiar la fuente global retematiza todo el admin, no solo Reportes. Reevaluar post-defensa. |
| 19 | Accesibilidad (aria-labels en botones paginación, roles de tabla) | ✅ Hecho (2026-09-20) `aria-label` paginación, `scope="col"` en th, `aria-pressed` en agrupación, tablas con `overflow-x-auto` |

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
- [x] Debounce en filtros (#12)
- [x] Persistencia `localStorage` (#13)
- [x] Export CSV (#14)
- [x] Responsive (#15) + Tooltips KPI (#16)
- [x] Probar contra backend real — 11 endpoints consumidos desde `AdminReportes.tsx`
- [x] Paginación: offset reset, `hasMore` correcto, total matches
- **Test:** 8 tests unitarios (`tests/reportes.utils.test.ts`) siguen pasando sobre la versión con export CSV.
- **Cabe aclarar:** el Día 3 lo mergió trabajo paralelo (commits `60f6549`/`4cb8bdb`/`1c52529` en el frontend).

### Día 4 (2026-09-23/24) — Pulido + Defensa
- [x] P2: animaciones (#17) + a11y (#19) — hechos; fuente (#18) → decisión documentada (mantener `Syne`)
- [x] Comparar visualmente contra `code.html`/`screen.png` (checklist punto por punto) — resultado en "Checklist visual vs mockup" abajo
- [x] Fix `tsc`: `TablaConExport`/`exportarCSV` tipados con genéricos corregidos (el código Day 3 rompía `npm run lint`)
- [x] Documentar en README: endpoints, tipos, cómo probar — sección "Reportes" en `Parcial1_Sw2_Frontend/README.md`
- [x] Commit final + push + tag `v1.0-reports`
- [ ] **Ensayo:** Demo completa 5 min — guión en "Demo script (5 min)" abajo

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
| **Visual vs mockup** | ✅ Layout alineado (V1–V7, ver "Checklist visual vs mockup"). Pendiente: verificación visual manual en navegador (sin herramienta de screenshot en esta sesión) |
| **Accesibilidad** | Tab navigation, aria-labels, contraste OK |

---

## Comandos de verificación rápida

```bash
# Backend
cd Backend && npm run test          # 25 tests reportes + integración
cd Backend && npm run test:e2e      # si hay DB real

# Frontend
cd Parcial1_Sw2_Frontend && npm run lint     # tsc --noEmit
cd Parcial1_Sw2_Frontend && npm test         # 8 tests unitarios (node:test + tsx)
cd Parcial1_Sw2_Frontend && npm run build

# Docker
docker compose up -d --build
curl -s http://localhost:3333/api/reportes/ventas
curl -s http://localhost:3000
```

---

## Checklist visual vs mockup (Día 4 — comparación contra `code.html`/`screen.png`)

Comparado contra `vista de reportes/code.html` + tokens de `DESIGN.md` (la evaluación se hizo sobre el HTML del mismo diseño que renderiza `screen.png`). Estado del **layout** y piezas visuales, fila por fila:

| # | Pieza del mockup | Estado | Detalle |
|---|---|---|---|
| V1 | Badge `CU05 • DATOS REALES` + título + **subtítulo** "Análisis del rendimiento comercial…" | ✅ Hecho (2026-09-20) | Subtítulo agregado en `AdminReportes.tsx` |
| V2 | Pills de fechas + Agrupar + rango mono + Filtrar/Restablecer | ✅ | `ReportesFiltros.tsx` los implementa (en card aparte, equivalente) |
| V3 | **Banner cyan de conciliación** ("Las ventas pendientes o canceladas no se computan…") + tag `CU05-RF08 COMPLIANT` | ✅ Hecho (2026-09-20) | Banner + badge agregados debajo del resumen de período |
| V4 | **4 KPIs con ícono-tile de color** + trend pill `↑ +28%` arriba derecha + footer descriptivo | ✅ Hecho (2026-09-20) | `renderKPI` rediseñado: tile de ícono (lucide-react), pill de tendencia arriba-derecha, footer descriptivo por KPI |
| V5 | **Insights**: header `⚡ ANÁLISIS DEL PERÍODO & INSIGHTS` + 4 tiles con emoji | ✅ Hecho (2026-09-20) | `ReportesInsights.tsx`: header con ícono `Zap` + emoji por tipo de insight. Caption dice "Motor de reportes LUMEN" (no "Recomendación Inteligente" — las frases son reglas sobre datos reales, no IA, y llamarlo así sería engañoso) |
| V6 | **Fila de 3 charts en grid** (Evolución dual + Métodos con barras % + Promos con usos/descuento) | ✅ Hecho (2026-09-20) | `AdminReportes.tsx`: grid `xl:grid-cols-3` con chart combinado + `ReportesCardMetodoPago` + `ReportesCardPromocion` en la misma fila |
| V7 | **Tablas grid 7/12 + 5/12** (Película + Dulcería) con barra `% TOTAL`, columna `ACCIÓN` y subtotal | ✅ Hecho (2026-09-20) | `ReportesTablaPelicula`/`ReportesTablaProducto` reescritas: barra de `%`, toggle "Ordenar" (client-side sobre la página actual), columna `Acción → Detalle` (filtra "Ventas por función" por título, sin ruta de detalle inexistente), subtotal en dulcería. Grid 7/12+5/12 en `AdminReportes.tsx`. **Omitido a propósito:** columna `CATEGORÍA` (dulcería) y `PROD. DULCERÍA` (película) del mockup — no existen en `ReportePorProducto`/`ReportePorPelicula` reales, y no se fabrican datos falsos. "Ventas por función" no tiene equivalente en el mockup — se dejó como sección de detalle adicional debajo, filtrable desde "Detalle" |
| V8 | Tipografía display (Outfit) | ⚠️ | Decisión (gap #18): mantener `Syne` |

**Conclusión:** la **funcionalidad** está completa y probada, y el **layout ahora reproduce el mockup** (V1–V7). Verificado con `tsc --noEmit`, 8 tests unitarios y `vite build`, todos en verde; falta la verificación visual manual en `http://localhost:3000/admin` (no hay herramienta de navegador en esta sesión para capturar pantalla). Limitaciones documentadas: `V5` (motor no es IA real) y `V7` (columnas que requerirían datos que el backend no expone, omitidas en vez de inventadas).

---

## Demo script (5 min)

1. **Abrir** Reportes en `/admin` (datos reales) — 10 s. Mostrar badge CU05 + título.
2. **Presets rápidos**: Hoy → KPIs; volver a "Este mes" — 30 s. Mencionar debounce.
3. **Rango manual + Agrupar**: cambiar `desde`, **Filtrar** (offset resetea, banner del período actualiza); Día/Semana/Mes en el gráfico — 45 s.
4. **Insights**: leer 1 frase apoyada en datos reales — 20 s.
5. **Gráfico combinado**: eje dual Monto (emerald) + Entradas (cyan) — 20 s.
6. **Cards Métodos de Pago / Promociones**: barra de % y total — 30 s.
7. **Paginación** en "Ventas por película": Siguiente/Anterior, página X/Y — 30 s.
8. **Exportar CSV**: descarga y abre el archivo — 30 s.
9. **Recargar página**: filtros/paginación restaurados (localStorage) — 20 s.
10. **Contraste con la realidad**: solo `estado='pagada'` entra en reportes; Stripe en modo prueba — 45 s.

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
