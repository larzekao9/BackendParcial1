import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from '../../shared/decorators/public.decorator.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { InteraccionesService, type FiltrosConsultaInteraccion } from './interacciones.service.js';
import { CrearInteraccionDto } from './dto/crear-interaccion.dto.js';

/**
 * RF18 / CU08 — Controller de interacciones de IA y UI generativa.
 */
@Controller('interacciones')
export class InteraccionesController {
  constructor(private readonly interaccionesService: InteraccionesService) {}

  /**
   * Endpoint de registro de interacciones procesadas por `ai-service`.
   * Marcado como `@Public()` para permitir su invocación transparente desde el agente de IA.
   */
  @Public()
  @Post()
  registrar(@Body() dto: CrearInteraccionDto) {
    return this.interaccionesService.registrar(dto);
  }

  /**
   * Consulta del historial de interacciones. Restringido a administradores.
   */
  @Roles('administrador')
  @Get()
  listar(
    @Query('idUsuario') idUsuario?: string,
    @Query('limite') limite?: string,
  ) {
    const filtros: FiltrosConsultaInteraccion = {
      idUsuario: idUsuario !== undefined ? Number.parseInt(idUsuario, 10) : undefined,
      limite: limite !== undefined ? Number.parseInt(limite, 10) : undefined,
    };
    return this.interaccionesService.listar(filtros);
  }
}
