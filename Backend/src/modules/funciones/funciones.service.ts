import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Funcion } from '../../database/entities/funcion.entity.js';
import { DisponibilidadAsiento } from '../../database/entities/disponibilidad-asiento.entity.js';
import type { FuncionesContract, CrearFuncionInput } from '../../contracts/service-contracts.js';

/**
 * CU04 (RF07) — funciones y su disponibilidad de asientos. Dominio de Luis Blanco.
 *
 * El anti-solapamiento de horario/sala YA lo resuelve Postgres (trigger
 * `calcular_rango_ocupado()` + constraint `EXCLUDE USING gist` sobre
 * `(id_sala, rango_ocupado)`, ver base_datos_cine_ia_completa.sql y funcion.entity.ts).
 * `crear`/`actualizar` acá NO reimplementan esa detección: dejan que el INSERT/UPDATE
 * falle con SQLSTATE 23P01, que `HttpExceptionFilter` ya traduce a 409
 * `CONFLICTO_HORARIO_SALA` (ver shared/exceptions/http-exception.filter.ts). Sí se valida
 * en código que `horaFin > horaInicio`: el trigger de Postgres lanza un `RAISE EXCEPTION`
 * genérico para ese caso (no SQLSTATE 23P01), que el filtro global no traduciría a un 400
 * legible — más barato rechazarlo acá antes de llegar a la base.
 *
 * `disponibilidad_asiento` NO es un módulo con CRUD propio: sus filas las genera y
 * cancela solas la base (`trg_crear_disponibilidad` al insertar una función,
 * `trg_cancelar_disponibilidad` cuando `estado` pasa a 'cancelada') — `cancelar()` acá
 * solo hace el UPDATE de `estado`, nunca toca `disponibilidad_asiento` a mano.
 * `listarDisponibilidad` es de solo lectura, expuesta como sub-recurso
 * (`GET /funciones/:id/disponibilidad`, mismo patrón que `GET /salas/:id/asientos` de
 * `SalasService`) — arma una lista plana ordenada por fila/número; agrupar eso en una
 * matriz visual es trabajo del frontend, no de este servicio.
 *
 * `buscarPorId` lanza `NotFoundException` cuando no existe, misma convención que el resto
 * de los módulos — el contrato de Fase 0 (`FuncionesContract`) todavía dice
 * `Promise<Funcion | null>`, mismo desacople documentado ya en `PeliculasService`.
 */
@Injectable()
export class FuncionesService implements FuncionesContract {
  constructor(
    @InjectRepository(Funcion)
    private readonly funcionesRepo: Repository<Funcion>,
    @InjectRepository(DisponibilidadAsiento)
    private readonly disponibilidadRepo: Repository<DisponibilidadAsiento>,
  ) {}

  async crear(input: CrearFuncionInput): Promise<Funcion> {
    this.validarHoraFinPosterior(input.horaInicio, input.horaFin);

    const funcion = this.funcionesRepo.create({
      idPelicula: input.idPelicula,
      idSala: input.idSala,
      idPrecio: input.idPrecio ?? null,
      fecha: input.fecha,
      horaInicio: input.horaInicio,
      horaFin: input.horaFin,
      tiempoLimpiezaMin: input.tiempoLimpiezaMin ?? null,
    });
    return this.funcionesRepo.save(funcion);
  }

  async actualizar(idFuncion: number, input: Partial<CrearFuncionInput>): Promise<Funcion> {
    const funcion = await this.buscarPorId(idFuncion);

    // Mismo patrón defensivo que SalasService/PreciosService/PromocionesService.actualizar:
    // un DTO parcial trae los campos no enviados como propiedad propia `undefined`
    // (class fields de ES2023) — un Object.assign ingenuo los pisaría.
    const cambios = Object.fromEntries(
      Object.entries(input).filter(([, valor]) => valor !== undefined),
    ) as Partial<Funcion>;

    const horaInicioEfectiva = cambios.horaInicio ?? funcion.horaInicio;
    const horaFinEfectiva = cambios.horaFin ?? funcion.horaFin;
    this.validarHoraFinPosterior(horaInicioEfectiva, horaFinEfectiva);

    Object.assign(funcion, cambios);
    return this.funcionesRepo.save(funcion);
  }

  /**
   * Cancela la función (`estado = 'cancelada'`), nunca un DELETE físico — `ventas`
   * referencia `funciones` y la FK es NO ACTION (ver docs/db-schema-notes.md,
   * "Discrepancia onDelete"). El trigger `trg_cancelar_disponibilidad` se encarga de
   * pasar todas las filas de `disponibilidad_asiento` de esta función a 'cancelada'.
   */
  async cancelar(idFuncion: number): Promise<Funcion> {
    const funcion = await this.buscarPorId(idFuncion);
    funcion.estado = 'cancelada';
    return this.funcionesRepo.save(funcion);
  }

  async buscarPorId(idFuncion: number): Promise<Funcion> {
    const funcion = await this.funcionesRepo.findOne({ where: { idFuncion } });
    if (!funcion) {
      throw new NotFoundException(`No existe una función con id ${idFuncion}.`);
    }
    return funcion;
  }

  async listar(): Promise<Funcion[]> {
    return this.funcionesRepo.find({ order: { fecha: 'ASC', horaInicio: 'ASC' } });
  }

  async listarDisponibilidad(idFuncion: number): Promise<DisponibilidadAsiento[]> {
    await this.buscarPorId(idFuncion);

    return this.disponibilidadRepo
      .createQueryBuilder('disponibilidad')
      .innerJoinAndSelect('disponibilidad.asiento', 'asiento')
      .where('disponibilidad.idFuncion = :idFuncion', { idFuncion })
      .orderBy('asiento.fila', 'ASC')
      .addOrderBy('asiento.numero', 'ASC')
      .getMany();
  }

  private validarHoraFinPosterior(horaInicio: string, horaFin: string): void {
    if (horaFin <= horaInicio) {
      throw new BadRequestException('horaFin debe ser posterior a horaInicio.');
    }
  }
}
