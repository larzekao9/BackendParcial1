import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { Audit } from '../../shared/decorators/audit.decorator.js';
import { PreciosService } from './precios.service.js';
import { CrearPrecioDto } from './dto/crear-precio.dto.js';
import { ActualizarPrecioDto } from './dto/actualizar-precio.dto.js';

/**
 * CU07 — lectura abierta a cliente y administrador (sin `@Roles`, mismo
 * criterio que `PeliculasController`). Escritura (POST/PATCH/DELETE) solo
 * administrador.
 *
 * `getVigente` NO tiene ruta propia en esta fase: es un método interno del
 * contrato (`PreciosContract`) que `VentasService` importa directamente.
 * Si más adelante hace falta exponerlo para depurar desde el panel admin,
 * se agrega `GET /precios/vigente?tipo=&fecha=` sin romper el contrato.
 */
@Controller('precios')
export class PreciosController {
  constructor(private readonly preciosService: PreciosService) {}

  @Get()
  listar() {
    return this.preciosService.listar();
  }

  @Get(':id')
  buscarPorId(@Param('id', ParseIntPipe) id: number) {
    return this.preciosService.buscarPorId(id);
  }

  @Roles('administrador')
  @Audit('crear_precio')
  @Post()
  crear(@Body() dto: CrearPrecioDto) {
    return this.preciosService.crear(dto);
  }

  @Roles('administrador')
  @Audit('actualizar_precio')
  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarPrecioDto) {
    return this.preciosService.actualizar(id, dto);
  }

  @Roles('administrador')
  @Audit('eliminar_precio')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.preciosService.eliminar(id);
  }
}
