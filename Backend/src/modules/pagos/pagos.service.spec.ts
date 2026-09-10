import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PagosService } from './pagos.service.js';
import { Venta } from '../../database/entities/venta.entity.js';
import { Pago } from '../../database/entities/pago.entity.js';
import type { DataSource, Repository } from 'typeorm';

describe('PagosService', () => {
  const ventaPendienteDefault: Venta = {
    idVenta: 9,
    idUsuarioCliente: 3,
    idFuncion: 10,
    idPromocion: null,
    fechaHora: new Date('2026-09-10T18:00:00'),
    subtotal: '40.00',
    descuentoAplicado: '0.00',
    total: '40.00',
    confirmacionNoReembolso: true,
    confirmacionVerbalCheck: false,
    tipoRegistro: 'manual',
    estado: 'pendiente_pago',
    metodoPagoElegido: null,
    fechaPago: null,
    idPagoActivo: null,
  };

  function buildService(overrides?: {
    ventasRepo?: Partial<Repository<Venta>>;
    manager?: Partial<Record<string, unknown>>;
  }) {
    const ventasRepo = {
      findOne: vi.fn().mockResolvedValue(ventaPendienteDefault),
      ...overrides?.ventasRepo,
    } as unknown as Repository<Venta>;

    const manager = {
      save: vi.fn(async (entity: unknown, data: unknown) => {
        if (entity === Pago) {
          return { idPago: 500, ...(data as Record<string, unknown>) };
        }
        return data;
      }),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      findOne: vi.fn().mockResolvedValue({
        ...ventaPendienteDefault,
        estado: 'pagada',
        metodoPagoElegido: 'tarjeta',
        fechaPago: new Date('2026-09-10T18:05:00'),
        idPagoActivo: 500,
      }),
      ...overrides?.manager,
    };

    const dataSource = {
      transaction: vi.fn(async (cb: (manager: unknown) => unknown) => cb(manager)),
    } as unknown as DataSource;

    const service = new PagosService(ventasRepo, dataSource);
    return { service, ventasRepo, dataSource, manager };
  }

  it('rechaza método "stripe" con BadRequestException antes de consultar la venta', async () => {
    const { service, ventasRepo, dataSource } = buildService();

    await expect(
      service.crear({ idVenta: 9, metodo: 'stripe' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ventasRepo.findOne).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechaza método "qr" con BadRequestException', async () => {
    const { service } = buildService();

    await expect(service.crear({ idVenta: 9, metodo: 'qr' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('venta inexistente lanza NotFoundException', async () => {
    const { service, dataSource } = buildService({
      ventasRepo: { findOne: vi.fn().mockResolvedValue(null) },
    });

    await expect(service.crear({ idVenta: 999, metodo: 'tarjeta' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('venta que no está pendiente_pago lanza ConflictException', async () => {
    const { service, dataSource } = buildService({
      ventasRepo: {
        findOne: vi.fn().mockResolvedValue({ ...ventaPendienteDefault, estado: 'pagada' }),
      },
    });

    await expect(service.crear({ idVenta: 9, metodo: 'tarjeta' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('éxito con "efectivo": inserta el Pago en estado exitoso y marca la venta como pagada', async () => {
    const { service, manager } = buildService();

    await service.crear({ idVenta: 9, metodo: 'efectivo' });

    expect(manager.save).toHaveBeenCalledWith(
      Pago,
      expect.objectContaining({
        idVenta: 9,
        monto: '40.00',
        metodoPago: 'efectivo',
        estado: 'exitoso',
      }),
    );
    expect(manager.update).toHaveBeenCalledWith(
      Venta,
      { idVenta: 9 },
      expect.objectContaining({
        estado: 'pagada',
        metodoPagoElegido: 'efectivo',
        idPagoActivo: 500,
      }),
    );
  });

  it('éxito con "tarjeta": devuelve la venta ya actualizada, no el pago', async () => {
    const { service } = buildService();

    const resultado = await service.crear({ idVenta: 9, metodo: 'tarjeta' });

    expect(resultado.estado).toBe('pagada');
    expect(resultado.idPagoActivo).toBe(500);
    expect(resultado.metodoPagoElegido).toBe('tarjeta');
  });
});
