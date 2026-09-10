import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { Pelicula } from '../../database/entities/pelicula.entity.js';
import { Funcion } from '../../database/entities/funcion.entity.js';
import type {
  CrearPeliculaInput,
  PeliculasContract,
} from '../../contracts/service-contracts.js';

/**
 * CU03 — catálogo de películas.
 *
 * `eliminar` es un soft delete (estado = 'inactiva'), no un DELETE físico:
 * `funciones.id_pelicula` tiene FK con `onDelete: 'RESTRICT'` (ver
 * funcion.entity.ts), así que un borrado físico fallaría en Postgres apenas
 * exista CUALQUIER función que referencie la película (pasada, cancelada o
 * futura) — no solo las futuras. La regla de negocio que sí hay que aplicar
 * a mano (Postgres no la conoce) es la de RF-negocio de este módulo: no se
 * puede marcar inactiva/"eliminar" una película con funciones programadas a
 * futuro, para no romper entradas ya vendidas o por vender.
 *
 * `buscarPorId` lanza `NotFoundException` cuando no existe (en vez de
 * devolver null) para que tanto el controller (GET /:id → 404) como
 * `actualizar`/`eliminar` reutilicen la misma validación sin duplicar el
 * chequeo. Quien consuma este método desde otro módulo debe esperar el
 * throw, no un null — documentado acá porque la interface del contrato
 * (`Promise<Pelicula | null>`) permitiría lo segundo.
 */
@Injectable()
export class PeliculasService implements PeliculasContract {
  constructor(
    @InjectRepository(Pelicula)
    private readonly peliculasRepo: Repository<Pelicula>,
    @InjectRepository(Funcion)
    private readonly funcionesRepo: Repository<Funcion>,
  ) {}

  async crear(input: CrearPeliculaInput): Promise<Pelicula> {
    const pelicula = this.peliculasRepo.create({
      titulo: input.titulo,
      genero: input.genero ?? null,
      duracionMin: input.duracionMin,
      clasificacion: input.clasificacion ?? null,
      posterUrl: input.posterUrl ?? null,
    });
    return this.peliculasRepo.save(pelicula);
  }

  async actualizar(idPelicula: number, input: Partial<CrearPeliculaInput>): Promise<Pelicula> {
    const pelicula = await this.buscarPorId(idPelicula);
    Object.assign(pelicula, input);
    return this.peliculasRepo.save(pelicula);
  }

  async eliminar(idPelicula: number): Promise<void> {
    const pelicula = await this.buscarPorId(idPelicula);
    await this.rechazarSiTieneFuncionesFuturas(idPelicula);
    pelicula.estado = 'inactiva';
    await this.peliculasRepo.save(pelicula);
  }

  async buscarPorId(idPelicula: number): Promise<Pelicula> {
    const pelicula = await this.peliculasRepo.findOne({ where: { idPelicula } });
    if (!pelicula) {
      throw new NotFoundException(`No existe una película con id ${idPelicula}.`);
    }
    return pelicula;
  }

  async listar(): Promise<Pelicula[]> {
    return this.peliculasRepo.find({ order: { idPelicula: 'ASC' } });
  }

  private async rechazarSiTieneFuncionesFuturas(idPelicula: number): Promise<void> {
    const hoy = new Date().toISOString().slice(0, 10);
    const funcionesFuturas = await this.funcionesRepo.count({
      where: {
        idPelicula,
        estado: 'programada',
        fecha: MoreThanOrEqual(hoy),
      },
    });
    if (funcionesFuturas > 0) {
      throw new ConflictException(
        'No se puede eliminar la película: tiene funciones programadas a futuro.',
      );
    }
  }
}
