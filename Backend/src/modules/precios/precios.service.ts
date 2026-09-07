import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Precio } from '../../database/entities/precio.entity.js';
import { Funcion } from '../../database/entities/funcion.entity.js';
import type { TipoAsiento } from '../../database/entities/asiento.entity.js';
import type { PreciosContract } from '../../contracts/service-contracts.js';
import type { CrearPrecioDto } from './dto/crear-precio.dto.js';
import type { ActualizarPrecioDto } from './dto/actualizar-precio.dto.js';

/**
 * CU07 — tarifario por tipo de asiento.
 *
 * `getVigente` es contrato de Fase 0 (`PreciosContract`, ver
 * service-contracts.ts): lo va a llamar directamente `VentasService` de
 * Luis Blanco para calcular el precio de una venta. La firma no se toca
 * sin avisar al resto del equipo.
 *
 * No usamos `findOne` con un `where` plano porque TypeORM no arma bien un
 * OR con IS NULL dentro del objeto `where` simple (necesitamos
 * `vigenteHasta IS NULL OR vigenteHasta >= :fecha`), así que esto va con
 * QueryBuilder. La fecha se pasa como string `YYYY-MM-DD` (no un objeto
 * `Date` crudo) para que la comparación contra las columnas `date` de
 * Postgres sea consistente sin sorpresas de timezone en el driver `pg`.
 *
 * `eliminar`: CORRECCIÓN (2026-09-07) — este comentario decía que
 * `funciones.id_precio` tenía FK con `onDelete: 'SET NULL'`, así que
 * Postgres desvincularía solo cualquier función que use este precio sin
 * necesidad de chequeo previo. Se verificó contra el Postgres real del
 * contenedor `cine_ia_db` (`pg_constraint.confdeltype`) y la FK real —
 * creada por `base_datos_cine_ia.sql`, que no declara `ON DELETE` en
 * ninguna FK— es `NO ACTION` (`confdeltype = 'a'`), NO `SET NULL` (mismo
 * tipo de discrepancia encontrada en `promocion_funcion`, ver
 * docs/db-schema-notes.md, entrada "Discrepancia onDelete"). Un DELETE
 * simple contra un precio referenciado por `funciones.id_precio` chocaría
 * con 23503 (foreign_key_violation), que el filtro global traduce a 404
 * con un mensaje que no describe el problema real. Por eso `eliminar`
 * ahora chequea explícitamente si alguna función referencia este precio
 * antes de borrar, mismo patrón que `peliculas`/`salas` con sus funciones
 * futuras.
 *
 * `buscarPorId` lanza `NotFoundException` cuando no existe, misma
 * convención que `PeliculasService`/`SalasService`.
 */
@Injectable()
export class PreciosService implements PreciosContract {
  constructor(
    @InjectRepository(Precio)
    private readonly preciosRepo: Repository<Precio>,
    @InjectRepository(Funcion)
    private readonly funcionesRepo: Repository<Funcion>,
  ) {}

  async getVigente(tipoAsiento: TipoAsiento | 'VIP', fecha: Date): Promise<Precio> {
    const fechaIso = PreciosService.formatearFecha(fecha);

    const precio = await this.preciosRepo
      .createQueryBuilder('precio')
      .where('precio.tipoAsiento = :tipoAsiento', { tipoAsiento })
      .andWhere('precio.vigenteDesde <= :fecha', { fecha: fechaIso })
      .andWhere(
        '(precio.vigenteHasta IS NULL OR precio.vigenteHasta >= :fecha)',
        { fecha: fechaIso },
      )
      .orderBy('precio.vigenteDesde', 'DESC')
      .getOne();

    if (!precio) {
      throw new NotFoundException(
        `No hay precio vigente para '${tipoAsiento}' en esa fecha.`,
      );
    }
    return precio;
  }

  async crear(dto: CrearPrecioDto): Promise<Precio> {
    const precio = this.preciosRepo.create({
      tipoAsiento: dto.tipoAsiento,
      valor: dto.valor.toString(),
      vigenteDesde: dto.vigenteDesde,
      vigenteHasta: dto.vigenteHasta ?? null,
    });
    return this.preciosRepo.save(precio);
  }

  async actualizar(idPrecio: number, dto: ActualizarPrecioDto): Promise<Precio> {
    const precio = await this.buscarPorId(idPrecio);
    // Mismo patrón defensivo que SalasService.actualizar (ver comentario ahí
    // y el bug de la Fase 2): con `target: ES2023`, un DTO parcial trae los
    // campos no enviados como propiedad propia `undefined`. Un
    // `Object.assign` ingenuo pisaría los valores existentes del precio en
    // el objeto devuelto al cliente, aunque el UPDATE en Postgres no se
    // vea afectado (TypeORM ya ignora columnas `undefined` al armar el SQL).
    const cambios = Object.fromEntries(
      Object.entries(dto).filter(([, valor]) => valor !== undefined),
    ) as Record<string, unknown>;
    if (typeof cambios.valor === 'number') {
      // dto.valor llega como number; la entidad lo guarda como string.
      cambios.valor = cambios.valor.toString();
    }
    Object.assign(precio, cambios);
    return this.preciosRepo.save(precio);
  }

  async eliminar(idPrecio: number): Promise<void> {
    await this.buscarPorId(idPrecio);

    const funcionesAsociadas = await this.funcionesRepo.count({ where: { idPrecio } });
    if (funcionesAsociadas > 0) {
      throw new ConflictException(
        'No se puede eliminar el precio: hay funciones que lo referencian.',
      );
    }

    await this.preciosRepo.delete({ idPrecio });
  }

  async buscarPorId(idPrecio: number): Promise<Precio> {
    const precio = await this.preciosRepo.findOne({ where: { idPrecio } });
    if (!precio) {
      throw new NotFoundException(`No existe un precio con id ${idPrecio}.`);
    }
    return precio;
  }

  async listar(): Promise<Precio[]> {
    return this.preciosRepo.find({ order: { idPrecio: 'ASC' } });
  }

  private static formatearFecha(fecha: Date): string {
    return fecha.toISOString().slice(0, 10);
  }
}
