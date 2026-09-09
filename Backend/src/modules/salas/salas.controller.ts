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
import { SalasService } from './salas.service.js';
import { CrearSalaDto } from './dto/crear-sala.dto.js';
import { ActualizarSalaDto } from './dto/actualizar-sala.dto.js';

/**
 * Fase 2 — lectura abierta a cliente y administrador (sin `@Roles`, el
 * RolesGuard global no restringe si el endpoint no lo declara). Escritura
 * (POST/PATCH/DELETE) solo administrador, mismo patrón que `peliculas`.
 */
@Controller('salas')
export class SalasController {
  constructor(private readonly salasService: SalasService) {}

  @Get()
  listar() {
    return this.salasService.listar();
  }

  @Get(':id')
  buscarPorId(@Param('id', ParseIntPipe) id: number) {
    return this.salasService.buscarPorId(id);
  }

  @Get(':id/asientos')
  listarAsientos(@Param('id', ParseIntPipe) id: number) {
    return this.salasService.listarAsientos(id);
  }

  @Roles('administrador')
  @Audit('crear_sala')
  @Post()
  crear(@Body() dto: CrearSalaDto) {
    return this.salasService.crear(dto);
  }

  @Roles('administrador')
  @Audit('actualizar_sala')
  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarSalaDto) {
    return this.salasService.actualizar(id, dto);
  }

  @Roles('administrador')
  @Audit('eliminar_sala')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.salasService.eliminar(id);
  }
}
