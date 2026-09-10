import { ConflictException, NotFoundException } from '@nestjs/common';
import { SalasService } from './salas.service.js';
import { Sala } from '../../database/entities/sala.entity.js';
import { Asiento } from '../../database/entities/asiento.entity.js';
import type { Funcion } from '../../database/entities/funcion.entity.js';
import type { DataSource, Repository } from 'typeorm';

describe('SalasService (Fase 2)', () => {
  function buildService(overrides?: {
    salasRepo?: Partial<Repository<Sala>>;
    asientosRepo?: Partial<Repository<Asiento>>;
    funcionesRepo?: Partial<Repository<Funcion>>;
    manager?: Partial<Record<string, unknown>>;
  }) {
    const salasRepo = {
      findOne: vi.fn(),
      find: vi.fn(),
      save: vi.fn(async (entity) => ({ idSala: 1, ...entity })),
      ...overrides?.salasRepo,
    } as unknown as Repository<Sala>;

    const asientosRepo = {
      find: vi.fn(),
      ...overrides?.asientosRepo,
    } as unknown as Repository<Asiento>;

    const funcionesRepo = {
      count: vi.fn().mockResolvedValue(0),
      ...overrides?.funcionesRepo,
    } as unknown as Repository<Funcion>;

    const manager = {
      create: vi.fn((_entity: unknown, data: unknown) => data),
      save: vi.fn(async (entity: unknown, data: unknown) => {
        if (entity === Sala) {
          return { idSala: 1, ...(data as Record<string, unknown>) };
        }
        return data;
      }),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
      ...overrides?.manager,
    };

    const dataSource = {
      transaction: vi.fn(async (cb: (manager: unknown) => unknown) => cb(manager)),
    } as unknown as DataSource;

    const service = new SalasService(salasRepo, asientosRepo, funcionesRepo, dataSource);
    return { service, salasRepo, asientosRepo, funcionesRepo, manager, dataSource };
  }

  function asientosGuardadosEn(manager: { save: ReturnType<typeof vi.fn> }): Array<{
    fila: string;
    numero: number;
  }> {
    const llamada = manager.save.mock.calls.find(([entity]: [unknown]) => entity === Asiento);
    return llamada?.[1] ?? [];
  }

  it('crear con capacidad=25 y asientosPorFila=10 genera 3 filas (A:10, B:10, C:5)', async () => {
    const { service, manager } = buildService();

    await service.crear({ nombre: 'Sala 1', capacidad: 25, asientosPorFila: 10 });

    const asientos = asientosGuardadosEn(manager);
    expect(asientos).toHaveLength(25);

    const filaA = asientos.filter((a) => a.fila === 'A');
    const filaB = asientos.filter((a) => a.fila === 'B');
    const filaC = asientos.filter((a) => a.fila === 'C');

    expect(filaA).toHaveLength(10);
    expect(filaB).toHaveLength(10);
    expect(filaC).toHaveLength(5);
    expect(filaA.map((a) => a.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(filaC.map((a) => a.numero)).toEqual([1, 2, 3, 4, 5]);
  });

  it('crear con capacidad=10 y asientosPorFila por default (10) genera exactamente 1 fila de 10', async () => {
    const { service, manager } = buildService();

    await service.crear({ nombre: 'Sala 2', capacidad: 10 });

    const asientos = asientosGuardadosEn(manager);
    expect(asientos).toHaveLength(10);
    expect(asientos.every((a) => a.fila === 'A')).toBe(true);
    expect(asientos.map((a) => a.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('eliminar con una función asociada (cualquier estado/fecha) lanza ConflictException', async () => {
    const sala: Sala = { idSala: 3, nombre: 'Sala 3', capacidad: 10, tipo: null, tiempoLimpiezaMin: 20 };
    const { service, funcionesRepo, dataSource } = buildService({
      salasRepo: { findOne: vi.fn().mockResolvedValue(sala) },
      funcionesRepo: { count: vi.fn().mockResolvedValue(1) },
    });

    await expect(service.eliminar(3)).rejects.toBeInstanceOf(ConflictException);
    expect(funcionesRepo.count).toHaveBeenCalledWith({ where: { idSala: 3 } });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('eliminar sin funciones asociadas borra los asientos antes que la sala, dentro de una transacción', async () => {
    const sala: Sala = { idSala: 4, nombre: 'Sala 4', capacidad: 10, tipo: null, tiempoLimpiezaMin: 20 };
    const { service, manager, dataSource } = buildService({
      salasRepo: { findOne: vi.fn().mockResolvedValue(sala) },
      funcionesRepo: { count: vi.fn().mockResolvedValue(0) },
    });

    await service.eliminar(4);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.delete).toHaveBeenNthCalledWith(1, Asiento, { idSala: 4 });
    expect(manager.delete).toHaveBeenNthCalledWith(2, Sala, { idSala: 4 });
  });

  it('listarAsientos de una sala inexistente lanza NotFoundException', async () => {
    const { service, asientosRepo } = buildService({
      salasRepo: { findOne: vi.fn().mockResolvedValue(null) },
    });

    await expect(service.listarAsientos(999)).rejects.toBeInstanceOf(NotFoundException);
    expect(asientosRepo.find).not.toHaveBeenCalled();
  });

  it('buscarPorId inexistente lanza NotFoundException', async () => {
    const { service } = buildService({
      salasRepo: { findOne: vi.fn().mockResolvedValue(null) },
    });

    await expect(service.buscarPorId(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('actualizar con un patch parcial NO borra los campos no enviados (regresión)', async () => {
    // Reproduce el bug encontrado en la prueba manual: un DTO real pasado
    // por el ValidationPipe (transform: true) trae `tipo` y
    // `tiempoLimpiezaMin` como propiedades propias con valor `undefined`
    // (class fields de ES2023) aun cuando no vinieron en el body. Un
    // `Object.assign` ingenuo pisaría los valores existentes de la sala.
    const sala: Sala = {
      idSala: 5,
      nombre: 'Sala 5',
      capacidad: 25,
      tipo: '2D',
      tiempoLimpiezaMin: 20,
    };
    const dtoConCamposDeClaseSinEnviar = new (
      await import('./dto/actualizar-sala.dto.js')
    ).ActualizarSalaDto();
    dtoConCamposDeClaseSinEnviar.nombre = 'Sala 5 Renovada';
    // tipo y tiempoLimpiezaMin quedan como propiedad propia = undefined,
    // igual que los deja el ValidationPipe cuando no vienen en el body.

    const { service, salasRepo } = buildService({
      salasRepo: {
        findOne: vi.fn().mockResolvedValue(sala),
        save: vi.fn(async (entity) => entity as Sala),
      },
    });

    const resultado = await service.actualizar(5, dtoConCamposDeClaseSinEnviar);

    expect(resultado.nombre).toBe('Sala 5 Renovada');
    expect(resultado.tipo).toBe('2D');
    expect(resultado.tiempoLimpiezaMin).toBe(20);
    expect(salasRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: '2D', tiempoLimpiezaMin: 20 }),
    );
  });
});

describe('ActualizarSalaDto (Fase 2) — no permite cambiar capacidad', () => {
  it('rechaza `capacidad` con el ValidationPipe global (whitelist + forbidNonWhitelisted)', async () => {
    const { ValidationPipe, BadRequestException } = await import('@nestjs/common');
    const { ActualizarSalaDto } = await import('./dto/actualizar-sala.dto.js');

    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        { nombre: 'Sala Renovada', capacidad: 50 },
        { type: 'body', metatype: ActualizarSalaDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('acepta nombre/tipo/tiempoLimpiezaMin sin capacidad ni asientosPorFila', async () => {
    const { ValidationPipe } = await import('@nestjs/common');
    const { ActualizarSalaDto } = await import('./dto/actualizar-sala.dto.js');

    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    const resultado = await pipe.transform(
      { nombre: 'Sala Renovada', tipo: 'VIP', tiempoLimpiezaMin: 30 },
      { type: 'body', metatype: ActualizarSalaDto },
    );

    expect(resultado).toMatchObject({ nombre: 'Sala Renovada', tipo: 'VIP', tiempoLimpiezaMin: 30 });
    expect((resultado as Record<string, unknown>).capacidad).toBeUndefined();
    expect((resultado as Record<string, unknown>).asientosPorFila).toBeUndefined();
  });
});
