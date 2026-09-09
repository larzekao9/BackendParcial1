import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { AuditService, type FiltrosConsultaLog } from './audit.service.js';

/**
 * RF12 — consulta del historial de acciones de gestión. Solo administrador
 * (misma regla de rol que los reportes de CU05): es información de trazabilidad
 * del panel admin y de QA, no de clientes.
 *
 * `GET /audit/log-acciones` con filtros opcionales por query string:
 *   ?usuarioId=5&accion=crear_pelicula&desde=2026-09-01&hasta=2026-09-30&limite=100
 */
@Controller('audit')
@Roles('administrador')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('log-acciones')
  listarLogAcciones(
    @Query('usuarioId') usuarioId?: string,
    @Query('accion') accion?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('limite') limite?: string,
  ) {
    const filtros: FiltrosConsultaLog = {
      accion,
      desde,
      hasta,
      usuarioId: usuarioId !== undefined ? Number.parseInt(usuarioId, 10) : undefined,
      limite: limite !== undefined ? Number.parseInt(limite, 10) : undefined,
    };
    return this.auditService.listar(filtros);
  }
}