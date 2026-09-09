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
import { PeliculasService } from './peliculas.service.js';
import { CrearPeliculaDto } from './dto/crear-pelicula.dto.js';
import { ActualizarPeliculaDto } from './dto/actualizar-pelicula.dto.js';

/**
 * CU03 — lectura abierta a cliente y administrador (RF11: sin `@Roles`, el
 * RolesGuard global no restringe si el endpoint no lo declara). Escritura
 * (POST/PATCH/DELETE) solo administrador.
 */
@Controller('peliculas')
export class PeliculasController {
  constructor(private readonly peliculasService: PeliculasService) {}

  @Get()
  listar() {
    return this.peliculasService.listar();
  }

  @Get(':id')
  buscarPorId(@Param('id', ParseIntPipe) id: number) {
    return this.peliculasService.buscarPorId(id);
  }

  @Roles('administrador')
  @Audit('crear_pelicula')
  @Post()
  crear(@Body() dto: CrearPeliculaDto) {
    return this.peliculasService.crear(dto);
  }

  @Roles('administrador')
  @Audit('actualizar_pelicula')
  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarPeliculaDto) {
    return this.peliculasService.actualizar(id, dto);
  }

  @Roles('administrador')
  @Audit('eliminar_pelicula')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.peliculasService.eliminar(id);
  }
}
