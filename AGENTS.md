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
| Frontend | React + Vite + Tailwind (`Parcial1_Sw2_Frontend/`, repo separado de `hebertsb`) | Mockup visual + login con Google conectado y probado end-to-end contra Supabase real, + agente de voz (`VoiceAgent.tsx`) ya conectado al servicio de IA real (`src/api/voice.api.ts`, ver abajo) |
| App móvil cliente | Flutter (`mobile-app/`) | No existe todavía |
| Servicio de IA (voz/NLU) | FastAPI, repo propio `Backend_IA/agent_cine` (a cargo de Elías + el dev del frontend) | En desarrollo — el frontend ya le habla directo (`POST /voice-chat`), fuera del NestJS. `ia-gateway` (ver abajo) ya existe del lado del backend para recibir acciones confirmadas; falta que el orquestador de `agent_cine` lo invoque (`gateway_client.py`, todavía no existe) — hasta entonces, ninguna mutación real llega a la base por esta vía. |
| Base de datos | PostgreSQL vía Supabase | Esquema en `base_datos_cine_ia_completa.sql` |

**Login con Google — YA implementado y probado, no es una discrepancia
pendiente.** `POST /auth/google` existe en `AuthController`, verificado
end-to-end (usuario real creado en Supabase con `rol='cliente'`). Ver
`docs/db-schema-notes.md`, "Login con Google". Si ves una nota vieja
diciendo lo contrario, está desactualizada — confiá en el código y en esta
tabla antes que en comentarios de commits anteriores.

## Estado actual del backend

- **Fase 0 (fundaciones)** — completa: scaffold NestJS, entidades TypeORM 1:1 con
  el esquema (17 tablas — `tipos_asiento` se agregó y se revirtió, ver
  `docs/db-schema-notes.md`, "Reversión: tipo de asiento por sala, no por butaca"),
  guards globales (`JwtAuthGuard`/`RolesGuard`), `@Public()`/`@Roles()`,
  `ValidationPipe` y `HttpExceptionFilter` globales, login simplificado + login con Google.
- **Luis Ángel** — sus 5 módulos completos: `peliculas`, `salas`+`asientos`,
  `precios`, `promociones`, `dulceria` (CU09/RF20). El CRUD de `tipos_asiento` ya NO
  aplica (la tabla se eliminó). Ver `docs/plan-luis-angel.md` y `plan-backend.md`
  (raíz del repo, no `docs/` — el puntero anterior apuntaba mal).
- **Luis Blanco** — sus módulos completos: `funciones` (CRUD + anti-solapamiento +
  `GET /funciones/:id/disponibilidad`), `ventas` (flujo transaccional RF03/RF19,
  con test de concurrencia real), `reportes` (3 endpoints), `pagos` en **alcance
  mínimo a propósito** (efectivo/tarjeta, confirmación instantánea sin pasarela
  externa — verificado end-to-end desde el frontend). **Pendiente, fuera de
  alcance por decisión del equipo** (ver "Nota de alcance" en `plan-backend.md`):
  Stripe y QR reales (`POST /pagos/webhook/stripe`, `POST /pagos/:id/confirmar-qr`
  no existen todavía; la tabla `pagos` ya tiene las columnas listas). **Ojo:** RF04
  en `CLAUDE.md` marca el pago con Stripe/QR como prioridad "Indispensable", no
  opcional — confirmar con el equipo si esto se implementa antes de la defensa o
  si el recorte se explica y se acepta tal cual en la presentación.
- **Roly** — `audit` (RF12) completo, con IP registrada: `AuditService`,
  `AuditInterceptor` global (`@Audit(...)` en el handler) y `GET /audit/log-acciones`.
  `ia-gateway` (RF10) completo: `POST /ia-gateway/acciones`, `@Public()` (sin JWT —
  ver nota abajo), revalida `evidenciaConfirmacion` (RF03/RF19) y rol (RF11)
  server-side antes de despachar a `PeliculasService`/`FuncionesService`/`VentasService`
  y auditar. Soporta `crear_pelicula`/`actualizar_pelicula`/`crear_funcion`/
  `cancelar_funcion`/`crear_venta` (ver `AccionGestion` en `service-contracts.ts`).
  Módulo `interacciones` también agregado (RF18). `usuarios` también tiene ya
  `usuarios.controller.ts` con CRUD (confirmado por archivo, no solo por el
  frontend) — con esto, **los 5 módulos de Roly en `plan-backend.md` están
  completos**. `auth` (login simplificado + Google) completo desde antes.
  **Ojo de seguridad sin resolver:** `POST /ia-gateway/acciones` es `@Public()` sin
  ningún mecanismo de autenticación de servicio a servicio — cualquiera que sepa la
  URL puede mandar `evidenciaConfirmacion: true` y disparar una venta o cancelar una
  función. Antes de la defensa, definir algo (API key compartida con `agent_cine`,
  como mínimo) — no asumir que esto ya se resolvió solo porque el endpoint existe.
  Nota para quien conecte `agent_cine` a esto: `crear_venta` pide `idFuncion`/
  `idAsientos` como IDs reales de la base — las tools de cliente de `agent_cine`
  hoy devuelven `pelicula`/`horario`/`preferencia` en texto (a propósito, ver
  `ESTADO-IMPLEMENTACION.md` de ese repo), así que falta una traducción texto→ID en
  el medio antes de poder invocar esto.

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