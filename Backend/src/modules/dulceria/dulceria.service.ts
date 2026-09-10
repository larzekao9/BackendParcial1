import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoriaDulceria } from '../../database/entities/categoria-dulceria.entity.js';
import { ProductoDulceria } from '../../database/entities/producto-dulceria.entity.js';
import type { ProductoDulceriaContract } from '../../contracts/service-contracts.js';
import type { CrearCategoriaDto } from './dto/crear-categoria.dto.js';
import type { ActualizarCategoriaDto } from './dto/actualizar-categoria.dto.js';
import type { CrearProductoDto } from './dto/crear-producto.dto.js';
import type { ActualizarProductoDto } from './dto/actualizar-producto.dto.js';

/**
 * CU09/RF20 — catálogo de dulcería (`categorias_dulceria` + `productos_dulceria`).
 * Dominio de Luis Ángel.
 *
 * Un solo service para ambos recursos: están muy acoplados (todo producto
 * pertenece a una categoría, `eliminarCategoria` necesita conocer
 * `productos_dulceria`) y el volumen de lógica de cada uno es chico — mismo
 * criterio que `SalasService` (salas + asientos en una sola clase) en vez
 * de partir en dos services separados para una carpeta que ya es un único
 * módulo.
 *
 * `getDisponibles` implementa `ProductoDulceriaContract` (ver
 * service-contracts.ts): lo va a llamar directamente `VentasService` de
 * Luis Blanco para saber qué productos puede agregar al carrito de una
 * venta. La firma no se toca sin avisar al resto del equipo.
 *
 * `eliminarCategoria`: `productos_dulceria.id_categoria` es `NOT NULL` y la
 * FK real es `NO ACTION` (ver docs/db-schema-notes.md, "Discrepancia
 * onDelete") — un DELETE físico de una categoría con productos asociados
 * chocaría contra Postgres (23503) igual, pero acá se adelanta el chequeo
 * para devolver un 409 con mensaje explícito en vez de dejar que el filtro
 * global traduzca un error de FK genérico.
 *
 * `eliminarProducto` NO es un DELETE físico — es un soft delete que pone
 * `disponible = false` (la columna existe justo para esto, mismo patrón
 * que `peliculas.estado`). Un producto puede estar referenciado por
 * `detalle_venta_dulceria` de ventas ya hechas (FK también `NO ACTION`: un
 * DELETE físico fallaría igual apenas exista una sola venta histórica que
 * lo haya incluido), y conceptualmente "eliminar un producto del menú" es
 * sacarlo de circulación, no borrar el historial de qué se vendió.
 *
 * `buscarCategoriaPorId`/`buscarProductoPorId` lanzan `NotFoundException`
 * cuando no existen, misma convención que el resto de los módulos.
 */
@Injectable()
export class DulceriaService implements ProductoDulceriaContract {
  constructor(
    @InjectRepository(CategoriaDulceria)
    private readonly categoriasRepo: Repository<CategoriaDulceria>,
    @InjectRepository(ProductoDulceria)
    private readonly productosRepo: Repository<ProductoDulceria>,
  ) {}

  // ---- Categorías ---------------------------------------------------------

  async crearCategoria(dto: CrearCategoriaDto): Promise<CategoriaDulceria> {
    const categoria = this.categoriasRepo.create({
      nombre: dto.nombre,
      ordenVisualizacion: dto.ordenVisualizacion ?? 0,
      icono: dto.icono ?? null,
    });
    return this.categoriasRepo.save(categoria);
  }

  async actualizarCategoria(
    idCategoria: number,
    dto: ActualizarCategoriaDto,
  ): Promise<CategoriaDulceria> {
    const categoria = await this.buscarCategoriaPorId(idCategoria);
    // Mismo patrón defensivo que PeliculasService/SalasService/PreciosService/
    // PromocionesService: con `target: ES2023`, un DTO parcial trae los campos
    // no enviados como propiedad propia `undefined`. Un `Object.assign` ingenuo
    // pisaría los valores existentes en el objeto devuelto al cliente, aunque
    // el UPDATE en Postgres no se vea afectado (TypeORM ya ignora columnas
    // `undefined` al armar el SQL).
    const cambios = Object.fromEntries(
      Object.entries(dto).filter(([, valor]) => valor !== undefined),
    );
    Object.assign(categoria, cambios);
    return this.categoriasRepo.save(categoria);
  }

  async eliminarCategoria(idCategoria: number): Promise<void> {
    await this.buscarCategoriaPorId(idCategoria);

    const productosAsociados = await this.productosRepo.count({ where: { idCategoria } });
    if (productosAsociados > 0) {
      throw new ConflictException(
        'No se puede eliminar la categoría: tiene productos asociados.',
      );
    }

    await this.categoriasRepo.delete({ idCategoria });
  }

  async buscarCategoriaPorId(idCategoria: number): Promise<CategoriaDulceria> {
    const categoria = await this.categoriasRepo.findOne({ where: { idCategoria } });
    if (!categoria) {
      throw new NotFoundException(`No existe una categoría de dulcería con id ${idCategoria}.`);
    }
    return categoria;
  }

  async listarCategorias(): Promise<CategoriaDulceria[]> {
    return this.categoriasRepo.find({
      order: { ordenVisualizacion: 'ASC', nombre: 'ASC' },
    });
  }

  // ---- Productos ------------------------------------------------------------

  async crearProducto(dto: CrearProductoDto): Promise<ProductoDulceria> {
    await this.buscarCategoriaPorId(dto.idCategoria);

    const producto = this.productosRepo.create({
      idCategoria: dto.idCategoria,
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? null,
      precioBase: dto.precioBase.toString(),
      tipo: dto.tipo ?? 'individual',
      etiqueta: dto.etiqueta ?? null,
    });
    return this.productosRepo.save(producto);
  }

  async actualizarProducto(
    idProducto: number,
    dto: ActualizarProductoDto,
  ): Promise<ProductoDulceria> {
    const producto = await this.buscarProductoPorId(idProducto);

    if (dto.idCategoria !== undefined) {
      await this.buscarCategoriaPorId(dto.idCategoria);
    }

    // Mismo patrón defensivo que actualizarCategoria (ver comentario ahí).
    const cambios = Object.fromEntries(
      Object.entries(dto).filter(([, valor]) => valor !== undefined),
    ) as Record<string, unknown>;
    if (typeof cambios.precioBase === 'number') {
      // dto.precioBase llega como number; la entidad lo guarda como string.
      cambios.precioBase = cambios.precioBase.toString();
    }
    Object.assign(producto, cambios);
    return this.productosRepo.save(producto);
  }

  async eliminarProducto(idProducto: number): Promise<void> {
    // Ver comentario de clase: soft delete, no DELETE físico.
    const producto = await this.buscarProductoPorId(idProducto);
    producto.disponible = false;
    await this.productosRepo.save(producto);
  }

  async buscarProductoPorId(idProducto: number): Promise<ProductoDulceria> {
    const producto = await this.productosRepo.findOne({ where: { idProducto } });
    if (!producto) {
      throw new NotFoundException(`No existe un producto de dulcería con id ${idProducto}.`);
    }
    return producto;
  }

  async listarProductos(): Promise<ProductoDulceria[]> {
    return this.productosRepo.find({ order: { idProducto: 'ASC' } });
  }

  async getDisponibles(idCategoria?: number): Promise<ProductoDulceria[]> {
    return this.productosRepo.find({
      where: {
        disponible: true,
        ...(idCategoria !== undefined ? { idCategoria } : {}),
      },
      order: { idProducto: 'ASC' },
    });
  }
}
