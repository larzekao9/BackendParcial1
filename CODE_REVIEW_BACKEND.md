# Code Review — Backend (NestJS)

**Fecha:** 2026-09-20  
**Revisor:** opencode  
**Rama analizada:** main (commit 9087ae8)

---

## Resumen Ejecutivo

El backend está **bien estructurado** y sigue buenas prácticas de NestJS: módulos por dominio, guards globales, contratos de servicio tipados, validación global, transacciones con `DataSource`, y auditoría desacoplada. La arquitectura soporta los requisitos funcionales (RF01–RF20) y no funcionales documentados.

**Estado general:** ✅ Listo para producción con correcciones menores de seguridad.

---

## Hallazgos por Severidad

### 🔴 CRÍTICO — Seguridad: `ia-gateway` sin autenticación servicio-a-servicio

**Ubicación:** `src/modules/ia-gateway/ia-gateway.controller.ts:18`

```typescript
@Public()
@Post('acciones')
@HttpCode(HttpStatus.OK)
ejecutarAccion(@Body() dto: EjecutarAccionIaDto) {
  return this.iaGatewayService.ejecutar(dto.accion, dto.contexto);
}
```

**Problema:** El endpoint está marcado `@Public()` y **confía ciegamente** en `contexto.idUsuario` y `contexto.rol` que envía el `ai-service` (FastAPI). Cualquier actor que conozca la URL puede:
- Falsificar `evidenciaConfirmacion: true`
- Usurpar `idUsuario` ajeno
- Cambiar `rol` a `'administrador'`
- Ejecutar `crear_venta`, `cancelar_funcion`, `crear_pelicula`, etc.

**Impacto:** Acceso no autorizado a mutaciones de negocio críticas.

**Solución recomendada (antes de defensa):**
1. Generar **API Key compartida** entre `Backend` y `agent_cine` (ej. `IA_GATEWAY_API_KEY` en `.env` de ambos).
2. Crear guard `IaGatewayAuthGuard` que valide header `X-IA-Gateway-Key`.
3. Registrar el guard **solo en este endpoint** (no global).

```typescript
// Nuevo guard
@Injectable()
export class IaGatewayAuthGuard implements CanActivate {
  constructor(private config: ConfigService) {}
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const key = req.headers['x-ia-gateway-key'];
    return key === this.config.get('IA_GATEWAY_API_KEY');
  }
}

// En controller
@UseGuards(IaGatewayAuthGuard)
@Post('acciones')
ejecutarAccion(...)
```

---

### 🟠 ALTO — Configuración: `GOOGLE_CLIENT_ID` hardcodeado en `docker-compose.yml`

**Ubicación:** `docker-compose.yml:44-46`

```yaml
environment:
  VITE_GOOGLE_CLIENT_ID: 12414827958-jim0qgmma2n35cu2jouo165k9aahfk7n.apps.googleusercontent.com
```

**Problema:** Secretos de OAuth **no deben ir en control de versiones**. El `docker-compose.yml` se commitea.

**Solución:**
- Usar `${VITE_GOOGLE_CLIENT_ID}` y definirla en `.env` del host (ya existe en `Backend/.env`).
- O usar Docker secrets / GitHub Actions secrets en CI.

```yaml
environment:
  VITE_GOOGLE_CLIENT_ID: ${VITE_GOOGLE_CLIENT_ID}
```

---

### 🟡 MEDIO — Validación: `AccionGestion` sin validación estricta de discriminated union

**Ubicación:** `src/contracts/service-contracts.ts:198-211`

```typescript
export type AccionGestion =
  | { tipo: 'crear_pelicula'; datos: CrearPeliculaInput }
  | { tipo: 'actualizar_pelicula'; idPelicula: number; datos: Partial<CrearPeliculaInput> }
  // ... más variantes
```

**Problema:** TypeScript **no valida en runtime** que `datos` coincida con `tipo`. Un payload malicioso o bug del `ai-service` podría enviar `{ tipo: 'crear_venta', datos: { foo: 'bar' } }` y pasar la validación de clase (`class-validator` no valida discriminated unions).

**Solución:**
- Usar `class-validator` con `@ValidateNested` + DTOs por acción, o
- Validar manualmente en `IaGatewayService.ejecutar()` antes del `switch`.

---

### 🟡 MEDIO — Concurrencia: `iniciarStripe` sin lock pesimista en la venta

**Ubicación:** `src/modules/pagos/pagos.service.ts:158-161`

```typescript
// OJO: acá NO se bloquea la fila de la venta (lock: pessimistic_write).
// Los pagos se escriben con pagosRepo, que usa OTRA conexión...
const resultado = await this.dataSource.transaction(async (manager): Promise<ResultadoInicio> => {
  const venta = await manager.findOne(Venta, { where: { idVenta } });
  // ...
});
```

**Comentario en código:** Reconoce el problema (`FOR KEY SHARE` choca con `FOR UPDATE`) pero **no lo resuelve**.

**Riesgo:** Race condition entre doble clic del usuario → dos PaymentIntents simultáneos → posible doble cobro.

**Solución:**
- Serializar en aplicación: flag `paymentInProgress` en memoria (Map<idVenta, Promise>) o Redis.
- O mover la escritura de `pagos` dentro del mismo `manager` (requiere refactor).

---

### 🟡 MEDIO — Auditoría: `AuditInterceptor` silencioso si falla el INSERT

**Ubicación:** `src/modules/audit/audit.interceptor.ts:70-77`

```typescript
tap(() => {
  this.auditService.log(...).catch((error) => {
    console.error('[AuditInterceptor] No se pudo registrar...', { accion, idUsuario: usuario.sub, error });
  });
}),
```

**Problema:** Si la FK `log_acciones.id_usuario` falla (usuario borrado entre login y request), **se pierde la auditoría sin alerta**. En producción esto debería ir a sistema de observabilidad (Sentry, Datadog, Loki).

**Solución:** Enviar error a logger estructurado + métrica `audit_failed_total`.

---

### 🟡 MEDIO — Tests: Cobertura insuficiente en módulos críticos

- `ia-gateway`: solo test unitario básico (`ia-gateway.service.spec.ts`), **sin test de integración** que valide flujo completo `crear_venta` → `crear_pago` → auditoría.
- `ventas`: tiene test de concurrencia (`ventas.service.sprint2.spec.ts`) pero **falta test E2E** con base real.
- `pagos`: test de Stripe mock (`pagos.stripe.spec.ts`) pero **falta test de webhook** firmado real.

---

### 🟢 BAJO — Código: Comentarios de deuda técnica en código

Varios archivos contienen `OJO`, `TODO`, `FIXME` o comentarios de "workaround" que indican deuda conocida:

| Archivo | Línea | Comentario |
|---------|-------|------------|
| `pagos.service.ts` | 158-161 | Lock pesimista omitido por conflicto FK SHARE |
| `ia-gateway.service.ts` | 174-179 | Catch silencioso de auditoría |
| `ventas.service.ts` | 68-72 | Auditoría manual por falta de `:id` en ruta POST |
| `auth.service.ts` | - | Login simplificado sin hash de contraseña (solo Google OAuth real) |

**Recomendación:** Mover a `docs/tech-debt.md` con dueño y fecha límite.

---

## Aspectos Positivos ✅

1. **Arquitectura limpia:** Separación clara por dominios (Luis Ángel / Luis Blanco / Roly), contratos tipados en `service-contracts.ts`.
2. **Guards globales:** `JwtAuthGuard` + `RolesGuard` por defecto, `@Public()` explícito — previene endpoints abiertos por accidente.
3. **Validación global:** `ValidationPipe(whitelist, forbidNonWhitelisted, transform)` en `main.ts`.
4. **Transacciones correctas:** `DataSource.transaction()` con `manager.update` condicional para asientos (evita race conditions en ventas).
5. **Auditoría desacoplada:** Interceptor global + decorador `@Audit()` — no ensucia controllers.
6. **Stripe bien implementado:** Webhook firmado, verificación server-side, idempotencia con `claveIdempotencia`, discrepancia monto/moneda detectada.
7. **Expiración de ventas:** `expirarPendientes` con barrido configurable y comparación con reloj de BD (`NOW()`).
8. **Entidades TypeORM 1:1 con esquema SQL:** Sin `synchronize: true`, migraciones versionadas.
9. **Contratos como interfaces:** `implements PeliculasContract` etc. — rompe build si firma cambia sin aviso.

---

## Acciones Requeridas Antes de Defensa

| Prioridad | Acción | Responsable | Estimación | Estado |
|-----------|--------|-------------|------------|--------|
| 🔴 Crítica | Agregar `IaGatewayAuthGuard` con API Key compartida | Roly | 30 min | ⏳ Pendiente |
| 🟠 Alta | Quitar `VITE_GOOGLE_CLIENT_ID` hardcodeado de `docker-compose.yml` | DevOps | 10 min | ⏳ Pendiente |
| 🟡 Media | Validar discriminated union `AccionGestion` en runtime | Roly | 45 min | ⏳ Pendiente |
| 🟡 Media | Serializar `iniciarStripe` para evitar doble PaymentIntent | Luis Blanco | 30 min | ⏳ Pendiente |
| 🟢 Baja | Documentar deuda técnica en `docs/tech-debt.md` | Todos | 20 min | ⏳ Pendiente |

---

## Tareas Completadas (Reportes - RF08/CU05)

| Tarea | Prioridad | Capa | Estado |
|-------|-----------|------|--------|
| Filtrar `venta.estado = 'pagada'` en endpoints existentes (+ tests) | P0 | Backend | ✅ Completado |
| `GET /reportes/por-producto` (dulcería) + tests | P1 | Backend | ✅ Completado |
| `GET /reportes/dashboard` (comparación vs. periodo anterior) + tests | P1 | Backend | ✅ Completado |
| Frontend: tabla de producto + tarjetas KPI con variación % | P1 | Frontend | ✅ Completado |

---

## Comandos de Verificación

```bash
# Tests unitarios
cd Backend && npm run test

# Tests E2E (requiere Postgres)
cd Backend && npm run test:e2e

# Lint
cd Backend && npm run lint

# TypeCheck
cd Backend && npx tsc --noEmit
```

---

## Conclusión

El backend es **sólido, mantenible y cumple los requisitos**. El único bloqueador para producción/defensa es la **autenticación del `ia-gateway`** (🔴). El resto son mejoras de robustez y observabilidad.