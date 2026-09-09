import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogAccion } from '../../database/entities/log-accion.entity.js';
import { AuditService } from './audit.service.js';
import { AuditController } from './audit.controller.js';
import { AuditInterceptor } from './audit.interceptor.js';

/**
 * RF12 — módulo de auditoría (dominio de Roly).
 *
 * El interceptor se registra como APP_INTERCEPTOR para que corra en todos los
 * requests y actúe solo cuando el handler declara `@Audit(...)` — así los
 * módulos de negocio "enchufan" la trazabilidad decorando sus endpoints de
 * escritura, sin escribir el INSERT de `log_acciones` a mano.
 *
 * Se exporta `AuditService` para que los futuros módulos transaccionales
 * (`funciones`, `ventas`) puedan loguear acciones que no pasan por un
 * controller decorado (por ej. mutaciones disparadas por `ia-gateway`).
 */
@Module({
  imports: [TypeOrmModule.forFeature([LogAccion])],
  controllers: [AuditController],
  providers: [
    AuditService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}