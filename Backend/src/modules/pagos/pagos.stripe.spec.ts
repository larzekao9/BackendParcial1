import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PagosService } from './pagos.service.js';
import type { StripeService } from './stripe.service.js';
import { Venta } from '../../database/entities/venta.entity.js';
import { Pago } from '../../database/entities/pago.entity.js';
import { DetalleVentaEntrada } from '../../database/entities/detalle-venta-entrada.entity.js';
import { DisponibilidadAsiento } from '../../database/entities/disponibilidad-asiento.entity.js';
import type { DataSource, Repository } from 'typeorm';

/**
 * RF04 con Stripe. Lo que se prueba acá es la regla 8 del proyecto: un pago con tarjeta pasa a `exitoso`/`pagada` SOLO por lo que
 * Stripe informa (webhook firmado o consulta del servidor), nunca por lo que diga el navegador o el agente de voz.
 */
describe('PagosService — tarjeta en línea (Stripe, modo prueba)', () => {
  const ventaPendiente: Venta = {
    idVenta: 9,
    idUsuarioCliente: 3,
    idFuncion: 10,
    idPromocion: null,
    fechaHora: new Date('2026-09-20T18:00:00'),
    subtotal: '40.00',
    descuentoAplicado: '0.00',
    total: '40.00',
    confirmacionNoReembolso: true,
    confirmacionVerbalCheck: true,
    tipoRegistro: 'voz',
    estado: 'pendiente_pago',
    metodoPagoElegido: null,
    fechaPago: null,
    idPagoActivo: null,
  };

  const pagoPendiente = {
    idPago: 500,
    idVenta: 9,
    metodoPago: 'stripe',
    estado: 'pendiente',
    monto: '40.00',
    moneda: 'BOB',
    stripePaymentIntentId: 'pi_1',
    metadata: null,
  } as unknown as Pago;

  const cliente3 = { idUsuario: 3, rol: 'cliente' } as const;
  const cliente4 = { idUsuario: 4, rol: 'cliente' } as const;

  /** Un PaymentIntent de Stripe como lo devuelve la API, con los campos que usa el servicio. */
  const intento = (cambios: Record<string, unknown> = {}) => ({
    id: 'pi_1',
    status: 'succeeded',
    amount: 4000,
    amount_received: 4000,
    currency: 'bob',
    client_secret: 'pi_1_secret_abc',
    latest_charge: 'ch_1',
    last_payment_error: null,
    metadata: { idPago: '500', idVenta: '9' },
    ...cambios,
  });

  function buildService(opciones?: {
    venta?: Partial<Venta>;
    ventasRepo?: Record<string, unknown>;
    pagosRepo?: Record<string, unknown>;
    stripe?: Record<string, unknown>;
    manager?: Record<string, unknown>;
    config?: Record<string, unknown>;
  }) {
    const venta = { ...ventaPendiente, ...opciones?.venta } as Venta;

    const ventasRepo = {
      findOne: vi.fn().mockResolvedValue(venta),
      ...opciones?.ventasRepo,
    } as unknown as Repository<Venta>;

    const pagosRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(pagoPendiente),
      save: vi.fn(async (datos: Record<string, unknown>) => ({ idPago: 500, ...datos })),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      ...opciones?.pagosRepo,
    } as unknown as Repository<Pago>;

    const stripe = {
      habilitado: true,
      clavePublicable: 'pk_test_123',
      moneda: 'bob',
      tipoCambio: 1,
      asegurarHabilitado: vi.fn(),
      crearIntento: vi.fn().mockResolvedValue(intento({ status: 'requires_payment_method', latest_charge: null })),
      obtenerIntento: vi.fn().mockResolvedValue(intento()),
      cancelarIntento: vi.fn().mockResolvedValue(intento({ status: 'canceled' })),
      construirEvento: vi.fn(),
      ...opciones?.stripe,
    } as unknown as StripeService;

    // Dentro de `transaction` se leen la venta y el pago con bloqueo; cada spec puede pisar `findOne`.
    const manager = {
      findOne: vi.fn(async (entidad: unknown) => (entidad === Venta ? venta : ({ ...pagoPendiente } as Pago))),
      find: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      ...opciones?.manager,
    };
    const dataSource = {
      transaction: vi.fn(async (cb: (m: unknown) => unknown) => cb(manager)),
    } as unknown as DataSource;

    const configService = {
      get: vi.fn((clave: string) => ({ 'pagos.pendienteTtlMin': 10, 'pagos.barridoSeg': 0, ...opciones?.config })[clave]),
    } as unknown as ConfigService;

    const service = new PagosService(ventasRepo, pagosRepo, dataSource, stripe, configService);
    return { service, ventasRepo, pagosRepo, stripe, dataSource, manager };
  }

  // ----------------------------------------------------------------------------------------------- configuración

  it('configuracion(): informa si Stripe está habilitado y la clave PUBLICABLE (nunca la secreta)', () => {
    const { service } = buildService();
    expect(service.configuracion()).toEqual({ stripe: { habilitado: true, clavePublicable: 'pk_test_123', moneda: 'bob' } });
  });

  // -------------------------------------------------------------------------------------------- iniciarStripe

  describe('iniciarStripe', () => {
    it('sin claves de Stripe corta con 503 antes de tocar la base', async () => {
      const { service, dataSource } = buildService({
        stripe: { asegurarHabilitado: vi.fn(() => { throw new ServiceUnavailableException('Stripe no está configurado'); }) },
      });

      await expect(service.iniciarStripe(9, cliente3)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('crea el PaymentIntent por el total REAL de la venta en centavos, guarda el pago pendiente y devuelve el clientSecret', async () => {
      const { service, stripe, pagosRepo, manager } = buildService();

      const resultado = await service.iniciarStripe(9, cliente3);

      expect(stripe.crearIntento).toHaveBeenCalledWith(
        expect.objectContaining({
          monto: 4000,
          moneda: 'bob',
          metadata: { idVenta: '9', idPago: '500' },
          claveIdempotencia: 'pago-500',
        }),
      );
      expect(pagosRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ idVenta: 9, monto: '40.00', moneda: 'BOB', metodoPago: 'stripe', estado: 'pendiente' }),
      );
      expect(pagosRepo.update).toHaveBeenCalledWith({ idPago: 500 }, { stripePaymentIntentId: 'pi_1' });
      expect(manager.update).toHaveBeenCalledWith(Venta, { idVenta: 9 }, { metodoPagoElegido: 'stripe', idPagoActivo: 500 });
      expect(resultado).toEqual({ idPago: 500, idVenta: 9, clientSecret: 'pi_1_secret_abc', monto: '40.00', moneda: 'BOB' });
    });

    it('el clientSecret NO se guarda en la base (solo viaja a quien paga)', async () => {
      const { service, pagosRepo } = buildService();

      await service.iniciarStripe(9, cliente3);

      const guardados = JSON.stringify([...vi.mocked(pagosRepo.save).mock.calls, ...vi.mocked(pagosRepo.update).mock.calls]);
      expect(guardados).not.toContain('pi_1_secret_abc');
    });

    it('si se cobra en dólares convierte con el tipo de cambio configurado (40 Bs / 6,96 = 5,75 USD → 575 centavos)', async () => {
      const { service, stripe, pagosRepo } = buildService({ stripe: { moneda: 'usd', tipoCambio: 6.96 } });

      const resultado = await service.iniciarStripe(9, cliente3);

      expect(stripe.crearIntento).toHaveBeenCalledWith(expect.objectContaining({ monto: 575, moneda: 'usd' }));
      expect(pagosRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ monto: '5.75', moneda: 'USD', metadata: { totalBob: '40.00', tipoCambio: 6.96 } }),
      );
      expect(resultado.moneda).toBe('USD');
    });

    it('venta inexistente → 404', async () => {
      const { service } = buildService({ manager: { findOne: vi.fn().mockResolvedValue(null) } });
      await expect(service.iniciarStripe(999, cliente3)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('un cliente no puede pagar la venta de otro → 403 y no se crea ningún intento', async () => {
      const { service, stripe } = buildService();
      await expect(service.iniciarStripe(9, cliente4)).rejects.toBeInstanceOf(ForbiddenException);
      expect(stripe.crearIntento).not.toHaveBeenCalled();
    });

    it('una venta que ya no está pendiente de pago → 409', async () => {
      const { service, stripe } = buildService({ venta: { estado: 'pagada' } });
      await expect(service.iniciarStripe(9, cliente3)).rejects.toBeInstanceOf(ConflictException);
      expect(stripe.crearIntento).not.toHaveBeenCalled();
    });

    it('recargar la ventana NO crea otro cobro: reutiliza el intento abierto (mismo monto, sin error previo)', async () => {
      const { service, stripe, pagosRepo } = buildService({
        pagosRepo: { find: vi.fn().mockResolvedValue([pagoPendiente]) },
        stripe: { obtenerIntento: vi.fn().mockResolvedValue(intento({ status: 'requires_payment_method', latest_charge: null })) },
      });

      const resultado = await service.iniciarStripe(9, cliente3);

      expect(stripe.crearIntento).not.toHaveBeenCalled();
      expect(pagosRepo.save).not.toHaveBeenCalled();
      expect(resultado).toEqual({ idPago: 500, idVenta: 9, clientSecret: 'pi_1_secret_abc', monto: '40.00', moneda: 'BOB' });
    });

    it('si el intento abierto ya falló (tarjeta rechazada) lo cancela y crea uno nuevo para reintentar', async () => {
      const { service, stripe, pagosRepo } = buildService({
        pagosRepo: { find: vi.fn().mockResolvedValue([pagoPendiente]) },
        stripe: {
          obtenerIntento: vi.fn().mockResolvedValue(intento({ status: 'requires_payment_method', last_payment_error: { code: 'card_declined' } })),
        },
      });

      await service.iniciarStripe(9, cliente3);

      expect(stripe.cancelarIntento).toHaveBeenCalledWith('pi_1');
      expect(pagosRepo.update).toHaveBeenCalledWith({ idPago: 500 }, expect.objectContaining({ estado: 'cancelado' }));
      expect(stripe.crearIntento).toHaveBeenCalledTimes(1);
    });

    it('si Stripe ya había cobrado el intento abierto: registra el cobro (venta pagada) y responde 409 en vez de crear otro', async () => {
      const { service, stripe, manager } = buildService({
        pagosRepo: { find: vi.fn().mockResolvedValue([pagoPendiente]) },
        stripe: { obtenerIntento: vi.fn().mockResolvedValue(intento({ status: 'succeeded' })) },
      });

      await expect(service.iniciarStripe(9, cliente3)).rejects.toBeInstanceOf(ConflictException);

      expect(stripe.crearIntento).not.toHaveBeenCalled();
      expect(manager.update).toHaveBeenCalledWith(Venta, { idVenta: 9 }, expect.objectContaining({ estado: 'pagada', metodoPagoElegido: 'stripe' }));
    });

    it('si Stripe falla al crear el intento: el pago queda "fallido" y el cliente recibe un 502 con mensaje claro', async () => {
      const { service, pagosRepo } = buildService({
        stripe: { crearIntento: vi.fn().mockRejectedValue(new Error('Invalid currency: bob')) },
      });

      await expect(service.iniciarStripe(9, cliente3)).rejects.toBeInstanceOf(BadGatewayException);
      expect(pagosRepo.update).toHaveBeenCalledWith({ idPago: 500 }, expect.objectContaining({ estado: 'fallido' }));
    });
  });

  // ----------------------------------------------------------------------------------------------- webhook

  describe('procesarWebhookStripe', () => {
    const cuerpo = Buffer.from('{"id":"evt_1"}');
    const evento = (tipo = 'payment_intent.succeeded') => ({ type: tipo, data: { object: { id: 'pi_1' } } });

    it('sin firma → 400 y no se toca nada', async () => {
      const { service, stripe, dataSource } = buildService();
      await expect(service.procesarWebhookStripe(cuerpo, undefined)).rejects.toBeInstanceOf(BadRequestException);
      expect(stripe.construirEvento).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('firma inválida → 400 y NO se consulta ni se escribe nada (un evento falso no puede marcar pagos)', async () => {
      const { service, stripe, dataSource, pagosRepo } = buildService({
        stripe: { construirEvento: vi.fn(() => { throw new Error('No signatures found matching the expected signature'); }) },
      });

      await expect(service.procesarWebhookStripe(cuerpo, 't=1,v1=falsa')).rejects.toBeInstanceOf(BadRequestException);
      expect(stripe.obtenerIntento).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(pagosRepo.update).not.toHaveBeenCalled();
    });

    it('sin STRIPE_WEBHOOK_SECRET responde 503 (no se puede verificar) en vez de aceptar a ciegas', async () => {
      const { service } = buildService({
        stripe: { construirEvento: vi.fn(() => { throw new ServiceUnavailableException('Falta STRIPE_WEBHOOK_SECRET'); }) },
      });
      await expect(service.procesarWebhookStripe(cuerpo, 'firma')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('payment_intent.succeeded: marca el pago exitoso y la venta pagada en la misma transacción', async () => {
      const { service, manager } = buildService({ stripe: { construirEvento: vi.fn().mockReturnValue(evento()) } });

      const respuesta = await service.procesarWebhookStripe(cuerpo, 'firma-valida');

      expect(respuesta).toEqual({ received: true });
      expect(manager.update).toHaveBeenCalledWith(
        Pago,
        { idPago: 500 },
        expect.objectContaining({ estado: 'exitoso', stripeChargeId: 'ch_1' }),
      );
      expect(manager.update).toHaveBeenCalledWith(
        Venta,
        { idVenta: 9 },
        expect.objectContaining({ estado: 'pagada', metodoPagoElegido: 'stripe', idPagoActivo: 500 }),
      );
    });

    it('el mismo evento repetido es idempotente: si el pago ya es exitoso no se vuelve a escribir', async () => {
      const { service, manager } = buildService({
        stripe: { construirEvento: vi.fn().mockReturnValue(evento()) },
        manager: {
          findOne: vi.fn(async (entidad: unknown) =>
            entidad === Venta ? { ...ventaPendiente, estado: 'pagada' } : { ...pagoPendiente, estado: 'exitoso' },
          ),
        },
      });

      await service.procesarWebhookStripe(cuerpo, 'firma-valida');

      expect(manager.update).not.toHaveBeenCalled();
    });

    it('NO confía en el estado que trae el evento: si Stripe dice ahora que el intento no está cobrado, no se marca pagado', async () => {
      const { service, manager } = buildService({
        stripe: {
          construirEvento: vi.fn().mockReturnValue(evento('payment_intent.succeeded')),
          obtenerIntento: vi.fn().mockResolvedValue(intento({ status: 'requires_payment_method', latest_charge: null })),
        },
      });

      await service.procesarWebhookStripe(cuerpo, 'firma-valida');

      expect(manager.update).not.toHaveBeenCalled();
    });

    it('si Stripe cobró un monto o moneda distintos a los pedidos NO marca la venta pagada y deja el pago "fallido"', async () => {
      const { service, manager, pagosRepo } = buildService({
        stripe: {
          construirEvento: vi.fn().mockReturnValue(evento()),
          obtenerIntento: vi.fn().mockResolvedValue(intento({ amount_received: 100 })),
        },
      });

      await service.procesarWebhookStripe(cuerpo, 'firma-valida');

      expect(manager.update).not.toHaveBeenCalled();
      expect(pagosRepo.update).toHaveBeenCalledWith({ idPago: 500 }, expect.objectContaining({ estado: 'fallido' }));
    });

    it('un PaymentIntent que no es de esta base (otro proyecto de la misma cuenta) se ignora con 200', async () => {
      const { service, manager } = buildService({
        stripe: { construirEvento: vi.fn().mockReturnValue(evento()), obtenerIntento: vi.fn().mockResolvedValue(intento({ id: 'pi_ajeno', metadata: {} })) },
        pagosRepo: { findOne: vi.fn().mockResolvedValue(null) },
      });

      await expect(service.procesarWebhookStripe(cuerpo, 'firma-valida')).resolves.toEqual({ received: true });
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('payment_intent.payment_failed: el pago queda "fallido" con el motivo del rechazo y la venta sigue pendiente', async () => {
      const { service, manager, pagosRepo } = buildService({
        stripe: {
          construirEvento: vi.fn().mockReturnValue(evento('payment_intent.payment_failed')),
          obtenerIntento: vi.fn().mockResolvedValue(
            intento({ status: 'requires_payment_method', latest_charge: null, last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds', message: 'Your card has insufficient funds.' } }),
          ),
        },
      });

      await service.procesarWebhookStripe(cuerpo, 'firma-valida');

      expect(pagosRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ idPago: 500 }),
        expect.objectContaining({
          estado: 'fallido',
          metadata: { rechazo: { codigo: 'card_declined', codigoRechazo: 'insufficient_funds', mensaje: 'Your card has insufficient funds.' } },
        }),
      );
      expect(manager.update).not.toHaveBeenCalled(); // la venta NO pasó a pagada
    });

    it('un tipo de evento que no es de PaymentIntent se acepta sin hacer nada', async () => {
      const { service, stripe, dataSource } = buildService({ stripe: { construirEvento: vi.fn().mockReturnValue({ type: 'customer.created', data: { object: { id: 'cus_1' } } }) } });

      await expect(service.procesarWebhookStripe(cuerpo, 'firma-valida')).resolves.toEqual({ received: true });
      expect(stripe.obtenerIntento).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------------------------- verificar

  describe('verificarStripe (lo que hace el navegador tras confirmar la tarjeta: el servidor le pregunta a Stripe)', () => {
    it('cobro confirmado por Stripe → la venta queda pagada y se devuelve tal como quedó en la base', async () => {
      const { service, manager } = buildService({
        ventasRepo: { findOne: vi.fn().mockResolvedValueOnce(ventaPendiente).mockResolvedValue({ ...ventaPendiente, estado: 'pagada' }) },
        pagosRepo: { findOne: vi.fn().mockResolvedValueOnce(pagoPendiente).mockResolvedValueOnce(pagoPendiente).mockResolvedValue({ ...pagoPendiente, estado: 'exitoso' }) },
      });

      const resultado = await service.verificarStripe(500, cliente3);

      expect(manager.update).toHaveBeenCalledWith(Venta, { idVenta: 9 }, expect.objectContaining({ estado: 'pagada' }));
      expect(resultado.venta.estado).toBe('pagada');
      expect(resultado.estado).toBe('exitoso');
      expect(resultado.mensaje).toBeNull();
    });

    it('si Stripe todavía no cobró (el navegador dice que sí) la venta sigue pendiente: no se le cree al navegador', async () => {
      const { service, manager } = buildService({
        stripe: { obtenerIntento: vi.fn().mockResolvedValue(intento({ status: 'requires_payment_method', latest_charge: null })) },
      });

      const resultado = await service.verificarStripe(500, cliente3);

      expect(manager.update).not.toHaveBeenCalled();
      expect(resultado.venta.estado).toBe('pendiente_pago');
    });

    it('tarjeta rechazada → estado "fallido" y el motivo, para mostrarlo/decirlo', async () => {
      const rechazo = { codigo: 'card_declined', codigoRechazo: 'generic_decline', mensaje: 'Your card was declined.' };
      const { service } = buildService({
        stripe: { obtenerIntento: vi.fn().mockResolvedValue(intento({ status: 'requires_payment_method', latest_charge: null, last_payment_error: { code: 'card_declined', message: 'Your card was declined.' } })) },
        pagosRepo: { findOne: vi.fn().mockResolvedValueOnce(pagoPendiente).mockResolvedValueOnce(pagoPendiente).mockResolvedValue({ ...pagoPendiente, estado: 'fallido', metadata: { rechazo } }) },
      });

      const resultado = await service.verificarStripe(500, cliente3);

      expect(resultado.estado).toBe('fallido');
      expect(resultado.mensaje).toBe('Your card was declined.');
    });

    it('un cliente no puede verificar el pago de otro → 403', async () => {
      const { service, stripe } = buildService();
      await expect(service.verificarStripe(500, cliente4)).rejects.toBeInstanceOf(ForbiddenException);
      expect(stripe.obtenerIntento).not.toHaveBeenCalled();
    });

    it('pago inexistente → 404; pago que no es de Stripe → 400', async () => {
      const sinPago = buildService({ pagosRepo: { findOne: vi.fn().mockResolvedValue(null) } });
      await expect(sinPago.service.verificarStripe(1, cliente3)).rejects.toBeInstanceOf(NotFoundException);

      const efectivo = buildService({ pagosRepo: { findOne: vi.fn().mockResolvedValue({ ...pagoPendiente, metodoPago: 'efectivo', stripePaymentIntentId: null }) } });
      await expect(efectivo.service.verificarStripe(500, cliente3)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ------------------------------------------------------------------------------------ cancelar y vencer

  describe('cancelarPendiente', () => {
    const detalle = [{ idDetalle: 1, idVenta: 9, idAsiento: 21 }, { idDetalle: 2, idVenta: 9, idAsiento: 22 }];

    it('cancela la venta, el intento de Stripe y libera SOLO los asientos que esa venta tenía ocupados', async () => {
      const { service, stripe, manager, pagosRepo } = buildService({
        pagosRepo: { find: vi.fn().mockResolvedValue([pagoPendiente]) },
        manager: { find: vi.fn().mockResolvedValue(detalle) },
        ventasRepo: { findOne: vi.fn().mockResolvedValueOnce(ventaPendiente).mockResolvedValue({ ...ventaPendiente, estado: 'cancelada' }) },
      });

      const resultado = await service.cancelarPendiente(9, cliente3);

      expect(stripe.cancelarIntento).toHaveBeenCalledWith('pi_1');
      expect(pagosRepo.update).toHaveBeenCalledWith({ idPago: 500 }, expect.objectContaining({ estado: 'cancelado' }));
      expect(manager.find).toHaveBeenCalledWith(DetalleVentaEntrada, { where: { idVenta: 9 } });
      // Solo pasa a "disponible" lo que estaba "ocupado" (un asiento de una función cancelada no se resucita).
      expect(manager.update).toHaveBeenCalledWith(
        DisponibilidadAsiento,
        expect.objectContaining({ idFuncion: 10, estado: 'ocupado' }),
        { estado: 'disponible' },
      );
      expect(manager.update).toHaveBeenCalledWith(Venta, { idVenta: 9 }, { estado: 'cancelada' });
      expect(resultado.estado).toBe('cancelada');
    });

    it('si la venta ya está pagada → 409 y no se libera nada', async () => {
      const { service, manager } = buildService({ venta: { estado: 'pagada' } });
      await expect(service.cancelarPendiente(9, cliente3)).rejects.toBeInstanceOf(ConflictException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('si ya estaba cancelada es idempotente: devuelve la venta sin volver a liberar asientos', async () => {
      const { service, manager } = buildService({ venta: { estado: 'cancelada' } });

      const resultado = await service.cancelarPendiente(9, cliente3);

      expect(resultado.estado).toBe('cancelada');
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('un cliente no puede cancelar la venta de otro → 403', async () => {
      const { service } = buildService();
      await expect(service.cancelarPendiente(9, cliente4)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('carrera "cancelar" vs "pagar": si Stripe ya cobró, se registra el cobro, se responde 409 y los asientos NO se liberan', async () => {
      const { service, manager } = buildService({
        pagosRepo: { find: vi.fn().mockResolvedValue([pagoPendiente]) },
        stripe: {
          cancelarIntento: vi.fn().mockRejectedValue(new Error('payment_intent_unexpected_state')),
          obtenerIntento: vi.fn().mockResolvedValue(intento({ status: 'succeeded' })),
        },
        manager: { find: vi.fn().mockResolvedValue(detalle) },
      });

      await expect(service.cancelarPendiente(9, cliente3)).rejects.toBeInstanceOf(ConflictException);

      expect(manager.update).toHaveBeenCalledWith(Venta, { idVenta: 9 }, expect.objectContaining({ estado: 'pagada', metodoPagoElegido: 'stripe' }));
      expect(manager.update).not.toHaveBeenCalledWith(DisponibilidadAsiento, expect.anything(), expect.anything());
    });

    it('sin actor (el barrido del sistema) puede cancelar la venta de cualquiera', async () => {
      const { service, manager } = buildService({
        manager: { find: vi.fn().mockResolvedValue(detalle) },
        ventasRepo: { findOne: vi.fn().mockResolvedValueOnce(ventaPendiente).mockResolvedValue({ ...ventaPendiente, estado: 'cancelada' }) },
      });

      await service.cancelarPendiente(9, undefined, 'expirada');

      expect(manager.update).toHaveBeenCalledWith(Venta, { idVenta: 9 }, { estado: 'cancelada' });
    });
  });

  describe('expirarPendientes (barrido de ventas que nadie pagó)', () => {
    /** `createQueryBuilder` encadenable que termina en las ventas vencidas indicadas. */
    const consulta = (vencidas: Venta[]) => {
      const cadena: Record<string, unknown> = {};
      for (const metodo of ['where', 'andWhere', 'orderBy', 'limit']) cadena[metodo] = vi.fn(() => cadena);
      cadena.getMany = vi.fn().mockResolvedValue(vencidas);
      return cadena;
    };

    it('busca con el reloj de la base y el TTL configurado, y cancela cada venta vencida', async () => {
      const vencidas = [{ ...ventaPendiente, idVenta: 21 }, { ...ventaPendiente, idVenta: 22 }] as Venta[];
      const q = consulta(vencidas);
      // La base "de mentira" recuerda qué ventas se cancelaron: la lectura final del servicio tiene que verlas canceladas.
      const canceladasEnBase = new Set<number>();
      const { service, manager } = buildService({
        config: { 'pagos.pendienteTtlMin': 15 },
        ventasRepo: {
          createQueryBuilder: vi.fn(() => q),
          findOne: vi.fn(async ({ where }: { where: { idVenta: number } }) => ({
            ...ventaPendiente,
            idVenta: where.idVenta,
            estado: canceladasEnBase.has(where.idVenta) ? 'cancelada' : 'pendiente_pago',
          })),
        },
        manager: {
          update: vi.fn(async (entidad: unknown, criterio: { idVenta?: number }, cambios: { estado?: string }) => {
            if (entidad === Venta && cambios.estado === 'cancelada' && criterio.idVenta) canceladasEnBase.add(criterio.idVenta);
            return { affected: 1 };
          }),
        },
      });

      const canceladas = await service.expirarPendientes();

      expect(q.where).toHaveBeenCalledWith('v.estado = :estado', { estado: 'pendiente_pago' });
      expect(q.andWhere).toHaveBeenCalledWith(expect.stringContaining('NOW()'), { ttl: 15 });
      expect(manager.update).toHaveBeenCalledWith(Venta, { idVenta: 21 }, { estado: 'cancelada' });
      expect(manager.update).toHaveBeenCalledWith(Venta, { idVenta: 22 }, { estado: 'cancelada' });
      expect(canceladas).toBe(2);
    });

    it('si una venta falla al cancelarse sigue con las demás y no rompe el barrido', async () => {
      const vencidas = [{ ...ventaPendiente, idVenta: 21 }, { ...ventaPendiente, idVenta: 22 }] as Venta[];
      let llamada = 0;
      const { service } = buildService({
        ventasRepo: {
          createQueryBuilder: vi.fn(() => consulta(vencidas)),
          findOne: vi.fn(async ({ where }: { where: { idVenta: number } }) => {
            llamada += 1;
            if (llamada === 1) throw new Error('la base se cayó un instante');
            return { ...ventaPendiente, idVenta: where.idVenta };
          }),
        },
      });

      await expect(service.expirarPendientes()).resolves.toBeGreaterThanOrEqual(0);
    });

    it('sin ventas vencidas no hace nada', async () => {
      const { service, manager } = buildService({ ventasRepo: { createQueryBuilder: vi.fn(() => consulta([])) } });
      await expect(service.expirarPendientes()).resolves.toBe(0);
      expect(manager.update).not.toHaveBeenCalled();
    });
  });
});
