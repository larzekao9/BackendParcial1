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
import { PromocionesService } from './promociones.service.js';
import { CrearPromocionDto } from './dto/crear-promocion.dto.js';
import { ActualizarPromocionDto } from './dto/actualizar-promocion.dto.js';

/**
 * CU06 — lectura abierta a cliente y administrador (sin `@Roles`, mismo
 * criterio que `PeliculasController`/`PreciosController`). Escritura
 * (POST/PATCH/DELETE/asociación) solo administrador.
 *
 * `getAplicable` NO tiene ruta propia en esta fase: es un método interno
 * del contrato (`PromocionesContract`) que `VentasService` importa
 * directamente.
 */
@Controller('promociones')
export class PromocionesController {
  constructor(private readonly promocionesService: PromocionesService) {}

  @Get()
  listar() {
    return this.promocionesService.listar();
  }

  @Get(':id')
  buscarPorId(@Param('id', ParseIntPipe) id: number) {
    return this.promocionesService.buscarPorId(id);
  }

  @Roles('administrador')
  @Audit('crear_promocion')
  @Post()
  crear(@Body() dto: CrearPromocionDto) {
    return this.promocionesService.crear(dto);
  }

  @Roles('administrador')
  @Audit('actualizar_promocion')
  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarPromocionDto) {
    return this.promocionesService.actualizar(id, dto);
  }

  @Roles('administrador')
  @Audit('eliminar_promocion')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.promocionesService.eliminar(id);
  }

  /**
   * Asocia una promoción existente a una función existente (fila en
   * `promocion_funcion`). Elegimos 201 en vez de 204: a diferencia de un
   * DELETE (que no devuelve nada porque el recurso deja de existir), acá
   * SÍ se crea un recurso nuevo — la fila de la relación N:M — aunque no
   * tenga una URI propia de lectura en esta fase. Devolvemos su
   * identificador compuesto en el body para que quede explícito qué se
   * creó, siguiendo la convención de 201 = "se creó un recurso" del resto
   * de los POST del módulo.
   */
  @Roles('administrador')
  @Audit('asociar_promocion_funcion')
  @Post(':id/funciones/:idFuncion')
  @HttpCode(HttpStatus.CREATED)
  async asociarAFuncion(
    @Param('id', ParseIntPipe) idPromocion: number,
    @Param('idFuncion', ParseIntPipe) idFuncion: number,
  ): Promise<{ idPromocion: number; idFuncion: number }> {
    await this.promocionesService.asociarAFuncion(idPromocion, idFuncion);
    return { idPromocion, idFuncion };
  }
}
