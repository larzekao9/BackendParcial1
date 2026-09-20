import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Venta } from '../../database/entities/venta.entity.js';
import { DetalleVentaEntrada } from '../../database/entities/detalle-venta-entrada.entity.js';
import { DetalleVentaDulceria } from '../../database/entities/detalle-venta-dulceria.entity.js';
import { ProductoDulceria } from '../../database/entities/producto-dulceria.entity.js';
import { Pago } from '../../database/entities/pago.entity.js';
import { Promocion } from '../../database/entities/promocion.entity.js';

export interface RangoFechas {
  /** ISO `YYYY-MM-DD`, inclusiva. */
  desde?: string;
  /** ISO `YYYY-MM-DD`, inclusiva. */
  hasta?: string;
  /** Si true, incluye estados no pagados (pendiente, confirmada, pendiente_pago, anulada, cancelada). Default: false (solo pagada). */
  incluirNoPagadas?: boolean;
  /** Agrupación temporal para serie: 'dia' | 'semana' | 'mes'. Default: 'dia'. */
  agrupacion?: 'dia' | 'semana' | 'mes';
  /** Límite de resultados por página. */
  limit?: number;
  /** Offset para paginación. */
  offset?: number;
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

export interface ReportePorProducto {
  idProducto: number;
  nombre: string;
  cantidadVendida: number;
  montoTotal: string;
}

export interface ReportePorMetodoPago {
  metodoPago: string;
  totalVentas: number;
  montoTotal: string;
}

export interface ReportePorPromocion {
  idPromocion: number;
  nombre: string;
  tipoDescuento: string;
  totalVentas: number;
  montoDescuento: string;
}

export interface DashboardMetrica {
  actual: number;
  anterior: number;
  /** `null` cuando el periodo anterior es 0 (no hay base para calcular %). */
  variacionPorcentual: string | null;
}

export interface DashboardResponse {
  montoTotal: DashboardMetrica;
  totalVentas: DashboardMetrica;
  cantidadEntradas: DashboardMetrica;
}

export interface SerieTemporalPunto {
  fecha: string;
  montoTotal: string;
  cantidadEntradas: number;
  totalVentas: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
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
    @InjectRepository(DetalleVentaDulceria)
    private readonly detalleDulceriaRepo: Repository<DetalleVentaDulceria>,
  ) {}

  async resumenVentas(filtro: RangoFechas = {}): Promise<ResumenVentas> {
    const qbVentas = this.ventasRepo
      .createQueryBuilder('venta')
      .select('COUNT(venta.idVenta)', 'totalVentas')
      .addSelect('COALESCE(SUM(venta.total), 0)', 'montoTotal');
    this.filtrarPorRango(qbVentas, 'venta.fechaHora', filtro);
    this.filtrarEstado(qbVentas, 'venta.estado', filtro);
    const filaVentas = await qbVentas.getRawOne<{ totalVentas: string; montoTotal: string }>();

    const qbEntradas = this.detalleRepo
      .createQueryBuilder('detalle')
      .innerJoin('detalle.venta', 'venta')
      .select('COUNT(detalle.idDetalle)', 'cantidadEntradas');
    this.filtrarPorRango(qbEntradas, 'venta.fechaHora', filtro);
    this.filtrarEstado(qbEntradas, 'venta.estado', filtro);
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
    this.filtrarEstado(qbVentas, 'venta.estado', filtro);
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
    this.filtrarEstado(qbEntradas, 'venta.estado', filtro);
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
    this.filtrarEstado(qbVentas, 'venta.estado', filtro);
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
    this.filtrarEstado(qbEntradas, 'venta.estado', filtro);
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

  private filtrarEstado(
    qb: { andWhere: (condicion: string, parametros: Record<string, unknown>) => unknown },
    columna: string,
    filtro: RangoFechas,
  ): void {
    // Default: solo ventas 'pagada' (dinero real cobrado).
    // Si incluirNoPagadas = true, no filtrar por estado.
    if (!filtro.incluirNoPagadas) {
      qb.andWhere(`${columna} = :estado`, { estado: 'pagada' });
    }
  }

async porProducto(filtro: RangoFechas = {}): Promise<ReportePorProducto[]> {
     const qb = this.detalleDulceriaRepo
       .createQueryBuilder('detalle')
       .innerJoin('detalle.venta', 'venta')
       .innerJoin('detalle.producto', 'producto')
       .select('producto.idProducto', 'idProducto')
       .addSelect('producto.nombre', 'nombre')
       .addSelect('SUM(detalle.cantidad)', 'cantidadVendida')
       .addSelect('COALESCE(SUM(detalle.cantidad * detalle.precio_unitario), 0)', 'montoTotal')
       .groupBy('producto.idProducto')
       .addGroupBy('producto.nombre');
     this.filtrarPorRango(qb, 'venta.fechaHora', filtro);
     this.filtrarEstado(qb, 'venta.estado', filtro);
     const filas = await qb.getRawMany<{
       idProducto: string;
       nombre: string;
       cantidadVendida: string;
       montoTotal: string;
     }>();

     return filas.map((fila) => ({
       idProducto: Number(fila.idProducto),
       nombre: fila.nombre,
       cantidadVendida: Number(fila.cantidadVendida),
       montoTotal: Number(fila.montoTotal).toFixed(2),
     }));
   }

   async porMetodoPago(filtro: RangoFechas = {}): Promise<ReportePorMetodoPago[]> {
     const qb = this.ventasRepo
       .createQueryBuilder('venta')
       .innerJoin('venta.pagos', 'pago')
       .select('pago.metodoPago', 'metodoPago')
       .addSelect('COUNT(venta.idVenta)', 'totalVentas')
       .addSelect('COALESCE(SUM(venta.total), 0)', 'montoTotal')
       .groupBy('pago.metodoPago');
     this.filtrarPorRango(qb, 'venta.fechaHora', filtro);
     this.filtrarEstado(qb, 'venta.estado', filtro);
     // Only successful payments
     qb.andWhere('pago.estado = :estadoPago', { estadoPago: 'exitoso' });
     const filas = await qb.getRawMany<{
       metodoPago: string;
       totalVentas: string;
       montoTotal: string;
     }>();

     return filas.map((fila) => ({
       metodoPago: fila.metodoPago,
       totalVentas: Number(fila.totalVentas),
       montoTotal: Number(fila.montoTotal).toFixed(2),
     }));
   }

   async porPromocion(filtro: RangoFechas = {}): Promise<ReportePorPromocion[]> {
     const qb = this.ventasRepo
       .createQueryBuilder('venta')
       .innerJoin('venta.promocion', 'promocion')
       .select('promocion.idPromocion', 'idPromocion')
       .addSelect('promocion.nombre', 'nombre')
       .addSelect('promocion.tipoDescuento', 'tipoDescuento')
       .addSelect('COUNT(venta.idVenta)', 'totalVentas')
       .addSelect('COALESCE(SUM(venta.descuentoAplicado), 0)', 'montoDescuento')
       .groupBy('promocion.idPromocion')
       .addGroupBy('promocion.nombre')
       .addGroupBy('promocion.tipoDescuento');
     this.filtrarPorRango(qb, 'venta.fechaHora', filtro);
     this.filtrarEstado(qb, 'venta.estado', filtro);
     const filas = await qb.getRawMany<{
       idPromocion: string;
       nombre: string;
       tipoDescuento: string;
       totalVentas: string;
       montoDescuento: string;
     }>();

     return filas.map((fila) => ({
       idPromocion: Number(fila.idPromocion),
       nombre: fila.nombre,
       tipoDescuento: fila.tipoDescuento,
       totalVentas: Number(fila.totalVentas),
       montoDescuento: Number(fila.montoDescuento).toFixed(2),
     }));
   }

  /**
   * RF08/CU05 — resumen comparado contra el periodo anterior de igual longitud
   * (ej. si `desde`/`hasta` cubren 7 días, compara contra los 7 días previos).
   * Sin `desde`/`hasta`, el periodo actual es la ventana de los últimos 7 días
   * terminando hoy (default razonable para la vista principal). Reutiliza
   * `resumenVentas`, así que hereda el filtro de estado (`pagada` por default).
   */
  async dashboard(filtro: RangoFechas = {}): Promise<DashboardResponse> {
    const { actualDesde, actualHasta, anteriorDesde, anteriorHasta } = this.calcularPeriodosComparables(filtro);

    const resumenActual = await this.resumenVentas({
      desde: actualDesde,
      hasta: actualHasta,
      incluirNoPagadas: filtro.incluirNoPagadas,
    });
    const resumenAnterior = await this.resumenVentas({
      desde: anteriorDesde,
      hasta: anteriorHasta,
      incluirNoPagadas: filtro.incluirNoPagadas,
    });

    const montoActual = Number(resumenActual.montoTotal);
    const montoAnterior = Number(resumenAnterior.montoTotal);

    return {
      montoTotal: {
        actual: montoActual,
        anterior: montoAnterior,
        variacionPorcentual: calcularVariacion(montoActual, montoAnterior),
      },
      totalVentas: {
        actual: resumenActual.totalVentas,
        anterior: resumenAnterior.totalVentas,
        variacionPorcentual: calcularVariacion(resumenActual.totalVentas, resumenAnterior.totalVentas),
      },
      cantidadEntradas: {
        actual: resumenActual.cantidadEntradas,
        anterior: resumenAnterior.cantidadEntradas,
        variacionPorcentual: calcularVariacion(
          resumenActual.cantidadEntradas,
          resumenAnterior.cantidadEntradas,
        ),
      },
    };
  }

  /**
   * RF08/CU05 — serie temporal de ventas agrupada por día/semana/mes.
   * Reutiliza la misma lógica de dos queries (ventas + detalle) para evitar fan-out.
   * Devuelve puntos para gráficos de línea/barras en el frontend.
   */
  async serieTemporal(filtro: RangoFechas = {}): Promise<SerieTemporalPunto[]> {
    const agrupacion = filtro.agrupacion ?? 'dia';
    const trunc = agrupacion === 'dia'
      ? "DATE_TRUNC('day', venta.fechaHora)"
      : agrupacion === 'semana'
        ? "DATE_TRUNC('week', venta.fechaHora)"
        : "DATE_TRUNC('month', venta.fechaHora)";

    const qbVentas = this.ventasRepo
      .createQueryBuilder('venta')
      .select(`${trunc}`, 'fecha')
      .addSelect('COUNT(venta.idVenta)', 'totalVentas')
      .addSelect('COALESCE(SUM(venta.total), 0)', 'montoTotal')
      .groupBy('fecha')
      .orderBy('fecha', 'ASC');
    this.filtrarPorRango(qbVentas, 'venta.fechaHora', filtro);
    this.filtrarEstado(qbVentas, 'venta.estado', filtro);
    const filasVentas = await qbVentas.getRawMany<{
      fecha: string;
      totalVentas: string;
      montoTotal: string;
    }>();

    const qbEntradas = this.detalleRepo
      .createQueryBuilder('detalle')
      .innerJoin('detalle.venta', 'venta')
      .select(`${trunc}`, 'fecha')
      .addSelect('COUNT(detalle.idDetalle)', 'cantidadEntradas')
      .groupBy('fecha');
    this.filtrarPorRango(qbEntradas, 'venta.fechaHora', filtro);
    this.filtrarEstado(qbEntradas, 'venta.estado', filtro);
    const filasEntradas = await qbEntradas.getRawMany<{
      fecha: string;
      cantidadEntradas: string;
    }>();

    const entradasPorFecha = new Map(
      filasEntradas.map((fila) => [fila.fecha, Number(fila.cantidadEntradas)]),
    );

    return filasVentas.map((fila) => ({
      fecha: fila.fecha,
      totalVentas: Number(fila.totalVentas),
      montoTotal: Number(fila.montoTotal).toFixed(2),
      cantidadEntradas: entradasPorFecha.get(fila.fecha) ?? 0,
    }));
  }

  /**
   * Versión paginada de porPelicula.
   * Devuelve data + metadatos de paginación (total, limit, offset, hasMore).
   */
  async porPeliculaPaginado(filtro: RangoFechas = {}): Promise<PaginatedResponse<ReportePorPelicula>> {
    const limit = filtro.limit ?? 50;
    const offset = filtro.offset ?? 0;

    const qbVentas = this.ventasRepo
      .createQueryBuilder('venta')
      .innerJoin('venta.funcion', 'funcion')
      .innerJoin('funcion.pelicula', 'pelicula')
      .select('pelicula.idPelicula', 'idPelicula')
      .addSelect('pelicula.titulo', 'titulo')
      .addSelect('COUNT(venta.idVenta)', 'totalVentas')
      .addSelect('COALESCE(SUM(venta.total), 0)', 'montoTotal')
      .groupBy('pelicula.idPelicula')
      .addGroupBy('pelicula.titulo')
      .orderBy('totalVentas', 'DESC')
      .limit(limit)
      .offset(offset);
    this.filtrarPorRango(qbVentas, 'venta.fechaHora', filtro);
    this.filtrarEstado(qbVentas, 'venta.estado', filtro);
    const filasVentas = await qbVentas.getRawMany<{
      idPelicula: string;
      titulo: string;
      totalVentas: string;
      montoTotal: string;
    }>();

    // Count total distinct peliculas for pagination metadata
    const qbCount = this.ventasRepo
      .createQueryBuilder('venta')
      .innerJoin('venta.funcion', 'funcion')
      .innerJoin('funcion.pelicula', 'pelicula')
      .select('COUNT(DISTINCT pelicula.idPelicula)', 'total');
    this.filtrarPorRango(qbCount, 'venta.fechaHora', filtro);
    this.filtrarEstado(qbCount, 'venta.estado', filtro);
    const countResult = await qbCount.getRawOne<{ total: string }>();
    const total = Number(countResult?.total ?? 0);

    const qbEntradas = this.detalleRepo
      .createQueryBuilder('detalle')
      .innerJoin('detalle.venta', 'venta')
      .innerJoin('venta.funcion', 'funcion')
      .select('funcion.idPelicula', 'idPelicula')
      .addSelect('COUNT(detalle.idDetalle)', 'cantidadEntradas')
      .groupBy('funcion.idPelicula');
    this.filtrarPorRango(qbEntradas, 'venta.fechaHora', filtro);
    this.filtrarEstado(qbEntradas, 'venta.estado', filtro);
    const filasEntradas = await qbEntradas.getRawMany<{ idPelicula: string; cantidadEntradas: string }>();

    const entradasPorPelicula = new Map(
      filasEntradas.map((fila) => [Number(fila.idPelicula), Number(fila.cantidadEntradas)]),
    );

    const data = filasVentas.map((fila) => ({
      idPelicula: Number(fila.idPelicula),
      titulo: fila.titulo,
      totalVentas: Number(fila.totalVentas),
      montoTotal: Number(fila.montoTotal).toFixed(2),
      cantidadEntradas: entradasPorPelicula.get(Number(fila.idPelicula)) ?? 0,
    }));

    return {
      data,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Versión paginada de porFuncion.
   */
  async porFuncionPaginado(filtro: RangoFechas = {}): Promise<PaginatedResponse<ReportePorFuncion>> {
    const limit = filtro.limit ?? 50;
    const offset = filtro.offset ?? 0;

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
      .addGroupBy('funcion.horaInicio')
      .orderBy('totalVentas', 'DESC')
      .limit(limit)
      .offset(offset);
    this.filtrarPorRango(qbVentas, 'venta.fechaHora', filtro);
    this.filtrarEstado(qbVentas, 'venta.estado', filtro);
    const filasVentas = await qbVentas.getRawMany<{
      idFuncion: string;
      titulo: string;
      fecha: string;
      horaInicio: string;
      totalVentas: string;
      montoTotal: string;
    }>();

    const qbCount = this.ventasRepo
      .createQueryBuilder('venta')
      .innerJoin('venta.funcion', 'funcion')
      .select('COUNT(DISTINCT funcion.idFuncion)', 'total');
    this.filtrarPorRango(qbCount, 'venta.fechaHora', filtro);
    this.filtrarEstado(qbCount, 'venta.estado', filtro);
    const countResult = await qbCount.getRawOne<{ total: string }>();
    const total = Number(countResult?.total ?? 0);

    const qbEntradas = this.detalleRepo
      .createQueryBuilder('detalle')
      .innerJoin('detalle.venta', 'venta')
      .select('venta.idFuncion', 'idFuncion')
      .addSelect('COUNT(detalle.idDetalle)', 'cantidadEntradas')
      .groupBy('venta.idFuncion');
    this.filtrarPorRango(qbEntradas, 'venta.fechaHora', filtro);
    this.filtrarEstado(qbEntradas, 'venta.estado', filtro);
    const filasEntradas = await qbEntradas.getRawMany<{ idFuncion: string; cantidadEntradas: string }>();

    const entradasPorFuncion = new Map(
      filasEntradas.map((fila) => [Number(fila.idFuncion), Number(fila.cantidadEntradas)]),
    );

    const data = filasVentas.map((fila) => ({
      idFuncion: Number(fila.idFuncion),
      titulo: fila.titulo,
      fecha: fila.fecha,
      horaInicio: fila.horaInicio,
      totalVentas: Number(fila.totalVentas),
      montoTotal: Number(fila.montoTotal).toFixed(2),
      cantidadEntradas: entradasPorFuncion.get(Number(fila.idFuncion)) ?? 0,
    }));

    return {
      data,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Versión paginada de porProducto.
   */
  async porProductoPaginado(filtro: RangoFechas = {}): Promise<PaginatedResponse<ReportePorProducto>> {
    const limit = filtro.limit ?? 50;
    const offset = filtro.offset ?? 0;

    const qb = this.detalleDulceriaRepo
      .createQueryBuilder('detalle')
      .innerJoin('detalle.venta', 'venta')
      .innerJoin('detalle.producto', 'producto')
      .select('producto.idProducto', 'idProducto')
      .addSelect('producto.nombre', 'nombre')
      .addSelect('SUM(detalle.cantidad)', 'cantidadVendida')
      .addSelect('COALESCE(SUM(detalle.cantidad * detalle.precio_unitario), 0)', 'montoTotal')
      .groupBy('producto.idProducto')
      .addGroupBy('producto.nombre')
      .orderBy('cantidadVendida', 'DESC')
      .limit(limit)
      .offset(offset);
    this.filtrarPorRango(qb, 'venta.fechaHora', filtro);
    this.filtrarEstado(qb, 'venta.estado', filtro);
    const filas = await qb.getRawMany<{
      idProducto: string;
      nombre: string;
      cantidadVendida: string;
      montoTotal: string;
    }>();

    // Count total for pagination
    const qbCount = this.detalleDulceriaRepo
      .createQueryBuilder('detalle')
      .innerJoin('detalle.venta', 'venta')
      .innerJoin('detalle.producto', 'producto')
      .select('COUNT(DISTINCT producto.idProducto)', 'total');
    this.filtrarPorRango(qbCount, 'venta.fechaHora', filtro);
    this.filtrarEstado(qbCount, 'venta.estado', filtro);
    const countResult = await qbCount.getRawOne<{ total: string }>();
    const total = Number(countResult?.total ?? 0);

    const data = filas.map((fila) => ({
      idProducto: Number(fila.idProducto),
      nombre: fila.nombre,
      cantidadVendida: Number(fila.cantidadVendida),
      montoTotal: Number(fila.montoTotal).toFixed(2),
    }));

    return {
      data,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  /** Deriva el periodo actual (default: últimos 7 días terminando hoy) y el anterior de igual longitud. */
  private calcularPeriodosComparables(filtro: RangoFechas): {
    actualDesde: string;
    actualHasta: string;
    anteriorDesde: string;
    anteriorHasta: string;
  } {
    const MS_DIA = 24 * 60 * 60 * 1000;
    const hoy = new Date();
    const hasta = filtro.hasta ? aMediaNoche(filtro.hasta) : hoy;
    const desde = filtro.desde
      ? aMediaNoche(filtro.desde)
      : new Date(hasta.getTime() - 6 * MS_DIA);

    const duracionDias = Math.round((hasta.getTime() - desde.getTime()) / MS_DIA) + 1;
    const anteriorDesde = new Date(desde.getTime() - duracionDias * MS_DIA);
    const anteriorHasta = new Date(hasta.getTime() - duracionDias * MS_DIA);

    return {
      actualDesde: aISO(desde),
      actualHasta: aISO(hasta),
      anteriorDesde: aISO(anteriorDesde),
      anteriorHasta: aISO(anteriorHasta),
    };
  }
}

/** `((actual - anterior) / anterior) * 100`, con 1 decimal. `null` cuando `anterior === 0` (sin base). */
function calcularVariacion(actual: number, anterior: number): string | null {
  if (anterior === 0) return null;
  return (((actual - anterior) / anterior) * 100).toFixed(1);
}

/** `'YYYY-MM-DD'` → `Date` a las 00:00:00 local (mismo criterio que el filtro de rango). */
function aMediaNoche(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** `Date` → `YYYY-MM-DD` en hora local (evita el corrimiento de `toISOString`/UTC). */
function aISO(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}
