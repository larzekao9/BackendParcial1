# AGENTS.md — Contexto compartido para agentes

Documento único de contexto para **toda herramienta o subagente** que trabaje en
este repo. No es la fuente de verdad exhaustiva: cuanto más detalle necesites,
seguí los punteros de abajo. Regla de oro: **no dupliques** — si un dato ya vive
en `CLAUDE.md`, `docs/*` o `Backend/README.md`, referenciá y no lo copies acá.

---

## Qué es este proyecto

Sistema de venta y gestión de un cine donde la interacción principal es **voz**
(cliente compra entradas; admin gestiona cartelera, funciones y reportes), con una
capa de **UI generativa** que renderiza widgets dinámicos según la intención
detectada. Segundo parcial — Ingeniería de Software 2.

## Stack

| Componente | Tecnología | Estado |
|---|---|---|
| Backend de negocio | NestJS (TypeScript) | **En desarrollo** (`Backend/`) |
| Frontend | React + Vite + Tailwind (`Parcial1_Sw2_Frontend/`, repo separado de `hebertsb`) | Mockup visual, sin conexión real al backend |
| App móvil cliente | Flutter (`mobile-app/`) | No existe todavía |
| Servicio de IA (voz/NLU) | FastAPI (`ai-service/`) | No existe todavía |
| Base de datos | PostgreSQL vía Supabase | Esquema en `base_datos_cine_ia_completa.sql` |

**Discrepancia de contrato sin resolver**: el frontend llama a
`POST /auth/google` con `{ idToken }` (login con Google). El backend real
solo tiene `POST /auth/login` con `{ nombre, rol }` (login simplificado, ver
`docs/contratos-servicios.md`). No asumas que esto ya se coordinó entre
equipos.

## Estado actual del backend

- **Fase 0 (fundaciones)** — completa: scaffold NestJS, entidades TypeORM 1:1 con
  el esquema (18 tablas tras la normalización de `tipos_asiento` y el agregado de
  `pagos`/dulcería), guards globales (`JwtAuthGuard`/`RolesGuard`), `@Public()`/`@Roles()`,
  `ValidationPipe` y `HttpExceptionFilter` globales, login simplificado + login con Google.
- **Luis Ángel** — completo y verificado tras la migración a `tipos_asiento` (51/51 tests):
  `peliculas`, `salas`+`asientos`, `precios`, `promociones`. Pendiente NUEVO (agregado por
  esta actualización de esquema, no estaba en el plan original): CRUD propio de
  `tipos_asiento` y módulo `dulceria` (CU09/RF20). Ver `docs/plan-luis-angel.md` y
  `docs/plan-backend.md`.
- **Luis Blanco** — pendiente: `funciones`, `ventas`, `reportes`, y `pagos` (nuevo:
  Stripe + QR + webhook, ver `docs/plan-backend.md`).
- **Roly** — pendiente: `usuarios` (CRUD completo), `audit`, `ia-gateway`.

## Pendiente — App móvil (Flutter) + login Google en Android

**Fecha límite: defensa 2026-09-24 — para esa fecha hay que entregar prototipo
funcional.** `mobile-app/` (Flutter) todavía no existe como proyecto — hoy solo
están construidos `Backend/` (NestJS) y `Parcial1_Sw2_Frontend/`
(React web). El login con Google del backend (`POST /auth/google`, ver
`docs/db-schema-notes.md` "Login con Google") ya está listo para recibirlo: no
importa si el ID token viene de la librería web o de la de Android/Flutter, la
verificación (`google-auth-library`) es la misma.

Lo que falta, una vez exista el proyecto Flutter:
1. Generar el keystore de firma de la app y sacar su **SHA-1**
   (`keytool -list -v -keystore <ruta> ...` o `flutter build apk` con el
   keystore de debug/release).
2. Definir el **nombre de paquete** (`applicationId`, ej.
   `com.lumen.cinema`).
3. En Google Cloud Console, proyecto **`Parcial1-SW2-Cine`** (el mismo que ya
   existe, no crear uno nuevo) → Google Auth Platform → Clientes → Crear
   cliente → tipo **Android** → cargar paquete + SHA-1. El Client ID que da
   ese cliente es SOLO para el flujo nativo de Android (Google Sign-In SDK de
   Flutter); el backend sigue usando el mismo `GOOGLE_CLIENT_ID` (el del
   cliente Web) como `audience` al verificar, salvo que se decida agregar
   soporte multi-audience (ver documentación de `google-auth-library`,
   `verifyIdToken` acepta un array de audiences válidos).
4. Agregar el correo de cada tester como "usuario de prueba" en Público /
   Audiencia si el consent screen sigue en modo Prueba (mismo paso que ya se
   hizo para el cliente Web).

## Dónde vive cada cosa (punteros — leé antes de duplicar)

| Tema | Archivo |
|---|---|
| Contexto y convenciones generales del repo | `CLAUDE.md` (raíz) |
| Requisitos funcionales y casos de uso (versión final, incluye RF20/CU09 dulcería) | `Requisitos_Funcionales_y_Casos_de_Uso_FINAL.docx` (reemplazó a `Requisitos_Funcionales_Parcial1.docx`) |
| Modelo de datos / esquema SQL (única fuente de verdad, incluye tipos_asiento/pagos/dulcería) | `base_datos_cine_ia_completa.sql` (reemplazó a `base_datos_cine_ia.sql` y `Base_1Parcial.md`) |
| Decisiones de esquema y migraciones | `docs/db-schema-notes.md` |
| Reparto de trabajo del backend (4 semanas) | `docs/plan-backend.md` |
| Plan detallado de Luis Ángel (fases 1–5) | `docs/plan-luis-angel.md` |
| Contratos de servicios entre módulos | `docs/contratos-servicios.md` y `Backend/src/contracts/service-contracts.ts` |
| Cómo arrancar y testear el backend | `Backend/README.md` |
| Definiciones de los 6 subagentes | `.claude/agents/*.md` |
| Memoria de decisiones previas | `memory/*` |

## Reglas de arquitectura NO negociables (resumen)

Lee la sección completa en `CLAUDE.md`. Lo esencial:

1. **La IA nunca escribe directo en la base de datos.** Interpreta → propone →
   pide confirmación → el backend NestJS ejecuta y devuelve el resultado real (RF10).
2. **Toda compra/gestión pasa por confirmación explícita** antes de tocar la base
   (no-reembolso RF03, double-check RF19, confirmación de cambios RF06/RF07).
3. **El rol se resuelve antes de habilitar funciones** (RF11).
4. **STT/TTS corren localmente**, sin nube (RF13); el modelo se intercambia por nivel
   de despliegue sin cambiar el contrato (RF15).
5. **El modo sin pantalla es el piso**, no un extra (RF16).
6. **Toda mutación de gestión escribe en `log_acciones`** (RF12).
7. **La ambigüedad se resuelve preguntando, no adivinando** (RF09).

## Reglas de trabajo

- **Esquema:** cualquier cambio se hace como migración versionada, nunca editando
  `base_datos_cine_ia_completa.sql` in place. FK sin `ON DELETE` = `NO ACTION` (ninguna cascada
  ni desvincula sola); ver `docs/db-schema-notes.md`.
- **Contratos:** quien implemente un service lo declara `implements <Contract>`; si
  cambia una firma, avisa al resto **antes** (ver `docs/contratos-servicios.md`).
- **Tests:** `npm run test` (unitarios, vitest), `npm run test:e2e` (requiere Postgres),
  `npm run lint` (oxlint) — dentro de `Backend/`.
- **Commits:** **no** agregar línea `Co-Authored-By` (ver `memory/feedback_no_coauthor.md`).
- **Subagentes:** `backend-nestjs` para módulos de negocio/`ia-gateway`/auditoría;
  `ai-voice` para FastAPI; `frontend-react` para `web-admin`; `database` para esquema;
  `devops-infra` para Docker/CI; `qa-reviewer` para los 4 flujos críticos.