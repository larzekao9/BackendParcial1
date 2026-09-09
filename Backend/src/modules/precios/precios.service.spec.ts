import { ConflictException, NotFoundException } from '@nestjs/common';
import { PreciosService } from './precios.service.js';
import type { Precio } from '../../database/entities/precio.entity.js';
import type { Funcion } from '../../database/entities/funcion.entity.js';
import type { Repository } from 'typeorm';

describe('PreciosService (CU07)', () => {
  function buildService(overrides?: {
    preciosRepo?: Partial<Repository<Precio>>;
    funcionesRepo?: Partial<Repository<Funcion>>;
  }) {
    const preciosRepo = {
      create: vi.fn((input) => input),
      save: vi.fn(async (entity) => ({ idPrecio: 1, ...entity })),
      findOne: vi.fn(),
      find: vi.fn(),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
      ...overrides?.preciosRepo,
    } as unknown as Repository<Precio>;

    // Default 0: la mayoría de los tests de `eliminar` no le interesa el
    // caso de "precio referenciado por una función".
    const funcionesRepo = {
      count: vi.fn().mockResolvedValue(0),
      ...overrides?.funcionesRepo,
    } as unknown as Repository<Funcion>;

    const service = new PreciosService(preciosRepo, funcionesRepo);
    return { service, preciosRepo, funcionesRepo };
  }

  it('crear guarda el valor numérico del DTO convertido a string en la entidad', async () => {
    const { service, preciosRepo } = buildService();

    const resultado = await service.crear({
      idTipoAsiento: 1,
      valor: 25.5,
      vigenteDesde: '2026-01-01',
    });

    expect(preciosRepo.create).toHaveBeenCalledWith({
      idTipoAsiento: 1,
      valor: '25.5',
      vigenteDesde: '2026-01-01',
      vigenteHasta: null,
    });
    expect(resultado).toMatchObject({ idTipoAsiento: 1, valor: '25.5' });
  });

  it('actualizar aplica el patch sobre el precio existente', async () => {
    const precioExistente: Precio = {
      idPrecio: 5,
      idTipoAsiento: 1,
      valor: '25.50',
      vigenteDesde: '2026-01-01',
      vigenteHasta: null,
    };
    const { service, preciosRepo } = buildService({
      preciosRepo: {
        findOne: vi.fn().mockResolvedValue(precioExistente),
        save: vi.fn(async (entity) => entity as Precio),
      },
    });

    const resultado = await service.actualizar(5, { valor: 30 });

    expect(resultado.valor).toBe('30');
    expect(preciosRepo.save).toHaveBeenCalled();
  });

  it('actualizar con un patch parcial NO borra los campos no enviados (regresión)', async () => {
    // Mismo bug de la Fase 2 (ver SalasService.actualizar): un DTO parcial
    // pasado por el ValidationPipe trae los campos no enviados como
    // propiedad propia `undefined` (class fields ES2023). Un
    // `Object.assign` ingenuo pisaría `idTipoAsiento`/`vigenteDesde` en el
    // objeto devuelto.
    const precioExistente: Precio = {
      idPrecio: 6,
      idTipoAsiento: 2,
      valor: '18.00',
      vigenteDesde: '2026-02-01',
      vigenteHasta: '2026-12-31',
    };
    const dtoConCamposDeClaseSinEnviar = new (
      await import('./dto/actualizar-precio.dto.js')
    ).ActualizarPrecioDto();
    dtoConCamposDeClaseSinEnviar.valor = 22;
    // idTipoAsiento, vigenteDesde, vigenteHasta quedan como propiedad
    // propia = undefined, igual que los deja el ValidationPipe cuando no
    // vienen en el body.

    const { service, preciosRepo } = buildService({
      preciosRepo: {
        findOne: vi.fn().mockResolvedValue(precioExistente),
        save: vi.fn(async (entity) => entity as Precio),
      },
    });

    const resultado = await service.actualizar(6, dtoConCamposDeClaseSinEnviar);

    expect(resultado.valor).toBe('22');
    expect(resultado.idTipoAsiento).toBe(2);
    expect(resultado.vigenteDesde).toBe('2026-02-01');
    expect(resultado.vigenteHasta).toBe('2026-12-31');
    expect(preciosRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        idTipoAsiento: 2,
        vigenteDesde: '2026-02-01',
        vigenteHasta: '2026-12-31',
      }),
    );
  });

  it('eliminar borra el precio cuando ninguna función lo referencia', async () => {
    const precio: Precio = {
      idPrecio: 7,
      idTipoAsiento: 3,
      valor: '40.00',
      vigenteDesde: '2026-01-01',
      vigenteHasta: null,
    };
    const { service, preciosRepo, funcionesRepo } = buildService({
      preciosRepo: { findOne: vi.fn().mockResolvedValue(precio) },
    });

    await service.eliminar(7);

    expect(funcionesRepo.count).toHaveBeenCalledWith({ where: { idPrecio: 7 } });
    expect(preciosRepo.delete).toHaveBeenCalledWith({ idPrecio: 7 });
  });

  it('eliminar rechaza con ConflictException si una función referencia el precio (FK real es NO ACTION, no SET NULL)', async () => {
    const precio: Precio = {
      idPrecio: 8,
      idTipoAsiento: 1,
      valor: '20.00',
      vigenteDesde: '2026-01-01',
      vigenteHasta: null,
    };
    const { service, preciosRepo } = buildService({
      preciosRepo: { findOne: vi.fn().mockResolvedValue(precio) },
      funcionesRepo: { count: vi.fn().mockResolvedValue(1) },
    });

    await expect(service.eliminar(8)).rejects.toBeInstanceOf(ConflictException);
    expect(preciosRepo.delete).not.toHaveBeenCalled();
  });

  it('buscarPorId inexistente lanza NotFoundException', async () => {
    const { service } = buildService({
      preciosRepo: { findOne: vi.fn().mockResolvedValue(null) },
    });

    await expect(service.buscarPorId(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('eliminar de un id inexistente lanza NotFoundException sin llamar a delete', async () => {
    const { service, preciosRepo } = buildService({
      preciosRepo: { findOne: vi.fn().mockResolvedValue(null) },
    });

    await expect(service.eliminar(999)).rejects.toBeInstanceOf(NotFoundException);
    expect(preciosRepo.delete).not.toHaveBeenCalled();
  });

  it('listar devuelve los precios ordenados por id', async () => {
    const { service, preciosRepo } = buildService({
      preciosRepo: { find: vi.fn().mockResolvedValue([]) },
    });

    await service.listar();

    expect(preciosRepo.find).toHaveBeenCalledWith({ order: { idPrecio: 'ASC' } });
  });
});
