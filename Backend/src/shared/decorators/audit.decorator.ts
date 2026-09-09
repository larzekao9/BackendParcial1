import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'audit_accion';

/**
 * `@Audit('crear_pelicula')` sobre un endpoint de ESCRITURA de gestión.
 *
 * Marca el handler para que `AuditInterceptor` (registrado como APP_INTERCEPTOR
 * en `AuditModule`) registre la acción en `log_acciones` una vez que el handler
 * termina OK (RF12). Es la forma de "enchufar" la auditoría sin escribir el
 * INSERT de `log_acciones` a mano en cada servicio: el interceptor saca
 * `id_usuario` del JWT (`request.user.sub`), la etiqueta de acá y
 * `nivel_despliegue` de la config (RF15).
 *
 * La etiqueta usa snake_case y describe la MUTACIÓN (verbo + entidad), misma
 * convención que el union `AccionGestion` de `service-contracts.ts`. No es un
 * texto libre para el usuario final: es un valor estable que QA y el panel
 * admin usan para filtrar el historial.
 */
export const Audit = (accion: string) => SetMetadata(AUDIT_ACTION_KEY, accion);