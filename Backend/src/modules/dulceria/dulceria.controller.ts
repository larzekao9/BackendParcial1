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
import { DulceriaService } from './dulceria.service.js';
import { CrearCategoriaDto } from './dto/crear-categoria.dto.js';
import { ActualizarCategoriaDto } from './dto/actualizar-categoria.dto.js';
import { CrearProductoDto } from './dto/crear-producto.dto.js';
import { ActualizarProductoDto } from './dto/actualizar-producto.dto.js';

/**
 * CU09/RF20 — lectura abierta a cliente y administrador (sin `@Roles`, el
 * RolesGuard global no restringe si el endpoint no lo declara — mismo
 * patrón que `PromocionesController`/`SalasController`). Escritura
 * (POST/PATCH/DELETE) solo administrador.
 *
 * Dos controllers en el mismo archivo (uno por sub-recurso) en vez de uno
 * solo con rutas mezcladas: `categorias` y `productos` tienen su propio
 * prefijo (`/dulceria/categorias`, `/dulceria/productos`, ver
 * plan-backend.md) y así cada uno queda con su propio `:id` sin ambigüedad
 * de rutas — comparten el mismo `DulceriaService` inyectado.
 *
 * Cada endpoint de escritura lleva `@Audit(...)` desde el arranque (RF12):
 * a diferencia de `peliculas`/`precios`/`promociones` (construidos antes de
 * que `AuditModule` existiera), `dulceria` es el primer módulo de Luis
 * Ángel que nace con el interceptor ya disponible. No hace falta importar
 * `AuditModule` ni inyectar `AuditService` acá: el interceptor está
 * registrado global (`APP_INTERCEPTOR`) y actúa solo cuando ve `@Audit(...)`.
 */
@Controller('dulceria/categorias')
export class DulceriaCategoriasController {
  constructor(private readonly dulceriaService: DulceriaService) {}

  @Get()
  listar() {
    return this.dulceriaService.listarCategorias();
  }

  @Get(':id')
  buscarPorId(@Param('id', ParseIntPipe) id: number) {
    return this.dulceriaService.buscarCategoriaPorId(id);
  }

  @Roles('administrador')
  @Audit('crear_categoria_dulceria')
  @Post()
  crear(@Body() dto: CrearCategoriaDto) {
    return this.dulceriaService.crearCategoria(dto);
  }

  @Roles('administrador')
  @Audit('actualizar_categoria_dulceria')
  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarCategoriaDto) {
    return this.dulceriaService.actualizarCategoria(id, dto);
  }

  @Roles('administrador')
  @Audit('eliminar_categoria_dulceria')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.dulceriaService.eliminarCategoria(id);
  }
}

/**
 * `DELETE /dulceria/productos/:id` responde 204 igual que un DELETE físico
 * del resto del proyecto, aunque `DulceriaService.eliminarProducto` haga
 * internamente un UPDATE (`disponible = false`, ver ese método) — el
 * nombre del endpoint y el código de respuesta quedan consistentes con
 * `peliculas` (también soft delete detrás de un DELETE HTTP), sin exponer
 * el detalle de implementación en la forma de la ruta.
 */
@Controller('dulceria/productos')
export class DulceriaProductosController {
  constructor(private readonly dulceriaService: DulceriaService) {}

  @Get()
  listar() {
    return this.dulceriaService.listarProductos();
  }

  @Get(':id')
  buscarPorId(@Param('id', ParseIntPipe) id: number) {
    return this.dulceriaService.buscarProductoPorId(id);
  }

  @Roles('administrador')
  @Audit('crear_producto_dulceria')
  @Post()
  crear(@Body() dto: CrearProductoDto) {
    return this.dulceriaService.crearProducto(dto);
  }

  @Roles('administrador')
  @Audit('actualizar_producto_dulceria')
  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarProductoDto) {
    return this.dulceriaService.actualizarProducto(id, dto);
  }

  @Roles('administrador')
  @Audit('eliminar_producto_dulceria')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.dulceriaService.eliminarProducto(id);
  }
}
