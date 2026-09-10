import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { Audit } from '../../shared/decorators/audit.decorator.js';
import { Public } from '../../shared/decorators/public.decorator.js';
import { FuncionesService } from './funciones.service.js';
import { CrearFuncionDto } from './dto/crear-funcion.dto.js';
import { ActualizarFuncionDto } from './dto/actualizar-funcion.dto.js';

/**
 * CU04 (RF07) — lectura pública (`@Public()`, RF01: se puede ver cartelera y horarios
 * sin cuenta, ver docs/db-schema-notes.md — corrección 2026-09-10, antes exigía JWT
 * hasta para listar funciones). Escritura (POST/PATCH/cancelar) solo administrador.
 *
 * No hay `DELETE`: `funciones` no admite borrado físico (ver `FuncionesService.cancelar`),
 * solo cancelación vía `PATCH :id/cancelar`.
 */
@Controller('funciones')
export class FuncionesController {
  constructor(private readonly funcionesService: FuncionesService) {}

  @Public()
  @Get()
  listar() {
    return this.funcionesService.listar();
  }

  @Public()
  @Get(':id')
  buscarPorId(@Param('id', ParseIntPipe) id: number) {
    return this.funcionesService.buscarPorId(id);
  }

  /** Disponibilidad de asientos de la función, ordenada por fila/número (RF01/RF02/CU02). */
  @Public()
  @Get(':id/disponibilidad')
  listarDisponibilidad(@Param('id', ParseIntPipe) id: number) {
    return this.funcionesService.listarDisponibilidad(id);
  }

  @Roles('administrador')
  @Audit('crear_funcion')
  @Post()
  crear(@Body() dto: CrearFuncionDto) {
    return this.funcionesService.crear(dto);
  }

  @Roles('administrador')
  @Audit('actualizar_funcion')
  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarFuncionDto) {
    return this.funcionesService.actualizar(id, dto);
  }

  @Roles('administrador')
  @Audit('cancelar_funcion')
  @Patch(':id/cancelar')
  cancelar(@Param('id', ParseIntPipe) id: number) {
    return this.funcionesService.cancelar(id);
  }
}
