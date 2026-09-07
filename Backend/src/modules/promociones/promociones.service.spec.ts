import { ConflictException, NotFoundException } from '@nestjs/common';
import { PromocionesService } from './promociones.service.js';
import { Promocion } from '../../database/entities/promocion.entity.js';
import { PromocionFuncion } from '../../database/entities/promocion-funcion.entity.js';
import type { Funcion } from '../../database/entities/funcion.entity.js';
import type { Venta } from '../../database/entities/venta.entity.js';
import type { DataSource, EntityManager, Repository } from 'typeorm';

describe('PromocionesService (CU06)', () => {
  function buildService(overrides?: {
    promocionesRepo?: Partial<Repository<Promocion>>;
    promocionFuncionRepo?: Partial<Repository<PromocionFuncion>>;
    funcionesRepo?: Partial<Repository<Funcion>>;
    ventasRepo?: Partial<Repository<Venta>>;
  }) {
    const promocionesRepo = {
      create: vi.fn((input) => input),
      save: vi.fn(async (entity) => ({ idPromocion: 1, ...entity })),
      findOne: vi.fn(),
      find: vi.fn(),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: vi.fn(),
      ...overrides?.promocionesRepo,
    } as unknown as Repository<Promocion>;

    const promocionFuncionRepo = {
      insert: vi.fn().mockResolvedValue({ identifiers: [{}] }),
      ...overrides?.promocionFuncionRepo,
    } as unknown as Repository<PromocionFuncion>;

    const funcionesRepo = {
      count: vi.fn().mockResolvedValue(1),
      ...overrides?.funcionesRepo,
    } as unknown as Repository<Funcion>;

    // Default 0: la mayoría de los tests de `eliminar` no le interesa el
    // caso de "promoción ya usada en una venta", así que por default no
    // hay ninguna venta asociada.
    const ventasRepo = {
      count: vi.fn().mockResolvedValue(0),
      ...overrides?.ventasRepo,
    } as unknown as Repository<Venta>;

    // `eliminar` corre dentro de una transacción (ver comentario de
    // PromocionesService sobre la FK real NO ACTION de
    // `promocion_funcion`). El mock de `manager.delete` registra contra
    // qué entidad se llamó para poder assertar el orden.
    const managerDelete = vi.fn().mockResolvedValue({ affected: 1 });
    const manager = { delete: managerDelete } as unknown as EntityManager;
    const dataSource = {
      transaction: vi.fn(async (cb: (manager: EntityManager) => Promise<unknown>) => cb(manager)),
    } as unknown as DataSource;

    const service = new PromocionesService(
      promocionesRepo,
      promocionFuncionRepo,
      funcionesRepo,
      ventasRepo,
      dataSource,
    );
    return {
      service,
      promocionesRepo,
      promocionFuncionRepo,
      funcionesRepo,
      ventasRepo,
      managerDelete,
    };
  }

  it('crear guarda el valor numérico del DTO convertido a string en la entidad', async () => {
    const { service, promocionesRepo } = buildService();

    const resultado = await service.crear({
      nombre: '2x1 miércoles',
      tipoDescuento: 'porcentaje',
      valor: 50,
      fechaInicio: '2026-01-01',
      fechaFin: '2026-12-31',
    });

    expect(promocionesRepo.create).toHaveBeenCalledWith({
      nombre: '2x1 miércoles',
      descripcion: null,
      tipoDescuento: 'porcentaje',
      valor: '50',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-12-31',
    });
    expect(resultado).toMatchObject({ nombre: '2x1 miércoles', valor: '50' });
  });

  it('actualizar aplica el patch sobre la promoción existente', async () => {
    const promocionExistente: Promocion = {
      idPromocion: 5,
      nombre: 'Promo original',
      descripcion: null,
      tipoDescuento: 'porcentaje',
      valor: '50.00',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-12-31',
      activa: true,
    };
    const { service, promocionesRepo } = buildService({
      promocionesRepo: {
        findOne: vi.fn().mockResolvedValue(promocionExistente),
        save: vi.fn(async (entity) => entity as Promocion),
      },
    });

    const resultado = await service.actualizar(5, { valor: 30 });

    expect(resultado.valor).toBe('30');
    expect(promocionesRepo.save).toHaveBeenCalled();
  });

  it('actualizar con un patch parcial NO borra los campos no enviados (regresión, mismo bug que salas/precios)', async () => {
    const promocionExistente: Promocion = {
      idPromocion: 6,
      nombre: 'Promo verano',
      descripcion: 'Descuento de temporada',
      tipoDescuento: 'monto_fijo',
      valor: '15.00',
      fechaInicio: '2026-02-01',
      fechaFin: '2026-03-31',
      activa: true,
    };
    const dtoConCamposDeClaseSinEnviar = new (
      await import('./dto/actualizar-promocion.dto.js')
    ).ActualizarPromocionDto();
    dtoConCamposDeClaseSinEnviar.activa = false;
    // nombre, descripcion, tipoDescuento, valor, fechaInicio, fechaFin
    // quedan como propiedad propia = undefined, igual que los deja el
    // ValidationPipe cuando no vienen en el body.

    const { service, promocionesRepo } = buildService({
      promocionesRepo: {
        findOne: vi.fn().mockResolvedValue(promocionExistente),
        save: vi.fn(async (entity) => entity as Promocion),
      },
    });

    const resultado = await service.actualizar(6, dtoConCamposDeClaseSinEnviar);

    expect(resultado.activa).toBe(false);
    expect(resultado.nombre).toBe('Promo verano');
    expect(resultado.tipoDescuento).toBe('monto_fijo');
    expect(resultado.valor).toBe('15.00');
    expect(resultado.fechaInicio).toBe('2026-02-01');
    expect(resultado.fechaFin).toBe('2026-03-31');
    expect(promocionesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Promo verano',
        tipoDescuento: 'monto_fijo',
        valor: '15.00',
        fechaInicio: '2026-02-01',
        fechaFin: '2026-03-31',
        activa: false,
      }),
    );
  });

  it('eliminar borra primero la asociación promocion_funcion y luego la promoción, en una transacción (FK real NO ACTION, no CASCADE)', async () => {
    const promocion: Promocion = {
      idPromocion: 7,
      nombre: 'Promo a borrar',
      descripcion: null,
      tipoDescuento: 'porcentaje',
      valor: '10.00',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-01-31',
      activa: true,
    };
    const { service, managerDelete } = buildService({
      promocionesRepo: { findOne: vi.fn().mockResolvedValue(promocion) },
    });

    await service.eliminar(7);

    expect(managerDelete).toHaveBeenNthCalledWith(1, PromocionFuncion, { idPromocion: 7 });
    expect(managerDelete).toHaveBeenNthCalledWith(2, Promocion, { idPromocion: 7 });
  });

  it('eliminar rechaza con ConflictException si la promoción fue usada en una venta', async () => {
    const promocion: Promocion = {
      idPromocion: 8,
      nombre: 'Promo con venta',
      descripcion: null,
      tipoDescuento: 'porcentaje',
      valor: '20.00',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-01-31',
      activa: true,
    };
    const { service, managerDelete, ventasRepo } = buildService({
      promocionesRepo: { findOne: vi.fn().mockResolvedValue(promocion) },
      ventasRepo: { count: vi.fn().mockResolvedValue(1) },
    });

    await expect(service.eliminar(8)).rejects.toBeInstanceOf(ConflictException);
    expect(ventasRepo.count).toHaveBeenCalledWith({ where: { idPromocion: 8 } });
    expect(managerDelete).not.toHaveBeenCalled();
  });

  it('buscarPorId inexistente lanza NotFoundException', async () => {
    const { service } = buildService({
      promocionesRepo: { findOne: vi.fn().mockResolvedValue(null) },
    });

    await expect(service.buscarPorId(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('eliminar de un id inexistente lanza NotFoundException sin llegar a la transacción', async () => {
    const { service, managerDelete } = buildService({
      promocionesRepo: { findOne: vi.fn().mockResolvedValue(null) },
    });

    await expect(service.eliminar(999)).rejects.toBeInstanceOf(NotFoundException);
    expect(managerDelete).not.toHaveBeenCalled();
  });

  it('listar devuelve las promociones ordenadas por id', async () => {
    const { service, promocionesRepo } = buildService({
      promocionesRepo: { find: vi.fn().mockResolvedValue([]) },
    });

    await service.listar();

    expect(promocionesRepo.find).toHaveBeenCalledWith({ order: { idPromocion: 'ASC' } });
  });

  describe('asociarAFuncion', () => {
    it('lanza NotFoundException si la promoción no existe, sin llegar a intentar el insert', async () => {
      const { service, promocionFuncionRepo, funcionesRepo } = buildService({
        promocionesRepo: { findOne: vi.fn().mockResolvedValue(null) },
      });

      await expect(service.asociarAFuncion(999, 1)).rejects.toBeInstanceOf(NotFoundException);
      expect(funcionesRepo.count).not.toHaveBeenCalled();
      expect(promocionFuncionRepo.insert).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si la función no existe, sin llegar a intentar el insert', async () => {
      const promocion: Promocion = {
        idPromocion: 1,
        nombre: 'Promo',
        descripcion: null,
        tipoDescuento: 'porcentaje',
        valor: '10.00',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-12-31',
        activa: true,
      };
      const { service, promocionFuncionRepo } = buildService({
        promocionesRepo: { findOne: vi.fn().mockResolvedValue(promocion) },
        funcionesRepo: { count: vi.fn().mockResolvedValue(0) },
      });

      await expect(service.asociarAFuncion(1, 999)).rejects.toBeInstanceOf(NotFoundException);
      expect(promocionFuncionRepo.insert).not.toHaveBeenCalled();
    });

    it('inserta la asociación con insert() (no save/create) cuando ambos existen', async () => {
      // insert() en vez de create()+save(): ver comentario en
      // PromocionesService.asociarAFuncion — con la PK compuesta ya
      // seteada, save() haría un upsert silencioso en vez de fallar con
      // 23505 ante un duplicado (se detectó en prueba manual real).
      const promocion: Promocion = {
        idPromocion: 1,
        nombre: 'Promo',
        descripcion: null,
        tipoDescuento: 'porcentaje',
        valor: '10.00',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-12-31',
        activa: true,
      };
      const { service, promocionFuncionRepo } = buildService({
        promocionesRepo: { findOne: vi.fn().mockResolvedValue(promocion) },
        funcionesRepo: { count: vi.fn().mockResolvedValue(1) },
      });

      await service.asociarAFuncion(1, 2);

      expect(promocionFuncionRepo.insert).toHaveBeenCalledWith({
        idPromocion: 1,
        idFuncion: 2,
      });
    });
  });
});
