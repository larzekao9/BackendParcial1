import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../../shared/decorators/public.decorator.js';
import { IaGatewayService } from './ia-gateway.service.js';
import { EjecutarAccionIaDto } from './dto/ejecutar-accion-ia.dto.js';

/**
 * RF10 — Pasarela unificada para mutaciones solicitadas por el servicio de IA.
 *
 * `POST /ia-gateway/acciones`:
 * Recibe la acción a ejecutar y el contexto verificado por el agente de voz/texto.
 * Marcado como `@Public()` para permitir la invocación desde `ai-service` (FastAPI),
 * delegando toda la re-validación de seguridad y roles a `IaGatewayService` (RF10/RF11).
 */
@Controller('ia-gateway')
export class IaGatewayController {
  constructor(private readonly iaGatewayService: IaGatewayService) {}

  @Public()
  @Post('acciones')
  @HttpCode(HttpStatus.OK)
  ejecutarAccion(@Body() dto: EjecutarAccionIaDto) {
    return this.iaGatewayService.ejecutar(dto.accion, dto.contexto);
  }
}
