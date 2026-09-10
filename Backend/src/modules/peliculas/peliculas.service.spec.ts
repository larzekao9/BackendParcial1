import { ConflictException, NotFoundException } from '@nestjs/common';
import { PeliculasService } from './peliculas.service.js';
import type { Pelicula } from '../../database/entities/pelicula.entity.js';
import type { Funcion } from '../../database/entities/funcion.entity.js';
import type { Repository } from 'typeorm';

describe('PeliculasService (CU03)', () => {
  function buildService(overrides?: {
    peliculasRepo?: Partial<Repository<Pelicula>>;
    funcionesRepo?: Partial<Repository<Funcion>>;
  }) {
    const peliculasRepo = {
      create: vi.fn((input) => input),
      save: vi.fn(async (entity) => ({ idPelicula: 1, estado: 'activa', ...entity })),
      findOne: vi.fn(),
      find: vi.fn(),
      ...overrides?.peliculasRepo,
    } as unknown as Repository<Pelicula>;

    const funcionesRepo = {
      count: vi.fn().mockResolvedValue(0),
      ...overrides?.funcionesRepo,
    } as unknown as Repository<Funcion>;

    const service = new PeliculasService(peliculasRepo, funcionesRepo);
    return { service, peliculasRepo, funcionesRepo };
  }

  it('crear devuelve la entidad guardada', async () => {
    const { service, peliculasRepo } = buildService();

    const resultado = await service.crear({
      titulo: 'Batman',
      duracionMin: 150,
    });

    expect(peliculasRepo.create).toHaveBeenCalledWith({
      titulo: 'Batman',
      genero: null,
      duracionMin: 150,
      clasificacion: null,
      posterUrl: null,
    });
    expect(resultado).toMatchObject({ titulo: 'Batman', duracionMin: 150 });
  });

  it('actualizar aplica el patch sobre la película existente', async () => {
    const peliculaExistente: Pelicula = {
      idPelicula: 5,
      titulo: 'Viejo título',
      genero: 'Acción',
      duracionMin: 100,
      clasificacion: 'PG-13',
      estado: 'activa',
    };
    const { service, peliculasRepo } = buildService({
      peliculasRepo: {
        findOne: vi.fn().mockResolvedValue(peliculaExistente),
        save: vi.fn(async (entity) => entity as Pelicula),
      },
    });

    const resultado = await service.actualizar(5, { titulo: 'Nuevo título' });

    expect(resultado.titulo).toBe('Nuevo título');
    expect(resultado.duracionMin).toBe(100);
    expect(peliculasRepo.save).toHaveBeenCalled();
  });

  it('eliminar con funciones programadas a futuro lanza ConflictException', async () => {
    const pelicula: Pelicula = {
      idPelicula: 7,
      titulo: 'Con funciones futuras',
      genero: null,
      duracionMin: 120,
      clasificacion: null,
      estado: 'activa',
    };
    const { service, peliculasRepo, funcionesRepo } = buildService({
      peliculasRepo: { findOne: vi.fn().mockResolvedValue(pelicula) },
      funcionesRepo: { count: vi.fn().mockResolvedValue(2) },
    });

    await expect(service.eliminar(7)).rejects.toBeInstanceOf(ConflictException);
    expect(funcionesRepo.count).toHaveBeenCalled();
    expect(peliculasRepo.save).not.toHaveBeenCalled();
  });

  it('eliminar sin funciones futuras marca la película como inactiva', async () => {
    const pelicula: Pelicula = {
      idPelicula: 8,
      titulo: 'Sin funciones futuras',
      genero: null,
      duracionMin: 95,
      clasificacion: null,
      estado: 'activa',
    };
    const { service, peliculasRepo } = buildService({
      peliculasRepo: {
        findOne: vi.fn().mockResolvedValue(pelicula),
        save: vi.fn(async (entity) => entity as Pelicula),
      },
      funcionesRepo: { count: vi.fn().mockResolvedValue(0) },
    });

    await service.eliminar(8);

    expect(peliculasRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'inactiva' }),
    );
  });

  it('buscarPorId inexistente lanza NotFoundException', async () => {
    const { service } = buildService({
      peliculasRepo: { findOne: vi.fn().mockResolvedValue(null) },
    });

    await expect(service.buscarPorId(999)).rejects.toBeInstanceOf(NotFoundException);
  });
});
