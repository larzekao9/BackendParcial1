import { NotFoundException } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { LogAccion } from '../../database/entities/log-accion.entity.js';
import type { Repository, SelectQueryBuilder } from 'typeorm';

function buildQueryBuilderMock() {
  const qb = {
    orderBy: vi.fn(() => qb),
    addOrderBy: vi.fn(() => qb),
    andWhere: vi.fn(() => qb),
    take: vi.fn(() => qb),
    getMany: vi.fn().mockResolvedValue([]),
  } as unknown as SelectQueryBuilder<LogAccion>;
  return qb;
}

describe('AuditService (RF12)', () => {
  function buildService(overrides?: {
    repo?: Partial<Repository<LogAccion>>;
    queryBuilder?: ReturnType<typeof buildQueryBuilderMock>;
  }) {
    const repo = {
      create: vi.fn((input) => input),
      save: vi.fn(async (entity) => ({ idLog: 1, ...entity })),
      findOne: vi.fn(),
      createQueryBuilder: vi.fn(() => overrides?.queryBuilder ?? buildQueryBuilderMock()),
      ...overrides?.repo,
    } as unknown as Repository<LogAccion>;

    const service = new AuditService(repo);
    return { service, repo };
  }

  describe('log', () => {
    it('inserta un registro con idUsuario, accion y nivelDespliegue', async () => {
      const { service, repo } = buildService();

      const resultado = await service.log(5, 'crear_pelicula', 'servidor_local');

      expect(repo.create).toHaveBeenCalledWith({
        idUsuario: 5,
        accion: 'crear_pelicula',
        nivelDespliegue: 'servidor_local',
        ipOrigen: null,
        userAgent: null,
      });
      expect(repo.save).toHaveBeenCalled();
      expect(resultado).toMatchObject({ idLog: 1, idUsuario: 5, accion: 'crear_pelicula' });
    });

    it('normaliza nivelDespliegue vacío/undefined a null (la columna es nullable)', async () => {
      const { service, repo } = buildService();

      await service.log(5, 'crear_precio');
      await service.log(5, 'crear_sala', undefined);

      expect(repo.create).toHaveBeenNthCalledWith(1, {
        idUsuario: 5,
        accion: 'crear_precio',
        nivelDespliegue: null,
        ipOrigen: null,
        userAgent: null,
      });
      expect(repo.create).toHaveBeenNthCalledWith(2, {
        idUsuario: 5,
        accion: 'crear_sala',
        nivelDespliegue: null,
        ipOrigen: null,
        userAgent: null,
      });
    });

  });

  describe('listar', () => {
    it('ordena por fechaHora DESC y id DESC sin filtros, con tope de 200 por default', async () => {
      const qb = buildQueryBuilderMock();
      const { service, repo } = buildService({ queryBuilder: qb });

      await service.listar();

      expect(repo.createQueryBuilder).toHaveBeenCalledWith('logAccion');
      expect(qb.orderBy).toHaveBeenCalledWith('logAccion.fechaHora', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('logAccion.idLog', 'DESC');
      expect(qb.take).toHaveBeenCalledWith(200);
      expect(qb.getMany).toHaveBeenCalled();
    });

    it('aplica filtros opcionales de usuario, acción y rango de fechas', async () => {
      const qb = buildQueryBuilderMock();
      const { service } = buildService({ queryBuilder: qb });

      await service.listar({
        usuarioId: 3,
        accion: 'eliminar_precio',
        desde: '2026-09-01',
        hasta: '2026-09-30',
      });

      expect(qb.andWhere).toHaveBeenCalledWith('logAccion.idUsuario = :usuarioId', {
        usuarioId: 3,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('logAccion.accion = :accion', {
        accion: 'eliminar_precio',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('logAccion.fechaHora >= :desde', {
        desde: '2026-09-01',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('logAccion.fechaHora <= :hasta', {
        hasta: '2026-09-30',
      });
    });

    it('respeta un limite explícito', async () => {
      const qb = buildQueryBuilderMock();
      const { service } = buildService({ queryBuilder: qb });

      await service.listar({ limite: 50 });

      expect(qb.take).toHaveBeenCalledWith(50);
    });
  });

  describe('buscarPorId', () => {
    it('devuelve el registro cuando existe', async () => {
      const registro: LogAccion = {
        idLog: 9,
        idUsuario: 2,
        accion: 'crear_promocion',
        fechaHora: new Date(),
        nivelDespliegue: null,
      };
      const { service } = buildService({ repo: { findOne: vi.fn().mockResolvedValue(registro) } });

      const resultado = await service.buscarPorId(9);

      expect(resultado).toEqual(registro);
    });

    it('lanza NotFoundException cuando no existe', async () => {
      const { service } = buildService({ repo: { findOne: vi.fn().mockResolvedValue(null) } });

      await expect(service.buscarPorId(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});