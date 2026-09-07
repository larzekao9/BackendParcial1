import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Promocion } from '../../database/entities/promocion.entity.js';
import { PromocionFuncion } from '../../database/entities/promocion-funcion.entity.js';
import { Funcion } from '../../database/entities/funcion.entity.js';
import { Venta } from '../../database/entities/venta.entity.js';
import type { PromocionesContract } from '../../contracts/service-contracts.js';
import type { CrearPromocionDto } from './dto/crear-promocion.dto.js';
import type { ActualizarPromocionDto } from './dto/actualizar-promocion.dto.js';

/**
 * CU06 — promociones y su vigencia.
 *
 * `getAplicable` es contrato de Fase 0 (`PromocionesContract`, ver
 * service-contracts.ts): lo va a llamar directamente `VentasService` de
 * Luis Blanco para calcular el descuento de una venta. La firma no se toca
 * sin avisar al resto del equipo.
 *
 * DECISIÓN DE DISEÑO (desempate cuando hay más de una promoción aplicable):
 * el plan original sugiere "devolvés la de mayor descuento", pero comparar
 * el campo `valor` crudo de una promoción `'porcentaje'` contra una
 * `'monto_fijo'` no es realmente comparable sin conocer el monto base de la
 * compra (un 10% de una compra de 200 es mayor descuento que un monto fijo
 * de 15, pero de una compra de 50 no lo es). `getAplicable(idFuncion)` no
 * recibe ese monto — el contrato de Fase 0 no lo incluye — así que la regla
 * implementada acá es: de las promociones aplicables (activas y vigentes
 * para esa función), devolver la de `fechaInicio` MÁS RECIENTE
 * (`ORDER BY fechaInicio DESC`), mismo criterio de desempate que
 * `PreciosService.getVigente` usa para `vigenteDesde`. Es una
 * simplificación deliberada ("más reciente gana" en vez de comparar montos
 * no comparables). Si más adelante `VentasService` necesita elegir la
 * promoción que da el mayor ahorro real para una compra concreta, va a
 * necesitar el subtotal como parámetro adicional del contrato — eso queda
 * fuera de esta fase.
 *
 * A diferencia de `PreciosService.getVigente` (que lanza
 * `NotFoundException` cuando no hay precio vigente, porque toda venta
 * necesita un precio), acá `getAplicable` devuelve `null` cuando no hay
 * ninguna promoción aplicable — no encontrar una promoción NO es un error,
 * es el caso normal (la mayoría de funciones no tienen promoción activa).
 * Así lo pide la firma del contrato (`Promise<Promocion | null>`).
 *
 * `eliminar`: OJO — `promocion-funcion.entity.ts` declara
 * `onDelete: 'CASCADE'` en el `@ManyToOne` hacia `Promocion`, lo que
 * sugeriría que un DELETE físico simple alcanza (la cascada la haría
 * Postgres). Se verificó contra el Postgres real del contenedor
 * `cine_ia_db` (`\d promocion_funcion` / `pg_constraint.confdeltype`) y la
 * FK real —creada por `base_datos_cine_ia.sql`— es `NO ACTION`
 * (`confdeltype = 'a'`), NO `CASCADE`: el decorator de TypeORM no coincide
 * con el esquema vivo (`synchronize: false`, el esquema lo define el SQL
 * crudo, no las entidades). Un DELETE simple contra una promoción con
 * funciones asociadas chocaría con 23503 (foreign_key_violation) — el
 * filtro global lo traduce a 404 igual (no a 500), pero con un mensaje que
 * no describe bien el problema (no es que falte una referencia, es que
 * algo más la referencia a ELLA). No se corrige el esquema acá (eso
 * requiere una migración aprobada por el agente `database`, fuera de
 * alcance de esta fase): en su lugar, `eliminar` emula la cascada a nivel
 * aplicación dentro de una transacción — borra primero las filas de
 * `promocion_funcion` que referencian la promoción y recién después la
 * promoción — logrando el comportamiento que el diseño original quería
 * (borrar una promoción borra en cascada sus asociaciones a funciones sin
 * romper nada) sin depender de un constraint que en la base real no existe.
 * SÍ hay, en cambio, un chequeo que BLOQUEA el delete: `ventas.id_promocion`
 * también es `NO ACTION` (no `SET NULL`, ver comentario en `venta.entity.ts`)
 * — a diferencia de `promocion_funcion` (una asociación sin valor histórico,
 * se limpia sola), una `Venta` es un registro de una compra real ya
 * facturada. Borrar la promoción que se usó en una venta real rompería la
 * trazabilidad de esa venta, así que acá SÍ se rechaza con 409 si existe
 * alguna venta que la referencia — mismo criterio que `peliculas`/`salas`
 * con sus funciones futuras, aplicado a un caso distinto (integridad de un
 * registro histórico en vez de una operación futura).
 *
 * `buscarPorId` lanza `NotFoundException` cuando no existe, misma
 * convención que el resto de los módulos.
 */
@Injectable()
export class PromocionesService implements PromocionesContract {
  constructor(
    @InjectRepository(Promocion)
    private readonly promocionesRepo: Repository<Promocion>,
    @InjectRepository(PromocionFuncion)
    private readonly promocionFuncionRepo: Repository<PromocionFuncion>,
    @InjectRepository(Funcion)
    private readonly funcionesRepo: Repository<Funcion>,
    @InjectRepository(Venta)
    private readonly ventasRepo: Repository<Venta>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getAplicable(idFuncion: number): Promise<Promocion | null> {
    const hoy = PromocionesService.formatearFecha(new Date());

    const promocion = await this.promocionesRepo
      .createQueryBuilder('promocion')
      .innerJoin(
        PromocionFuncion,
        'promocionFuncion',
        'promocionFuncion.idPromocion = promocion.idPromocion',
      )
      .where('promocionFuncion.idFuncion = :idFuncion', { idFuncion })
      .andWhere('promocion.activa = true')
      .andWhere('promocion.fechaInicio <= :hoy', { hoy })
      .andWhere('promocion.fechaFin >= :hoy', { hoy })
      .orderBy('promocion.fechaInicio', 'DESC')
      .getOne();

    return promocion ?? null;
  }

  async asociarAFuncion(idPromocion: number, idFuncion: number): Promise<void> {
    // Se valida la existencia de ambos lados ANTES de intentar el insert:
    // si no, un id de función inexistente terminaría chocando contra la FK
    // (23503, que el filtro global traduce a 404 igual) pero preferimos dar
    // el 404 acá con un mensaje explícito de cuál de los dos ids es el
    // inválido. Si la asociación YA existe, no la chequeamos nosotros: el
    // insert choca contra la PK compuesta (23505) y dejamos que el filtro
    // global lo traduzca a 409 (ver http-exception.filter.ts) — no hace
    // falta duplicar esa lógica acá.
    await this.buscarPorId(idPromocion);

    const funcionExiste = await this.funcionesRepo.count({ where: { idFuncion } });
    if (funcionExiste === 0) {
      throw new NotFoundException(`No existe una función con id ${idFuncion}.`);
    }

    // OJO: `repo.save(repo.create({ idPromocion, idFuncion }))` NO sirve
    // acá. Cuando la entidad ya trae seteada su PK completa (acá es
    // compuesta: idPromocion + idFuncion), `Repository.save()` hace un
    // SELECT previo por esa PK y, si encuentra una fila, la trata como
    // "ya existe" y hace UPDATE en vez de INSERT (comportamiento de
    // upsert de TypeORM) — con eso, asociar la misma promoción a la misma
    // función dos veces devolvería 201 las dos veces en lugar de chocar
    // contra la PK y dar 409 (se detectó justo así en la prueba manual:
    // `save()` no lanzaba 23505 en el duplicado). `repo.insert()` sí fuerza
    // un INSERT real, que es lo que necesitamos para que Postgres rechace
    // el duplicado con 23505 y el filtro global lo traduzca a 409.
    await this.promocionFuncionRepo.insert({ idPromocion, idFuncion });
  }

  async crear(dto: CrearPromocionDto): Promise<Promocion> {
    const promocion = this.promocionesRepo.create({
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? null,
      tipoDescuento: dto.tipoDescuento,
      valor: dto.valor.toString(),
      fechaInicio: dto.fechaInicio,
      fechaFin: dto.fechaFin,
    });
    return this.promocionesRepo.save(promocion);
  }

  async actualizar(idPromocion: number, dto: ActualizarPromocionDto): Promise<Promocion> {
    const promocion = await this.buscarPorId(idPromocion);
    // Mismo patrón defensivo que SalasService.actualizar/PreciosService.actualizar
    // (ver comentario ahí y el bug de la Fase 2): con `target: ES2023`, un
    // DTO parcial trae los campos no enviados como propiedad propia
    // `undefined`. Un `Object.assign` ingenuo pisaría los valores existentes
    // de la promoción en el objeto devuelto al cliente, aunque el UPDATE en
    // Postgres no se vea afectado (TypeORM ya ignora columnas `undefined`
    // al armar el SQL).
    const cambios = Object.fromEntries(
      Object.entries(dto).filter(([, valor]) => valor !== undefined),
    ) as Record<string, unknown>;
    if (typeof cambios.valor === 'number') {
      // dto.valor llega como number; la entidad lo guarda como string.
      cambios.valor = cambios.valor.toString();
    }
    Object.assign(promocion, cambios);
    return this.promocionesRepo.save(promocion);
  }

  async eliminar(idPromocion: number): Promise<void> {
    await this.buscarPorId(idPromocion);

    // A diferencia de `promocion_funcion` (se limpia sola, ver abajo), una
    // venta que ya usó esta promoción es un registro histórico — no se
    // borra la promoción si existe al menos una.
    const ventasAsociadas = await this.ventasRepo.count({ where: { idPromocion } });
    if (ventasAsociadas > 0) {
      throw new ConflictException(
        'No se puede eliminar la promoción: fue aplicada en al menos una venta.',
      );
    }

    // Ver comentario de clase: la FK real de `promocion_funcion` es NO
    // ACTION (no CASCADE), así que se borra manualmente la asociación
    // dentro de la misma transacción antes de borrar la promoción.
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(PromocionFuncion, { idPromocion });
      await manager.delete(Promocion, { idPromocion });
    });
  }

  async buscarPorId(idPromocion: number): Promise<Promocion> {
    const promocion = await this.promocionesRepo.findOne({ where: { idPromocion } });
    if (!promocion) {
      throw new NotFoundException(`No existe una promoción con id ${idPromocion}.`);
    }
    return promocion;
  }

  async listar(): Promise<Promocion[]> {
    return this.promocionesRepo.find({ order: { idPromocion: 'ASC' } });
  }

  private static formatearFecha(fecha: Date): string {
    return fecha.toISOString().slice(0, 10);
  }
}
