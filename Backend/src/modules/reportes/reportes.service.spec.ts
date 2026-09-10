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
      getRawOne: vi.fn().mockResolvedValue(rawResult),
      getRawMany: vi.fn().mockResolvedValue(rawResult),
    };
    return qb;
  }

  function buildService(overrides: { ventasQb?: unknown; detalleQb?: unknown }) {
    const ventasRepo = {
      createQueryBuilder: vi.fn().mockReturnValue(overrides.ventasQb),
    } as unknown as Repository<Venta>;
    const detalleRepo = {
      createQueryBuilder: vi.fn().mockReturnValue(overrides.detalleQb),
    } as unknown as Repository<DetalleVentaEntrada>;

    const service = new ReportesService(ventasRepo, detalleRepo);
    return { service, ventasRepo, detalleRepo };
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

  it('resumenVentas sin desde/hasta no agrega ningún andWhere de rango', async () => {
    const ventasQb = buildQueryBuilderMock({ totalVentas: '0', montoTotal: '0' });
    const detalleQb = buildQueryBuilderMock({ cantidadEntradas: '0' });
    const { service } = buildService({ ventasQb, detalleQb });

    await service.resumenVentas();

    expect(ventasQb.andWhere).not.toHaveBeenCalled();
    expect(detalleQb.andWhere).not.toHaveBeenCalled();
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
});
