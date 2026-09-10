import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Venta } from '../../database/entities/venta.entity.js';
import { DetalleVentaEntrada } from '../../database/entities/detalle-venta-entrada.entity.js';

export interface RangoFechas {
  /** ISO `YYYY-MM-DD`, inclusiva. */
  desde?: string;
  /** ISO `YYYY-MM-DD`, inclusiva. */
  hasta?: string;
}

export interface ResumenVentas {
  totalVentas: number;
  montoTotal: string;
  cantidadEntradas: number;
}

export interface ReportePorPelicula {
  idPelicula: number;
  titulo: string;
  totalVentas: number;
  montoTotal: string;
  cantidadEntradas: number;
}

export interface ReportePorFuncion {
  idFuncion: number;
  titulo: string;
  fecha: string;
  horaInicio: string;
  totalVentas: number;
  montoTotal: string;
  cantidadEntradas: number;
}

/**
 * RF08/CU05 — reportes de ventas para el administrador. Dominio de Luis Blanco.
 *
 * Solo lectura, sin contrato de Fase 0 (`service-contracts.ts` no define
 * `ReportesContract` — ningún otro módulo consume estos métodos directamente).
 *
 * `montoTotal` y `cantidadEntradas` se calculan con dos queries separadas (una sobre
 * `ventas`, otra sobre `detalle_venta_entradas`) y se combinan en memoria, en vez de un
 * único JOIN + GROUP BY: unir `ventas` con `detalle_venta_entradas` multiplica cada fila
 * de `venta` por la cantidad de asientos de esa venta, así que un `SUM(venta.total)`
 * sobre el join quedaría inflado (contaría el total de la venta una vez por cada
 * asiento). Separar ambas queries evita ese doble conteo sin necesitar `DISTINCT` sobre
 * un monto (que sería incorrecto si dos ventas distintas coinciden en el mismo total).
 *
 * El rango de fechas (`desde`/`hasta`, ambos opcionales e inclusivos) filtra por
 * `venta.fechaHora`: `desde` compara directo contra el timestamp (incluye desde las
 * 00:00:00 de ese día); `hasta` se compara contra `CAST(fechaHora AS date)` para incluir
 * el día completo, no solo hasta la medianoche.
 */
@Injectable()
export class ReportesService {
  constructor(
    @InjectRepository(Venta)
    private readonly ventasRepo: Repository<Venta>,
    @InjectRepository(DetalleVentaEntrada)
    private readonly detalleRepo: Repository<DetalleVentaEntrada>,
  ) {}

  async resumenVentas(filtro: RangoFechas = {}): Promise<ResumenVentas> {
    const qbVentas = this.ventasRepo
      .createQueryBuilder('venta')
      .select('COUNT(venta.idVenta)', 'totalVentas')
      .addSelect('COALESCE(SUM(venta.total), 0)', 'montoTotal');
    this.filtrarPorRango(qbVentas, 'venta.fechaHora', filtro);
    const filaVentas = await qbVentas.getRawOne<{ totalVentas: string; montoTotal: string }>();

    const qbEntradas = this.detalleRepo
      .createQueryBuilder('detalle')
      .innerJoin('detalle.venta', 'venta')
      .select('COUNT(detalle.idDetalle)', 'cantidadEntradas');
    this.filtrarPorRango(qbEntradas, 'venta.fechaHora', filtro);
    const filaEntradas = await qbEntradas.getRawOne<{ cantidadEntradas: string }>();

    return {
      totalVentas: Number(filaVentas?.totalVentas ?? 0),
      montoTotal: Number(filaVentas?.montoTotal ?? 0).toFixed(2),
      cantidadEntradas: Number(filaEntradas?.cantidadEntradas ?? 0),
    };
  }

  async porPelicula(filtro: RangoFechas = {}): Promise<ReportePorPelicula[]> {
    const qbVentas = this.ventasRepo
      .createQueryBuilder('venta')
      .innerJoin('venta.funcion', 'funcion')
      .innerJoin('funcion.pelicula', 'pelicula')
      .select('pelicula.idPelicula', 'idPelicula')
      .addSelect('pelicula.titulo', 'titulo')
      .addSelect('COUNT(venta.idVenta)', 'totalVentas')
      .addSelect('COALESCE(SUM(venta.total), 0)', 'montoTotal')
      .groupBy('pelicula.idPelicula')
      .addGroupBy('pelicula.titulo');
    this.filtrarPorRango(qbVentas, 'venta.fechaHora', filtro);
    const filasVentas = await qbVentas.getRawMany<{
      idPelicula: string;
      titulo: string;
      totalVentas: string;
      montoTotal: string;
    }>();

    const qbEntradas = this.detalleRepo
      .createQueryBuilder('detalle')
      .innerJoin('detalle.venta', 'venta')
      .innerJoin('venta.funcion', 'funcion')
      .select('funcion.idPelicula', 'idPelicula')
      .addSelect('COUNT(detalle.idDetalle)', 'cantidadEntradas')
      .groupBy('funcion.idPelicula');
    this.filtrarPorRango(qbEntradas, 'venta.fechaHora', filtro);
    const filasEntradas = await qbEntradas.getRawMany<{ idPelicula: string; cantidadEntradas: string }>();

    const entradasPorPelicula = new Map(
      filasEntradas.map((fila) => [Number(fila.idPelicula), Number(fila.cantidadEntradas)]),
    );

    return filasVentas.map((fila) => ({
      idPelicula: Number(fila.idPelicula),
      titulo: fila.titulo,
      totalVentas: Number(fila.totalVentas),
      montoTotal: Number(fila.montoTotal).toFixed(2),
      cantidadEntradas: entradasPorPelicula.get(Number(fila.idPelicula)) ?? 0,
    }));
  }

  async porFuncion(filtro: RangoFechas = {}): Promise<ReportePorFuncion[]> {
    const qbVentas = this.ventasRepo
      .createQueryBuilder('venta')
      .innerJoin('venta.funcion', 'funcion')
      .innerJoin('funcion.pelicula', 'pelicula')
      .select('funcion.idFuncion', 'idFuncion')
      .addSelect('pelicula.titulo', 'titulo')
      .addSelect('funcion.fecha', 'fecha')
      .addSelect('funcion.horaInicio', 'horaInicio')
      .addSelect('COUNT(venta.idVenta)', 'totalVentas')
      .addSelect('COALESCE(SUM(venta.total), 0)', 'montoTotal')
      .groupBy('funcion.idFuncion')
      .addGroupBy('pelicula.titulo')
      .addGroupBy('funcion.fecha')
      .addGroupBy('funcion.horaInicio');
    this.filtrarPorRango(qbVentas, 'venta.fechaHora', filtro);
    const filasVentas = await qbVentas.getRawMany<{
      idFuncion: string;
      titulo: string;
      fecha: string;
      horaInicio: string;
      totalVentas: string;
      montoTotal: string;
    }>();

    const qbEntradas = this.detalleRepo
      .createQueryBuilder('detalle')
      .innerJoin('detalle.venta', 'venta')
      .select('venta.idFuncion', 'idFuncion')
      .addSelect('COUNT(detalle.idDetalle)', 'cantidadEntradas')
      .groupBy('venta.idFuncion');
    this.filtrarPorRango(qbEntradas, 'venta.fechaHora', filtro);
    const filasEntradas = await qbEntradas.getRawMany<{ idFuncion: string; cantidadEntradas: string }>();

    const entradasPorFuncion = new Map(
      filasEntradas.map((fila) => [Number(fila.idFuncion), Number(fila.cantidadEntradas)]),
    );

    return filasVentas.map((fila) => ({
      idFuncion: Number(fila.idFuncion),
      titulo: fila.titulo,
      fecha: fila.fecha,
      horaInicio: fila.horaInicio,
      totalVentas: Number(fila.totalVentas),
      montoTotal: Number(fila.montoTotal).toFixed(2),
      cantidadEntradas: entradasPorFuncion.get(Number(fila.idFuncion)) ?? 0,
    }));
  }

  private filtrarPorRango(
    qb: { andWhere: (condicion: string, parametros: Record<string, unknown>) => unknown },
    columna: string,
    filtro: RangoFechas,
  ): void {
    if (filtro.desde) {
      qb.andWhere(`${columna} >= :desde`, { desde: filtro.desde });
    }
    if (filtro.hasta) {
      qb.andWhere(`CAST(${columna} AS date) <= :hasta`, { hasta: filtro.hasta });
    }
  }
}
