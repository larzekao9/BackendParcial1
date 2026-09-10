import { ConflictException, NotFoundException } from '@nestjs/common';
import { DulceriaService } from './dulceria.service.js';
import type { CategoriaDulceria } from '../../database/entities/categoria-dulceria.entity.js';
import type { ProductoDulceria } from '../../database/entities/producto-dulceria.entity.js';
import type { Repository } from 'typeorm';

describe('DulceriaService (CU09/RF20)', () => {
  function buildService(overrides?: {
    categoriasRepo?: Partial<Repository<CategoriaDulceria>>;
    productosRepo?: Partial<Repository<ProductoDulceria>>;
  }) {
    const categoriasRepo = {
      create: vi.fn((input) => input),
      save: vi.fn(async (entity) => ({ idCategoria: 1, ...entity })),
      findOne: vi.fn(),
      find: vi.fn(),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
      ...overrides?.categoriasRepo,
    } as unknown as Repository<CategoriaDulceria>;

    const productosRepo = {
      create: vi.fn((input) => input),
      save: vi.fn(async (entity) => ({ idProducto: 1, ...entity })),
      findOne: vi.fn(),
      find: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
      ...overrides?.productosRepo,
    } as unknown as Repository<ProductoDulceria>;

    const service = new DulceriaService(categoriasRepo, productosRepo);
    return { service, categoriasRepo, productosRepo };
  }

  describe('categorías', () => {
    it('crearCategoria devuelve la entidad guardada con defaults', async () => {
      const { service, categoriasRepo } = buildService();

      const resultado = await service.crearCategoria({ nombre: 'Bebidas' });

      expect(categoriasRepo.create).toHaveBeenCalledWith({
        nombre: 'Bebidas',
        ordenVisualizacion: 0,
        icono: null,
      });
      expect(resultado).toMatchObject({ nombre: 'Bebidas' });
    });

    it('actualizarCategoria aplica el patch sin perder los campos no enviados', async () => {
      const categoriaExistente: CategoriaDulceria = {
        idCategoria: 5,
        nombre: 'Popcorn',
        ordenVisualizacion: 2,
        icono: 'popcorn-icon',
      };
      const { service, categoriasRepo } = buildService({
        categoriasRepo: {
          findOne: vi.fn().mockResolvedValue(categoriaExistente),
          save: vi.fn(async (entity) => entity as CategoriaDulceria),
        },
      });

      const resultado = await service.actualizarCategoria(5, { nombre: 'Palomitas' });

      expect(resultado.nombre).toBe('Palomitas');
      expect(resultado.ordenVisualizacion).toBe(2);
      expect(resultado.icono).toBe('popcorn-icon');
      expect(categoriasRepo.save).toHaveBeenCalled();
    });

    it('eliminarCategoria sin productos asociados borra la fila', async () => {
      const categoria: CategoriaDulceria = {
        idCategoria: 6,
        nombre: 'Nachos',
        ordenVisualizacion: 0,
        icono: null,
      };
      const { service, categoriasRepo, productosRepo } = buildService({
        categoriasRepo: { findOne: vi.fn().mockResolvedValue(categoria) },
        productosRepo: { count: vi.fn().mockResolvedValue(0) },
      });

      await service.eliminarCategoria(6);

      expect(productosRepo.count).toHaveBeenCalledWith({ where: { idCategoria: 6 } });
      expect(categoriasRepo.delete).toHaveBeenCalledWith({ idCategoria: 6 });
    });

    it('eliminarCategoria con productos asociados lanza ConflictException', async () => {
      const categoria: CategoriaDulceria = {
        idCategoria: 7,
        nombre: 'Combos',
        ordenVisualizacion: 0,
        icono: null,
      };
      const { service, categoriasRepo, productosRepo } = buildService({
        categoriasRepo: { findOne: vi.fn().mockResolvedValue(categoria) },
        productosRepo: { count: vi.fn().mockResolvedValue(3) },
      });

      await expect(service.eliminarCategoria(7)).rejects.toBeInstanceOf(ConflictException);
      expect(productosRepo.count).toHaveBeenCalledWith({ where: { idCategoria: 7 } });
      expect(categoriasRepo.delete).not.toHaveBeenCalled();
    });

    it('buscarCategoriaPorId inexistente lanza NotFoundException', async () => {
      const { service } = buildService({
        categoriasRepo: { findOne: vi.fn().mockResolvedValue(null) },
      });

      await expect(service.buscarCategoriaPorId(999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('listarCategorias ordena por ordenVisualizacion y luego nombre', async () => {
      const { service, categoriasRepo } = buildService({
        categoriasRepo: { find: vi.fn().mockResolvedValue([]) },
      });

      await service.listarCategorias();

      expect(categoriasRepo.find).toHaveBeenCalledWith({
        order: { ordenVisualizacion: 'ASC', nombre: 'ASC' },
      });
    });
  });

  describe('productos', () => {
    it('crearProducto convierte precioBase a string y aplica el default de tipo', async () => {
      const { service, categoriasRepo, productosRepo } = buildService({
        categoriasRepo: {
          findOne: vi.fn().mockResolvedValue({
            idCategoria: 1,
            nombre: 'Bebidas',
            ordenVisualizacion: 0,
            icono: null,
          }),
        },
      });

      const resultado = await service.crearProducto({
        idCategoria: 1,
        nombre: 'Coca Cola Grande',
        precioBase: 15,
      });

      expect(categoriasRepo.findOne).toHaveBeenCalledWith({ where: { idCategoria: 1 } });
      expect(productosRepo.create).toHaveBeenCalledWith({
        idCategoria: 1,
        nombre: 'Coca Cola Grande',
        descripcion: null,
        precioBase: '15',
        tipo: 'individual',
        etiqueta: null,
      });
      expect(resultado).toMatchObject({ nombre: 'Coca Cola Grande', precioBase: '15' });
    });

    it('crearProducto con idCategoria inexistente lanza NotFoundException sin llegar a crear', async () => {
      const { service, productosRepo } = buildService({
        categoriasRepo: { findOne: vi.fn().mockResolvedValue(null) },
      });

      await expect(
        service.crearProducto({ idCategoria: 999, nombre: 'Nachos', precioBase: 10 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(productosRepo.create).not.toHaveBeenCalled();
    });

    it('actualizarProducto aplica el patch sin perder los campos no enviados (regresión, mismo bug que precios/promociones)', async () => {
      const productoExistente: ProductoDulceria = {
        idProducto: 8,
        idCategoria: 1,
        nombre: 'Coca Cola Grande',
        descripcion: 'Vaso grande',
        precioBase: '15.00',
        tipo: 'individual',
        etiqueta: 'Bestseller',
        disponible: true,
      };
      const { service, productosRepo } = buildService({
        productosRepo: {
          findOne: vi.fn().mockResolvedValue(productoExistente),
          save: vi.fn(async (entity) => entity as ProductoDulceria),
        },
      });

      const resultado = await service.actualizarProducto(8, { precioBase: 18 });

      expect(resultado.precioBase).toBe('18');
      expect(resultado.nombre).toBe('Coca Cola Grande');
      expect(resultado.idCategoria).toBe(1);
      expect(resultado.descripcion).toBe('Vaso grande');
      expect(resultado.tipo).toBe('individual');
      expect(resultado.etiqueta).toBe('Bestseller');
      expect(productosRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          nombre: 'Coca Cola Grande',
          idCategoria: 1,
          descripcion: 'Vaso grande',
          precioBase: '18',
          tipo: 'individual',
          etiqueta: 'Bestseller',
        }),
      );
    });

    it('actualizarProducto con idCategoria inexistente lanza NotFoundException sin guardar', async () => {
      const productoExistente: ProductoDulceria = {
        idProducto: 9,
        idCategoria: 1,
        nombre: 'Nachos',
        descripcion: null,
        precioBase: '10.00',
        tipo: 'individual',
        etiqueta: null,
        disponible: true,
      };
      const { service, categoriasRepo, productosRepo } = buildService({
        productosRepo: { findOne: vi.fn().mockResolvedValue(productoExistente) },
        categoriasRepo: { findOne: vi.fn().mockResolvedValue(null) },
      });

      await expect(
        service.actualizarProducto(9, { idCategoria: 999 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(categoriasRepo.findOne).toHaveBeenCalledWith({ where: { idCategoria: 999 } });
      expect(productosRepo.save).not.toHaveBeenCalled();
    });

    it('eliminarProducto hace soft-delete (disponible=false) y no llama a delete() físico', async () => {
      const producto: ProductoDulceria = {
        idProducto: 10,
        idCategoria: 1,
        nombre: 'Palomitas Grande',
        descripcion: null,
        precioBase: '12.00',
        tipo: 'individual',
        etiqueta: null,
        disponible: true,
      };
      const { service, productosRepo } = buildService({
        productosRepo: {
          findOne: vi.fn().mockResolvedValue(producto),
          save: vi.fn(async (entity) => entity as ProductoDulceria),
        },
      });

      await service.eliminarProducto(10);

      expect(productosRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ idProducto: 10, disponible: false }),
      );
      expect(productosRepo.delete).not.toHaveBeenCalled();
    });

    it('buscarProductoPorId inexistente lanza NotFoundException', async () => {
      const { service } = buildService({
        productosRepo: { findOne: vi.fn().mockResolvedValue(null) },
      });

      await expect(service.buscarProductoPorId(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getDisponibles', () => {
    it('sin filtro devuelve solo los productos con disponible=true', async () => {
      const { service, productosRepo } = buildService({
        productosRepo: { find: vi.fn().mockResolvedValue([]) },
      });

      await service.getDisponibles();

      expect(productosRepo.find).toHaveBeenCalledWith({
        where: { disponible: true },
        order: { idProducto: 'ASC' },
      });
    });

    it('con idCategoria también filtra por esa categoría', async () => {
      const { service, productosRepo } = buildService({
        productosRepo: { find: vi.fn().mockResolvedValue([]) },
      });

      await service.getDisponibles(3);

      expect(productosRepo.find).toHaveBeenCalledWith({
        where: { disponible: true, idCategoria: 3 },
        order: { idProducto: 'ASC' },
      });
    });
  });
});
