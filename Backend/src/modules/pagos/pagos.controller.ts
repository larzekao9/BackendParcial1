import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { Audit } from '../../shared/decorators/audit.decorator.js';
import { PagosService } from './pagos.service.js';
import { CrearPagoDto } from './dto/crear-pago.dto.js';

/** RF04 — mismo criterio de roles que `POST /ventas`: cliente paga su propia venta, administrador puede cobrar en mostrador. */
@Controller('pagos')
export class PagosController {
  constructor(private readonly pagosService: PagosService) {}

  @Roles('cliente', 'administrador')
  @Audit('crear_pago')
  @Post()
  crear(@Body() dto: CrearPagoDto) {
    return this.pagosService.crear(dto);
  }
}
