import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FuncionesService } from './funciones.service.js';
import { Funcion } from '../../database/entities/funcion.entity.js';
import type { DisponibilidadAsiento } from '../../database/entities/disponibilidad-asiento.entity.js';
import type { Repository } from 'typeorm';

describe('FuncionesService', () => {
  function buildQueryBuilderMock(resultado: DisponibilidadAsiento[] = []) {
    const qb = {
      innerJoinAndSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      addOrderBy: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue(resultado),
    };
    return qb;
  }

  function buildService(overrides?: {
    funcionesRepo?: Partial<Repository<Funcion>>;
    disponibilidadRepo?: Partial<Repository<DisponibilidadAsiento>>;
  }) {
    const funcionesRepo = {
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn((data) => data),
      save: vi.fn(async (entity) => ({ idFuncion: 1, estado: 'programada', ...entity })),
      ...overrides?.funcionesRepo,
    } as unknown as Repository<Funcion>;

    const qb = buildQueryBuilderMock();
    const disponibilidadRepo = {
      createQueryBuilder: vi.fn().mockReturnValue(qb),
      ...overrides?.disponibilidadRepo,
    } as unknown as Repository<DisponibilidadAsiento>;

    const service = new FuncionesService(funcionesRepo, disponibilidadRepo);
    return { service, funcionesRepo, disponibilidadRepo, qb };
  }

  const inputValido = {
    idPelicula: 1,
    idSala: 2,
    fecha: '2026-10-01',
    horaInicio: '18:00',
    horaFin: '20:00',
  };

  it('crear con horaFin <= horaInicio lanza BadRequestException y no guarda', async () => {
    const { service, funcionesRepo } = buildService();

    await expect(
      service.crear({ ...inputValido, horaInicio: '20:00', horaFin: '18:00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.crear({ ...inputValido, horaInicio: '20:00', horaFin: '20:00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(funcionesRepo.save).not.toHaveBeenCalled();
  });

  it('crear válido guarda con idPrecio/tiempoLimpiezaMin null cuando no se envían', async () => {
    const { service, funcionesRepo } = buildService();

    await service.crear(inputValido);

    expect(funcionesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        idPelicula: 1,
        idSala: 2,
        idPrecio: null,
        fecha: '2026-10-01',
        horaInicio: '18:00',
        horaFin: '20:00',
        tiempoLimpiezaMin: null,
      }),
    );
  });

  it('crear propaga el error de Postgres tal cual (23P01 lo traduce el filtro global, no el service)', async () => {
    const conflicto = Object.assign(new Error('exclusion_violation'), { code: '23P01' });
    const { service } = buildService({
      funcionesRepo: { save: vi.fn().mockRejectedValue(conflicto) },
    });

    await expect(service.crear(inputValido)).rejects.toBe(conflicto);
  });

  it('buscarPorId inexistente lanza NotFoundException', async () => {
    const { service } = buildService({ funcionesRepo: { findOne: vi.fn().mockResolvedValue(null) } });

    await expect(service.buscarPorId(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('actualizar función inexistente lanza NotFoundException', async () => {
    const { service, funcionesRepo } = buildService({
      funcionesRepo: { findOne: vi.fn().mockResolvedValue(null) },
    });

    await expect(service.actualizar(999, { fecha: '2026-11-01' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(funcionesRepo.save).not.toHaveBeenCalled();
  });

  it('actualizar con un patch parcial NO borra los campos no enviados (regresión, mismo bug que SalasService)', async () => {
    const funcion: Funcion = {
      idFuncion: 5,
      idPelicula: 1,
      idSala: 2,
      idPrecio: 3,
      fecha: '2026-10-01',
      horaInicio: '18:00',
      horaFin: '20:00',
      tiempoLimpiezaMin: 20,
      estado: 'programada',
    };
    const dtoConCamposDeClaseSinEnviar = new (
      await import('./dto/actualizar-funcion.dto.js')
    ).ActualizarFuncionDto();
    dtoConCamposDeClaseSinEnviar.fecha = '2026-11-15';
    // el resto queda como propiedad propia = undefined, igual que deja el ValidationPipe
    // cuando el campo no viene en el body.

    const { service, funcionesRepo } = buildService({
      funcionesRepo: {
        findOne: vi.fn().mockResolvedValue(funcion),
        save: vi.fn(async (entity) => entity as Funcion),
      },
    });

    const resultado = await service.actualizar(5, dtoConCamposDeClaseSinEnviar);

    expect(resultado.fecha).toBe('2026-11-15');
    expect(resultado.horaInicio).toBe('18:00');
    expect(resultado.horaFin).toBe('20:00');
    expect(resultado.idPrecio).toBe(3);
    expect(funcionesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ horaInicio: '18:00', horaFin: '20:00' }),
    );
  });

  it('actualizar rechaza si el patch deja horaFin <= horaInicio efectiva', async () => {
    const funcion: Funcion = {
      idFuncion: 6,
      idPelicula: 1,
      idSala: 2,
      idPrecio: null,
      fecha: '2026-10-01',
      horaInicio: '18:00',
      horaFin: '20:00',
      tiempoLimpiezaMin: null,
      estado: 'programada',
    };
    const { service, funcionesRepo } = buildService({
      funcionesRepo: { findOne: vi.fn().mockResolvedValue(funcion) },
    });

    // Solo cambia horaInicio a algo posterior a la horaFin YA guardada (20:00).
    await expect(service.actualizar(6, { horaInicio: '21:00' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(funcionesRepo.save).not.toHaveBeenCalled();
  });

  it('cancelar función inexistente lanza NotFoundException', async () => {
    const { service } = buildService({ funcionesRepo: { findOne: vi.fn().mockResolvedValue(null) } });

    await expect(service.cancelar(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancelar setea estado="cancelada" y guarda (el trigger de Postgres se encarga de disponibilidad_asiento)', async () => {
    const funcion: Funcion = {
      idFuncion: 7,
      idPelicula: 1,
      idSala: 2,
      idPrecio: null,
      fecha: '2026-10-01',
      horaInicio: '18:00',
      horaFin: '20:00',
      tiempoLimpiezaMin: null,
      estado: 'programada',
    };
    const { service, funcionesRepo } = buildService({
      funcionesRepo: {
        findOne: vi.fn().mockResolvedValue(funcion),
        save: vi.fn(async (entity) => entity as Funcion),
      },
    });

    const resultado = await service.cancelar(7);

    expect(resultado.estado).toBe('cancelada');
    expect(funcionesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ idFuncion: 7, estado: 'cancelada' }),
    );
  });

  it('listarDisponibilidad de una función inexistente lanza NotFoundException sin consultar disponibilidad', async () => {
    const { service, disponibilidadRepo } = buildService({
      funcionesRepo: { findOne: vi.fn().mockResolvedValue(null) },
    });

    await expect(service.listarDisponibilidad(999)).rejects.toBeInstanceOf(NotFoundException);
    expect(disponibilidadRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('listarDisponibilidad arma el join y el orden por fila/número', async () => {
    const funcion: Funcion = {
      idFuncion: 8,
      idPelicula: 1,
      idSala: 2,
      idPrecio: null,
      fecha: '2026-10-01',
      horaInicio: '18:00',
      horaFin: '20:00',
      tiempoLimpiezaMin: null,
      estado: 'programada',
    };
    const { service, qb } = buildService({
      funcionesRepo: { findOne: vi.fn().mockResolvedValue(funcion) },
    });

    await service.listarDisponibilidad(8);

    expect(qb.innerJoinAndSelect).toHaveBeenCalledWith('disponibilidad.asiento', 'asiento');
    expect(qb.where).toHaveBeenCalledWith('disponibilidad.idFuncion = :idFuncion', {
      idFuncion: 8,
    });
    expect(qb.orderBy).toHaveBeenCalledWith('asiento.fila', 'ASC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('asiento.numero', 'ASC');
  });
});
