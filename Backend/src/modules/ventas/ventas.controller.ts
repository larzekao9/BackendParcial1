import { Body, Controller, ForbiddenException, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';
import { VentasService } from './ventas.service.js';
import { CrearVentaDto } from './dto/crear-venta.dto.js';

/**
 * CU02 — todos los endpoints requieren JWT (guard global); no hay ruta abierta a
 * anónimos porque comprar y consultar ventas siempre son acciones de un rol conocido
 * (RF11). `idUsuarioCliente` nunca sale del body: para un `cliente` es su propio
 * `sub` del JWT; para un `administrador` (venta manual/mostrador) se deja `null`
 * (venta anónima, ver comentario en venta.entity.ts) — nunca se confía en que el
 * cliente pueda comprar "a nombre de" otro usuario.
 */
@Controller('ventas')
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Roles('cliente', 'administrador')
  @Post()
  crear(@Body() dto: CrearVentaDto, @CurrentUser() usuario: JwtPayload) {
    const idUsuarioCliente = usuario.rol === 'cliente' ? usuario.sub : null;
    return this.ventasService.crear({ ...dto, idUsuarioCliente }, usuario.sub);
  }

  /** Un `cliente` solo ve sus propias ventas; un `administrador` las ve todas (RF11). */
  @Roles('cliente', 'administrador')
  @Get()
  listar(@CurrentUser() usuario: JwtPayload) {
    const idUsuarioCliente = usuario.rol === 'cliente' ? usuario.sub : undefined;
    return this.ventasService.listar(idUsuarioCliente);
  }

  @Roles('cliente', 'administrador')
  @Get(':id')
  async buscarPorId(@Param('id', ParseIntPipe) id: number, @CurrentUser() usuario: JwtPayload) {
    const venta = await this.ventasService.buscarPorId(id);
    if (usuario.rol === 'cliente' && venta.idUsuarioCliente !== usuario.sub) {
      throw new ForbiddenException('No podés consultar una venta que no es tuya.');
    }
    return venta;
  }
}
