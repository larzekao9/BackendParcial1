import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PagosService } from './pagos.service.js';
import type { StripeService } from './stripe.service.js';
import { Venta } from '../../database/entities/venta.entity.js';
import { Pago } from '../../database/entities/pago.entity.js';
import type { DataSource, Repository } from 'typeorm';

describe('PagosService — efectivo y tarjeta física (cobro controlado)', () => {
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

  const cliente3 = { idUsuario: 3, rol: 'cliente' } as const;
  const cliente4 = { idUsuario: 4, rol: 'cliente' } as const;
  const admin = { idUsuario: 1, rol: 'administrador' } as const;

  function buildService(overrides?: {
    ventasRepo?: Partial<Repository<Venta>>;
    pagosRepo?: Partial<Repository<Pago>>;
    stripe?: Partial<Record<keyof StripeService, unknown>>;
    manager?: Partial<Record<string, unknown>>;
  }) {
    const ventasRepo = {
      findOne: vi.fn().mockResolvedValue(ventaPendienteDefault),
      ...overrides?.ventasRepo,
    } as unknown as Repository<Venta>;

    const pagosRepo = {
      find: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      ...overrides?.pagosRepo,
    } as unknown as Repository<Pago>;

    const stripe = {
      habilitado: true,
      cancelarIntento: vi.fn(),
      obtenerIntento: vi.fn(),
      ...overrides?.stripe,
    } as unknown as StripeService;

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

    const configService = { get: vi.fn() } as unknown as ConfigService;

    const service = new PagosService(ventasRepo, pagosRepo, dataSource, stripe, configService);
    return { service, ventasRepo, pagosRepo, stripe, dataSource, manager };
  }

  it('rechaza método "stripe" con BadRequestException antes de consultar la venta (se inicia por otro endpoint)', async () => {
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

    await expect(service.crear({ idVenta: 999, metodo: 'efectivo' })).rejects.toBeInstanceOf(
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

    await expect(service.crear({ idVenta: 9, metodo: 'efectivo' })).rejects.toBeInstanceOf(
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

  it('éxito con "tarjeta" registrada por la caja: devuelve la venta ya actualizada, no el pago', async () => {
    const { service } = buildService();

    const resultado = await service.crear({ idVenta: 9, metodo: 'tarjeta' }, admin);

    expect(resultado.estado).toBe('pagada');
    expect(resultado.idPagoActivo).toBe(500);
    expect(resultado.metodoPagoElegido).toBe('tarjeta');
  });

  describe('quién puede cobrar qué (sin esto un cliente podía marcar su venta como pagada sin pagar)', () => {
    it('un cliente NO puede registrar una tarjeta física: es cosa de la caja (403 sin consultar la venta)', async () => {
      const { service, ventasRepo, dataSource } = buildService();

      await expect(service.crear({ idVenta: 9, metodo: 'tarjeta' }, cliente3)).rejects.toBeInstanceOf(ForbiddenException);
      expect(ventasRepo.findOne).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('un cliente NO puede pagar la venta de otra persona (403 y no se escribe nada)', async () => {
      const { service, dataSource } = buildService();

      await expect(service.crear({ idVenta: 9, metodo: 'efectivo' }, cliente4)).rejects.toBeInstanceOf(ForbiddenException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('un cliente SÍ puede pagar su propia venta en efectivo', async () => {
      const { service, manager } = buildService();

      await service.crear({ idVenta: 9, metodo: 'efectivo' }, cliente3);

      expect(manager.update).toHaveBeenCalledWith(Venta, { idVenta: 9 }, expect.objectContaining({ estado: 'pagada' }));
    });

    it('el administrador puede cobrar la venta de cualquiera (mostrador)', async () => {
      const { service, manager } = buildService();

      await service.crear({ idVenta: 9, metodo: 'efectivo' }, admin);

      expect(manager.update).toHaveBeenCalledWith(Venta, { idVenta: 9 }, expect.objectContaining({ estado: 'pagada' }));
    });
  });

  describe('efectivo sobre una venta que tenía un intento de tarjeta abierto', () => {
    const pagoStripeAbierto = {
      idPago: 77,
      idVenta: 9,
      metodoPago: 'stripe',
      estado: 'pendiente',
      monto: '40.00',
      moneda: 'BOB',
      stripePaymentIntentId: 'pi_abierto',
      metadata: null,
    };

    it('cancela el intento en Stripe y marca el pago como cancelado antes de registrar el efectivo (no se puede cobrar dos veces)', async () => {
      const { service, stripe, pagosRepo, manager } = buildService({
        pagosRepo: { find: vi.fn().mockResolvedValue([pagoStripeAbierto]) },
        stripe: { cancelarIntento: vi.fn().mockResolvedValue({ id: 'pi_abierto', status: 'canceled' }) },
      });

      await service.crear({ idVenta: 9, metodo: 'efectivo' }, cliente3);

      expect(stripe.cancelarIntento).toHaveBeenCalledWith('pi_abierto');
      expect(pagosRepo.update).toHaveBeenCalledWith({ idPago: 77 }, expect.objectContaining({ estado: 'cancelado' }));
      expect(manager.update).toHaveBeenCalledWith(Venta, { idVenta: 9 }, expect.objectContaining({ estado: 'pagada', metodoPagoElegido: 'efectivo' }));
    });

    it('si Stripe ya había cobrado ese intento NO se registra el efectivo: se aplica el cobro de la tarjeta y se responde 409', async () => {
      const cobrado = {
        id: 'pi_abierto', status: 'succeeded', amount: 4000, amount_received: 4000, currency: 'bob', latest_charge: 'ch_9', metadata: {},
      };
      const { service, manager } = buildService({
        pagosRepo: {
          find: vi.fn().mockResolvedValue([pagoStripeAbierto]),
          findOne: vi.fn().mockResolvedValue(pagoStripeAbierto),
        },
        stripe: { cancelarIntento: vi.fn().mockRejectedValue(new Error('payment_intent_unexpected_state')), obtenerIntento: vi.fn().mockResolvedValue(cobrado) },
        manager: {
          findOne: vi.fn(async (entidad: unknown) => (entidad === Venta ? { ...ventaPendienteDefault } : { ...pagoStripeAbierto })),
        },
      });

      await expect(service.crear({ idVenta: 9, metodo: 'efectivo' }, cliente3)).rejects.toBeInstanceOf(ConflictException);

      // El cobro de la tarjeta sí quedó registrado (venta pagada con stripe) y el efectivo no se insertó.
      expect(manager.update).toHaveBeenCalledWith(Venta, { idVenta: 9 }, expect.objectContaining({ estado: 'pagada', metodoPagoElegido: 'stripe' }));
      expect(manager.save).not.toHaveBeenCalled();
    });
  });
});
