import { ReportesService } from './reportes.service.js';
import type { Venta } from '../../database/entities/venta.entity.js';
import type { DetalleVentaEntrada } from '../../database/entities/detalle-venta-entrada.entity.js';
import type { Repository } from 'typeorm';

describe('ReportesService', () => {
  function buildQueryBuilderMock(rawResult: unknown) {
    const qb = {
      select: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      addGroupBy: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      getRawOne: vi.fn().mockResolvedValue(rawResult),
      getRawMany: vi.fn().mockResolvedValue(rawResult),
    };
    return qb;
  }

  function buildService(overrides: {
    ventasQb?: unknown;
    detalleQb?: unknown;
    detalleDulceriaQb?: unknown;
  }) {
    const ventasRepo = {
      createQueryBuilder: vi.fn().mockReturnValue(overrides.ventasQb),
    } as unknown as Repository<Venta>;
    const detalleRepo = {
      createQueryBuilder: vi.fn().mockReturnValue(overrides.detalleQb),
    } as unknown as Repository<DetalleVentaEntrada>;
    const detalleDulceriaRepo = {
      createQueryBuilder: vi.fn().mockReturnValue(overrides.detalleDulceriaQb),
    } as unknown as Repository<DetalleVentaDulceria>;

    const service = new ReportesService(ventasRepo, detalleRepo, detalleDulceriaRepo);
    return { service, ventasRepo, detalleRepo, detalleDulceriaRepo };
  }

  it('resumenVentas combina el total de ventas y la cantidad de entradas de dos queries separadas', async () => {
    const ventasQb = buildQueryBuilderMock({ totalVentas: '3', montoTotal: '150.00' });
    const detalleQb = buildQueryBuilderMock({ cantidadEntradas: '7' });
    const { service } = buildService({ ventasQb, detalleQb });

    const resultado = await service.resumenVentas();

    expect(resultado).toEqual({ totalVentas: 3, montoTotal: '150.00', cantidadEntradas: 7 });
  });

  it('resumenVentas sin filas (rango sin ventas) devuelve ceros, no undefined', async () => {
    const ventasQb = buildQueryBuilderMock(undefined);
    const detalleQb = buildQueryBuilderMock(undefined);
    const { service } = buildService({ ventasQb, detalleQb });

    const resultado = await service.resumenVentas();

    expect(resultado).toEqual({ totalVentas: 0, montoTotal: '0.00', cantidadEntradas: 0 });
  });

  it('resumenVentas con desde/hasta arma el filtro de rango sobre venta.fechaHora en ambas queries', async () => {
    const ventasQb = buildQueryBuilderMock({ totalVentas: '0', montoTotal: '0' });
    const detalleQb = buildQueryBuilderMock({ cantidadEntradas: '0' });
    const { service } = buildService({ ventasQb, detalleQb });

    await service.resumenVentas({ desde: '2026-01-01', hasta: '2026-01-31' });

    expect(ventasQb.andWhere).toHaveBeenCalledWith('venta.fechaHora >= :desde', {
      desde: '2026-01-01',
    });
    expect(ventasQb.andWhere).toHaveBeenCalledWith('CAST(venta.fechaHora AS date) <= :hasta', {
      hasta: '2026-01-31',
    });
    expect(detalleQb.andWhere).toHaveBeenCalledWith('venta.fechaHora >= :desde', {
      desde: '2026-01-01',
    });
  });

  it('resumenVentas sin desde/hasta no agrega ningún andWhere de rango (solo el de estado por default)', async () => {
    const ventasQb = buildQueryBuilderMock({ totalVentas: '0', montoTotal: '0' });
    const detalleQb = buildQueryBuilderMock({ cantidadEntradas: '0' });
    const { service } = buildService({ ventasQb, detalleQb });

    await service.resumenVentas();

    // Sin desde/hasta, no debe haber filtros de rango, pero SÍ el filtro de estado por default
    const llamadasVentas = ventasQb.andWhere.mock.calls;
    const llamadasDetalle = detalleQb.andWhere.mock.calls;

    expect(llamadasVentas.some((call) => call[0] === 'venta.fechaHora >= :desde')).toBe(false);
    expect(llamadasVentas.some((call) => call[0] === 'CAST(venta.fechaHora AS date) <= :hasta')).toBe(false);
    expect(llamadasDetalle.some((call) => call[0] === 'venta.fechaHora >= :desde')).toBe(false);
    expect(llamadasDetalle.some((call) => call[0] === 'CAST(venta.fechaHora AS date) <= :hasta')).toBe(false);

    // Pero sí debe haber el filtro de estado = pagada
    expect(llamadasVentas.some((call) => call[0] === 'venta.estado = :estado' && call[1].estado === 'pagada')).toBe(true);
    expect(llamadasDetalle.some((call) => call[0] === 'venta.estado = :estado' && call[1].estado === 'pagada')).toBe(true);
  });
  it('porPelicula combina monto/ventas con cantidadEntradas por idPelicula, 0 si no hay entradas', async () => {
    const ventasQb = buildQueryBuilderMock([
      { idPelicula: '1', titulo: 'Con entradas', totalVentas: '2', montoTotal: '50.00' },
      { idPelicula: '2', titulo: 'Sin entradas', totalVentas: '1', montoTotal: '10.00' },
    ]);
    const detalleQb = buildQueryBuilderMock([{ idPelicula: '1', cantidadEntradas: '5' }]);
    const { service } = buildService({ ventasQb, detalleQb });

    const resultado = await service.porPelicula();

    expect(resultado).toEqual([
      { idPelicula: 1, titulo: 'Con entradas', totalVentas: 2, montoTotal: '50.00', cantidadEntradas: 5 },
      { idPelicula: 2, titulo: 'Sin entradas', totalVentas: 1, montoTotal: '10.00', cantidadEntradas: 0 },
    ]);
  });

  it('porFuncion combina monto/ventas con cantidadEntradas por idFuncion', async () => {
    const ventasQb = buildQueryBuilderMock([
      {
        idFuncion: '10',
        titulo: 'Peli X',
        fecha: '2026-10-01',
        horaInicio: '18:00:00',
        totalVentas: '4',
        montoTotal: '80.00',
      },
    ]);
    const detalleQb = buildQueryBuilderMock([{ idFuncion: '10', cantidadEntradas: '9' }]);
    const { service } = buildService({ ventasQb, detalleQb });

    const resultado = await service.porFuncion();

    expect(resultado).toEqual([
      {
        idFuncion: 10,
        titulo: 'Peli X',
        fecha: '2026-10-01',
        horaInicio: '18:00:00',
        totalVentas: 4,
        montoTotal: '80.00',
        cantidadEntradas: 9,
      },
    ]);
  });
  it('porProducto combina cantidad y monto por idProducto', async () => {
    const detalleDulceriaQb = buildQueryBuilderMock([
      { idProducto: '1', nombre: 'Pochoclo', cantidadVendida: '10', montoTotal: '150.00' },
      { idProducto: '2', nombre: 'Gaseosa', cantidadVendida: '5', montoTotal: '75.00' },
    ]);
    const { service } = buildService({ ventasQb: {}, detalleQb: {}, detalleDulceriaQb });

    const resultado = await service.porProducto();

    expect(resultado).toEqual([
      { idProducto: 1, nombre: 'Pochoclo', cantidadVendida: 10, montoTotal: '150.00' },
      { idProducto: 2, nombre: 'Gaseosa', cantidadVendida: 5, montoTotal: '75.00' },
    ]);
  });

  it('porProducto por default filtra venta.estado = pagada', async () => {
    const detalleDulceriaQb = buildQueryBuilderMock([]);
    const { service } = buildService({ ventasQb: {}, detalleQb: {}, detalleDulceriaQb });

    await service.porProducto();

    expect(detalleDulceriaQb.andWhere).toHaveBeenCalledWith('venta.estado = :estado', { estado: 'pagada' });
  });

  it('porProducto con incluirNoPagadas=true NO filtra por estado', async () => {
    const detalleDulceriaQb = buildQueryBuilderMock([]);
    const { service } = buildService({ ventasQb: {}, detalleQb: {}, detalleDulceriaQb });

    await service.porProducto({ incluirNoPagadas: true });

    expect(detalleDulceriaQb.andWhere).not.toHaveBeenCalledWith('venta.estado = :estado', { estado: 'pagada' });
  });

  it('porMetodoPago combina ventas exitosas por método de pago', async () => {
    const ventasQb = buildQueryBuilderMock([
      { metodoPago: 'efectivo', totalVentas: '10', montoTotal: '200.00' },
      { metodoPago: 'tarjeta', totalVentas: '5', montoTotal: '150.00' },
    ]);
    const { service } = buildService({ ventasQb, detalleQb: {}, detalleDulceriaQb: {} });

    const resultado = await service.porMetodoPago();

    expect(resultado).toEqual([
      { metodoPago: 'efectivo', totalVentas: 10, montoTotal: '200.00' },
      { metodoPago: 'tarjeta', totalVentas: 5, montoTotal: '150.00' },
    ]);
  });

  it('porMetodoPago por default filtra venta.estado = pagada y pago.estado = exitoso', async () => {
    const ventasQb = buildQueryBuilderMock([]);
    const { service } = buildService({ ventasQb, detalleQb: {}, detalleDulceriaQb: {} });

    await service.porMetodoPago();

    expect(ventasQb.andWhere).toHaveBeenCalledWith('venta.estado = :estado', { estado: 'pagada' });
    expect(ventasQb.andWhere).toHaveBeenCalledWith('pago.estado = :estadoPago', { estadoPago: 'exitoso' });
  });

  it('porMetodoPago con incluirNoPagadas=true NO filtra por venta.estado', async () => {
    const ventasQb = buildQueryBuilderMock([]);
    const { service } = buildService({ ventasQb, detalleQb: {}, detalleDulceriaQb: {} });

    await service.porMetodoPago({ incluirNoPagadas: true });

    expect(ventasQb.andWhere).not.toHaveBeenCalledWith('venta.estado = :estado', { estado: 'pagada' });
    // still should filter pago.estado = exitoso (spec says only successful payments)
    expect(ventasQb.andWhere).toHaveBeenCalledWith('pago.estado = :estadoPago', { estadoPago: 'exitoso' });
  });

  it('porPromocion agrupa ventas por promoción y suma descuento aplicado', async () => {
    const ventasQb = buildQueryBuilderMock([
      { idPromocion: '1', nombre: 'Descuento 10%', tipoDescuento: 'porcentaje', totalVentas: '7', montoDescuento: '70.00' },
      { idPromocion: '2', nombre: '2x1', tipoDescuento: '2x1', totalVentas: '3', montoDescuento: '30.00' },
    ]);
    const { service } = buildService({ ventasQb, detalleQb: {}, detalleDulceriaQb: {} });

    const resultado = await service.porPromocion();

    expect(resultado).toEqual([
      { idPromocion: 1, nombre: 'Descuento 10%', tipoDescuento: 'porcentaje', totalVentas: 7, montoDescuento: '70.00' },
      { idPromocion: 2, nombre: '2x1', tipoDescuento: '2x1', totalVentas: 3, montoDescuento: '30.00' },
    ]);
  });

  it('porPromocion por default filtra venta.estado = pagada', async () => {
    const ventasQb = buildQueryBuilderMock([]);
    const { service } = buildService({ ventasQb, detalleQb: {}, detalleDulceriaQb: {} });

    await service.porPromocion();

    expect(ventasQb.andWhere).toHaveBeenCalledWith('venta.estado = :estado', { estado: 'pagada' });
  });

  it('porPromocion con incluirNoPagadas=true NO filtra por venta.estado', async () => {
    const ventasQb = buildQueryBuilderMock([]);
    const { service } = buildService({ ventasQb, detalleQb: {}, detalleDulceriaQb: {} });

    await service.porPromocion({ incluirNoPagadas: true });

    expect(ventasQb.andWhere).not.toHaveBeenCalledWith('venta.estado = :estado', { estado: 'pagada' });
  });

  it('dashboard compara el periodo actual contra el anterior de igual longitud y calcula la variación', async () => {
    const ventasQb = buildQueryBuilderMock(undefined);
    const detalleQb = buildQueryBuilderMock(undefined);
    ventasQb.getRawOne
      .mockResolvedValueOnce({ totalVentas: '7', montoTotal: '350.00' }) // actual
      .mockResolvedValueOnce({ totalVentas: '5', montoTotal: '250.00' }); // anterior
    detalleQb.getRawOne
      .mockResolvedValueOnce({ cantidadEntradas: '14' }) // actual
      .mockResolvedValueOnce({ cantidadEntradas: '10' }); // anterior
    const { service } = buildService({ ventasQb, detalleQb });

    const resultado = await service.dashboard({ desde: '2026-01-08', hasta: '2026-01-14' });

    expect(resultado).toEqual({
      montoTotal: { actual: 350, anterior: 250, variacionPorcentual: '40.0' },
      totalVentas: { actual: 7, anterior: 5, variacionPorcentual: '40.0' },
      cantidadEntradas: { actual: 14, anterior: 10, variacionPorcentual: '40.0' },
    });
  });

  it('dashboard deriva el periodo anterior corriendo `desde`/`hasta` hacia atrás la misma cantidad de días', async () => {
    const ventasQb = buildQueryBuilderMock(undefined);
    const detalleQb = buildQueryBuilderMock(undefined);
    ventasQb.getRawOne
      .mockResolvedValueOnce({ totalVentas: '0', montoTotal: '0' })
      .mockResolvedValueOnce({ totalVentas: '0', montoTotal: '0' });
    detalleQb.getRawOne
      .mockResolvedValueOnce({ cantidadEntradas: '0' })
      .mockResolvedValueOnce({ cantidadEntradas: '0' });
    const { service } = buildService({ ventasQb, detalleQb });

    await service.dashboard({ desde: '2026-01-08', hasta: '2026-01-14' });

    expect(ventasQb.andWhere).toHaveBeenCalledWith('venta.fechaHora >= :desde', { desde: '2026-01-08' });
    expect(ventasQb.andWhere).toHaveBeenCalledWith('CAST(venta.fechaHora AS date) <= :hasta', {
      hasta: '2026-01-14',
    });
    expect(ventasQb.andWhere).toHaveBeenCalledWith('venta.fechaHora >= :desde', { desde: '2026-01-01' });
    expect(ventasQb.andWhere).toHaveBeenCalledWith('CAST(venta.fechaHora AS date) <= :hasta', {
      hasta: '2026-01-07',
    });
  });

  it('dashboard con periodo anterior en cero devuelve variacionPorcentual null (no divide por cero)', async () => {
    const ventasQb = buildQueryBuilderMock(undefined);
    const detalleQb = buildQueryBuilderMock(undefined);
    ventasQb.getRawOne
      .mockResolvedValueOnce({ totalVentas: '3', montoTotal: '90.00' }) // actual
      .mockResolvedValueOnce({ totalVentas: '0', montoTotal: '0' }); // anterior
    detalleQb.getRawOne
      .mockResolvedValueOnce({ cantidadEntradas: '6' })
      .mockResolvedValueOnce({ cantidadEntradas: '0' });
    const { service } = buildService({ ventasQb, detalleQb });

    const resultado = await service.dashboard();

    expect(resultado.montoTotal).toEqual({
      actual: 90,
      anterior: 0,
      variacionPorcentual: null,
    });
    expect(resultado.totalVentas.variacionPorcentual).toBeNull();
    expect(resultado.cantidadEntradas.variacionPorcentual).toBeNull();
  });

  it('dashboard sin rango usa los últimos 7 días terminando hoy y propaga incluirNoPagadas', async () => {
    const { service } = buildService({ ventasQb: {}, detalleQb: {}, detalleDulceriaQb: {} });

    const resumenSpy = vi.spyOn(ReportesService.prototype, 'resumenVentas');
    resumenSpy.mockResolvedValueOnce({ totalVentas: 1, montoTotal: '10.00', cantidadEntradas: 2 });
    resumenSpy.mockResolvedValueOnce({ totalVentas: 1, montoTotal: '10.00', cantidadEntradas: 2 });

    await service.dashboard({ incluirNoPagadas: true });

    const llamadas = resumenSpy.mock.calls;
    expect(llamadas).toHaveLength(2);
    expect(llamadas[0][0]?.incluirNoPagadas).toBe(true);
    expect(llamadas[1][0]?.incluirNoPagadas).toBe(true);
    expect(llamadas[0][0]?.desde).toBeDefined();
    expect(llamadas[0][0]?.hasta).toBeDefined();
    expect(llamadas[1][0]?.desde).toBeDefined();
    expect(llamadas[1][0]?.hasta).toBeDefined();

    resumenSpy.mockRestore();
  });

  // --- Serie temporal ---
  it('serieTemporal agrupa por día y combina ventas + entradas', async () => {
    const ventasQb = buildQueryBuilderMock([
      { fecha: '2026-01-08T00:00:00.000Z', totalVentas: '3', montoTotal: '150.00' },
      { fecha: '2026-01-09T00:00:00.000Z', totalVentas: '2', montoTotal: '100.00' },
    ]);
    const detalleQb = buildQueryBuilderMock([
      { fecha: '2026-01-08T00:00:00.000Z', cantidadEntradas: '7' },
      { fecha: '2026-01-09T00:00:00.000Z', cantidadEntradas: '5' },
    ]);
    const { service } = buildService({ ventasQb, detalleQb });

    const resultado = await service.serieTemporal({ agrupacion: 'dia' });

    expect(resultado).toEqual([
      { fecha: '2026-01-08T00:00:00.000Z', totalVentas: 3, montoTotal: '150.00', cantidadEntradas: 7 },
      { fecha: '2026-01-09T00:00:00.000Z', totalVentas: 2, montoTotal: '100.00', cantidadEntradas: 5 },
    ]);
  });

  it('serieTemporal por default filtra venta.estado = pagada', async () => {
    const ventasQb = buildQueryBuilderMock([]);
    const detalleQb = buildQueryBuilderMock([]);
    const { service } = buildService({ ventasQb, detalleQb });

    await service.serieTemporal();

    expect(ventasQb.andWhere).toHaveBeenCalledWith('venta.estado = :estado', { estado: 'pagada' });
    expect(detalleQb.andWhere).toHaveBeenCalledWith('venta.estado = :estado', { estado: 'pagada' });
  });

  // --- Paginación porPelicula ---
  it('porPeliculaPaginado devuelve data + metadatos de paginación', async () => {
    const ventasQbData = buildQueryBuilderMock([
      { idPelicula: '1', titulo: 'Peli A', totalVentas: '5', montoTotal: '250.00' },
      { idPelicula: '2', titulo: 'Peli B', totalVentas: '3', montoTotal: '150.00' },
    ]);
    const detalleQb = buildQueryBuilderMock([
      { idPelicula: '1', cantidadEntradas: '12' },
      { idPelicula: '2', cantidadEntradas: '8' },
    ]);
    const ventasQbCount = buildQueryBuilderMock({ total: '2' });

    const { service, ventasRepo } = buildService({ ventasQb: ventasQbData, detalleQb, detalleDulceriaQb: {} });
    ventasRepo.createQueryBuilder
      .mockReturnValueOnce(ventasQbData)
      .mockReturnValueOnce(ventasQbCount);

    const resultado = await service.porPeliculaPaginado({ limit: 10, offset: 0 });

    expect(resultado).toEqual({
      data: [
        { idPelicula: 1, titulo: 'Peli A', totalVentas: 5, montoTotal: '250.00', cantidadEntradas: 12 },
        { idPelicula: 2, titulo: 'Peli B', totalVentas: 3, montoTotal: '150.00', cantidadEntradas: 8 },
      ],
      total: 2,
      limit: 10,
      offset: 0,
      hasMore: false, // 0+10 >= 2
    });
  });

  it('porPeliculaPaginado por default filtra venta.estado = pagada', async () => {
    const ventasQbData = buildQueryBuilderMock([]);
    const detalleQb = buildQueryBuilderMock([]);
    const ventasQbCount = buildQueryBuilderMock({ total: '0' });

    const { service, ventasRepo } = buildService({ ventasQb: ventasQbData, detalleQb, detalleDulceriaQb: {} });
    ventasRepo.createQueryBuilder
      .mockReturnValueOnce(ventasQbData)
      .mockReturnValueOnce(ventasQbCount);

    await service.porPeliculaPaginado();

    expect(ventasQbData.andWhere).toHaveBeenCalledWith('venta.estado = :estado', { estado: 'pagada' });
  });

  // --- Paginación porFuncion ---
  it('porFuncionPaginado devuelve data + metadatos de paginación', async () => {
    const ventasQbData = buildQueryBuilderMock([
      { idFuncion: '10', titulo: 'Peli X', fecha: '2026-10-01', horaInicio: '18:00:00', totalVentas: '3', montoTotal: '150.00' },
    ]);
    const detalleQb = buildQueryBuilderMock([{ idFuncion: '10', cantidadEntradas: '8' }]);
    const ventasQbCount = buildQueryBuilderMock({ total: '1' });

    const { service, ventasRepo } = buildService({ ventasQb: ventasQbData, detalleQb, detalleDulceriaQb: {} });
    ventasRepo.createQueryBuilder
      .mockReturnValueOnce(ventasQbData)
      .mockReturnValueOnce(ventasQbCount);

    const resultado = await service.porFuncionPaginado({ limit: 5, offset: 0 });

    expect(resultado).toEqual({
      data: [{
        idFuncion: 10,
        titulo: 'Peli X',
        fecha: '2026-10-01',
        horaInicio: '18:00:00',
        totalVentas: 3,
        montoTotal: '150.00',
        cantidadEntradas: 8,
      }],
      total: 1,
      limit: 5,
      offset: 0,
      hasMore: false,
    });
  });

  // --- Paginación porProducto ---
  it('porProductoPaginado devuelve data + metadatos de paginación', async () => {
    const detalleDulceriaQbData = buildQueryBuilderMock([
      { idProducto: '1', nombre: 'Pochoclo', cantidadVendida: '15', montoTotal: '300.00' },
      { idProducto: '2', nombre: 'Gaseosa', cantidadVendida: '10', montoTotal: '200.00' },
    ]);
    const detalleDulceriaQbCount = buildQueryBuilderMock({ total: '3' });

    const { service, detalleDulceriaRepo } = buildService({ ventasQb: {}, detalleQb: {}, detalleDulceriaQb: detalleDulceriaQbData });
    detalleDulceriaRepo.createQueryBuilder
      .mockReturnValueOnce(detalleDulceriaQbData)
      .mockReturnValueOnce(detalleDulceriaQbCount);

    const resultado = await service.porProductoPaginado({ limit: 10, offset: 0 });

    expect(resultado).toEqual({
      data: [
        { idProducto: 1, nombre: 'Pochoclo', cantidadVendida: 15, montoTotal: '300.00' },
        { idProducto: 2, nombre: 'Gaseosa', cantidadVendida: 10, montoTotal: '200.00' },
      ],
      total: 3,
      limit: 10,
      offset: 0,
      hasMore: false, // 0+10 >= 3
    });
  });
});
