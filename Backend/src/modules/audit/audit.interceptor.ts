import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { tap } from 'rxjs';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';
import { AUDIT_ACTION_KEY } from '../../shared/decorators/audit.decorator.js';
import { AuditService } from './audit.service.js';

/**
 * RF12 — interceptor reutilizable de auditoría (dominio de Roly).
 *
 * Se registra como APP_INTERCEPTOR en `AuditModule`, así que corre para TODOS
 * los requests, pero solo registra en `log_acciones` cuando el handler tiene el
 * decorador `@Audit('...')` (ver shared/decorators/audit.decorator.ts). La
 * etiqueta la declara el decorador; acá se le concatena `:id` cuando la ruta
 * trae un parámetro `:id` (ej. PATCH /precios/7 → `actualizar_precio:7`) para
 * que el historial diga QUÉ entidad se tocó, no solo qué tipo de mutación.
 *
 * Los guards (JwtAuthGuard + RolesGuard globales) corren ANTES que los
 * interceptors, así que para toda ruta mutante registrada acá `request.user`
 * ya está cargado — el interceptor solo falla de forma silenciosa si un
 * request sin usuario igual llegara a un handler `@Audit`. El token `accion`
 * nunca sale del request: sale del decorador.
 *
 * Política de fallo: el INSERT de `log_acciones` NUNCA rompe la respuesta de la
 * mutación ya ejecutada. Si el `log()` falla (p.ej. un usuario válido en el
 * JWT pero borrado de `usuarios` entre el login y la mutación, lo que
 * chocaría contra la FK `NO ACTION`), se loguea a consola y la mutación
 * responde normal — auditar no puede ser más importante que la operación que
 * audita. Para `id_usuario` nulo/ausente no hay trampa: JwtAuthGuard nunca
 * deja pasar sin usuario.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const accionBase = this.reflector.getAllAndOverride<string | undefined>(
      AUDIT_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!accionBase) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const usuario = request.user as JwtPayload | undefined;
    if (!usuario) {
      return next.handle();
    }

    const idParam: unknown = request.params?.id;
    const accion =
      idParam !== undefined && idParam !== null ? `${accionBase}:${idParam}` : accionBase;
    const nivelDespliegue = this.configService.get<string>('nivelDespliegue') ?? null;

    return next.handle().pipe(
      tap(() => {
        this.auditService.log(usuario.sub, accion, nivelDespliegue).catch((error: unknown) => {
          // Ver política de fallo arriba: auditar nunca rompe la mutación.
          console.error(
            '[AuditInterceptor] No se pudo registrar la acción en log_acciones',
            { accion, idUsuario: usuario.sub, error },
          );
        });
      }),
    );
  }
}