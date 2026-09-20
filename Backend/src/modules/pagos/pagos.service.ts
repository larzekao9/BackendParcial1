import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Venta } from '../../database/entities/venta.entity.js';
import { Pago } from '../../database/entities/pago.entity.js';
import type { EstadoPago } from '../../database/entities/pago.entity.js';
import { DetalleVentaEntrada } from '../../database/entities/detalle-venta-entrada.entity.js';
import { DisponibilidadAsiento } from '../../database/entities/disponibilidad-asiento.entity.js';
import type {
  ActorPago,
  ConfiguracionPagos,
  CrearPagoInput,
  IniciarPagoStripeResultado,
  PagosContract,
  VerificacionPago,
} from '../../contracts/service-contracts.js';
import { StripeService } from './stripe.service.js';
import type { EventoStripe, IntentoStripe } from './stripe.service.js';

/** Resultado de preparar el cobro dentro del bloqueo de la venta: o queda listo, o resultó que Stripe ya lo había cobrado. */
type ResultadoInicio =
  | { listo: IniciarPagoStripeResultado; yaPagado?: undefined }
  | { yaPagado: IntentoStripe; listo?: undefined };

const redondear2 = (valor: number): number => Math.round(valor * 100) / 100;
const aCentavos = (valor: number | string): number => Math.round(Number(valor) * 100);

/** Estados de un pago de Stripe que todavía pueden terminar en cobro (o que hay que cerrar al cambiar de método o cancelar). */
const ESTADOS_ABIERTOS: EstadoPago[] = ['pendiente', 'procesando', 'fallido'];

/**
 * RF04 — pagos. Dominio de Luis Blanco.
 *
 * Dos familias de método, con reglas distintas a propósito:
 *
 *  - `efectivo` / `tarjeta` (POS físico): cobro "controlado por el propio sistema" — lo registra el kiosco o la caja y se
 *    confirma al instante: el `Pago` nace `exitoso` y la `Venta` pasa a `pagada` en la misma transacción. La `tarjeta` física
 *    solo la puede registrar un administrador (caja): que un cliente marque su propia venta como pagada con "tarjeta" sin que se
 *    cobre nada era un agujero.
 *  - `stripe` (tarjeta en línea, modo prueba): el `Pago` nace `pendiente` con un PaymentIntent y SOLO pasa a `exitoso` cuando
 *    Stripe informa `succeeded` — por el webhook firmado o por una consulta directa del servidor a la API de Stripe
 *    (`verificarStripe`). Nunca por lo que diga el navegador ni el agente de voz (regla 8 del proyecto).
 *
 * Una venta sin pagar (`pendiente_pago`) tiene los asientos ocupados: si nadie la termina de pagar, `expirarPendientes` la
 * cancela y los libera pasado `pagos.pendienteTtlMin` (barrido periódico), y `cancelarPendiente` lo hace al instante cuando el
 * cliente cancela.
 */
@Injectable()
export class PagosService implements PagosContract, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PagosService.name);
  private temporizador?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Venta)
    private readonly ventasRepo: Repository<Venta>,
    @InjectRepository(Pago)
    private readonly pagosRepo: Repository<Pago>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly stripe: StripeService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const cadaSeg = this.configService.get<number>('pagos.barridoSeg') ?? 0;
    if (cadaSeg <= 0) return;
    this.temporizador = setInterval(() => {
      this.expirarPendientes().catch((error: unknown) => this.logger.error('Falló el barrido de ventas sin pagar', error));
    }, cadaSeg * 1000);
    this.temporizador.unref();
  }

  onModuleDestroy(): void {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  // ------------------------------------------------------------------------------------------ configuración

  /** Lo que el frontend y el agente de voz necesitan saber para ofrecer (o no) el pago con tarjeta. La clave publicable es pública por diseño. */
  configuracion(): ConfiguracionPagos {
    return {
      stripe: { habilitado: this.stripe.habilitado, clavePublicable: this.stripe.clavePublicable, moneda: this.stripe.moneda },
    };
  }

  // ------------------------------------------------------------------------------- efectivo / tarjeta física

  async crear(input: CrearPagoInput, actor?: ActorPago): Promise<Venta> {
    if (input.metodo === 'stripe') {
      throw new BadRequestException(
        'El pago con tarjeta en línea se inicia en POST /pagos/stripe/iniciar y solo lo confirma Stripe.',
      );
    }
    if (input.metodo !== 'efectivo' && input.metodo !== 'tarjeta') {
      throw new BadRequestException(
        `El método de pago "${input.metodo}" todavía no está implementado — solo "efectivo" y "tarjeta" están disponibles.`,
      );
    }
    if (input.metodo === 'tarjeta' && actor && actor.rol !== 'administrador') {
      throw new ForbiddenException(
        'El cobro con tarjeta física lo registra la caja (administrador). Para pagar con tarjeta usá el pago en línea.',
      );
    }

    const venta = await this.cargarVenta(input.idVenta, actor);
    if (venta.estado !== 'pendiente_pago') {
      throw new ConflictException(
        `La venta ${venta.idVenta} no está pendiente de pago (estado actual: ${venta.estado}).`,
      );
    }

    // Se paga en efectivo una venta que tenía un intento de tarjeta abierto: se cierra para que no se pueda cobrar dos veces.
    await this.cerrarIntentosAbiertos(venta.idVenta);

    return this.dataSource.transaction(async (manager) => {
      const pago = await manager.save(Pago, {
        idVenta: venta.idVenta,
        monto: venta.total,
        metodoPago: input.metodo,
        estado: 'exitoso',
        fechaConfirmacion: new Date(),
      });

      await manager.update(Venta, { idVenta: venta.idVenta }, {
        estado: 'pagada',
        metodoPagoElegido: input.metodo,
        fechaPago: new Date(),
        idPagoActivo: pago.idPago,
      });

      const ventaPagada = await manager.findOne(Venta, { where: { idVenta: venta.idVenta } });
      return ventaPagada!;
    });
  }

  // ----------------------------------------------------------------------------------------------- Stripe

  /**
   * Abre (o retoma) el cobro con tarjeta de una venta pendiente y devuelve el `clientSecret` que el formulario de Stripe del
   * navegador necesita para confirmar el pago. El secreto viaja SOLO al navegador de quien paga; no se guarda en la base.
   * Recargar la ventana no crea otro cobro: si el intento sigue abierto y por el mismo monto, se devuelve ese mismo.
   */
  async iniciarStripe(idVenta: number, actor: ActorPago): Promise<IniciarPagoStripeResultado> {
    this.stripe.asegurarHabilitado();

    // OJO: acá NO se bloquea la fila de la venta (`lock: pessimistic_write`). Los pagos se escriben con `pagosRepo`, que usa OTRA conexión, y en
    // PostgreSQL insertar en `pagos` (FK a `ventas`) pide un FOR KEY SHARE sobre la venta, que choca con el FOR UPDATE: el método se trababa a sí mismo.
    // Un doble clic ya lo frena el formulario (un solo envío a la vez); si algún día hace falta serializar, hay que escribir `pagos` con este `manager`.
    const resultado = await this.dataSource.transaction(async (manager): Promise<ResultadoInicio> => {
      const venta = await manager.findOne(Venta, { where: { idVenta } });
      if (!venta) throw new NotFoundException(`No existe una venta con id ${idVenta}.`);
      this.verificarDueno(venta, actor);
      if (venta.estado !== 'pendiente_pago') {
        throw new ConflictException(`La venta ${venta.idVenta} no está pendiente de pago (estado actual: ${venta.estado}).`);
      }

      const cobro = this.montoDeCobro(Number(venta.total));
      const centavos = aCentavos(cobro.monto);

      const abiertos = await this.pagosRepo.find({
        where: { idVenta, metodoPago: 'stripe', estado: In(ESTADOS_ABIERTOS) },
        order: { idPago: 'DESC' },
      });
      for (const abierto of abiertos) {
        if (abierto.estado === 'pendiente' && abierto.stripePaymentIntentId) {
          const intento = await this.stripe.obtenerIntento(abierto.stripePaymentIntentId);
          if (intento.status === 'succeeded') return { yaPagado: intento };
          if (intento.status === 'requires_payment_method' && !intento.last_payment_error && intento.amount === centavos && intento.client_secret) {
            return { listo: this.resultadoIniciar(abierto, intento.client_secret) };
          }
        }
        const cobrado = await this.cancelarIntentoAbierto(abierto);
        if (cobrado) return { yaPagado: cobrado };
      }

      const pago = await this.pagosRepo.save({
        idVenta,
        monto: cobro.monto.toFixed(2),
        moneda: cobro.moneda,
        metodoPago: 'stripe',
        estado: 'pendiente',
        metadata: cobro.moneda === 'BOB' ? null : { totalBob: venta.total, tipoCambio: this.stripe.tipoCambio },
      } as Pago);

      let intento: IntentoStripe;
      try {
        intento = await this.stripe.crearIntento({
          monto: centavos,
          moneda: cobro.moneda.toLowerCase(),
          descripcion: `Lumen Cinema — venta #${idVenta}`,
          metadata: { idVenta: String(idVenta), idPago: String(pago.idPago) },
          claveIdempotencia: `pago-${pago.idPago}`,
        });
      } catch (error) {
        const detalle = error instanceof Error ? error.message : String(error);
        this.logger.error(`Stripe no pudo crear el intento de la venta ${idVenta}: ${detalle}`);
        await this.pagosRepo.update({ idPago: pago.idPago }, { estado: 'fallido', metadata: { errorAlCrear: detalle } });
        throw new BadGatewayException('No se pudo iniciar el pago con tarjeta. Probá de nuevo o pagá en efectivo.');
      }
      if (!intento.client_secret) {
        throw new BadGatewayException('Stripe no devolvió el secreto del pago. Probá de nuevo o pagá en efectivo.');
      }

      await this.pagosRepo.update({ idPago: pago.idPago }, { stripePaymentIntentId: intento.id });
      await manager.update(Venta, { idVenta }, { metodoPagoElegido: 'stripe', idPagoActivo: pago.idPago });
      return { listo: this.resultadoIniciar(pago, intento.client_secret) };
    });

    if (resultado.yaPagado) {
      // El bloqueo de la venta ya se soltó: acá sí se puede abrir otra transacción para registrar el cobro.
      await this.aplicarIntento(resultado.yaPagado);
      throw new ConflictException('El pago con tarjeta ya se aprobó: la venta está pagada.');
    }
    return resultado.listo!;
  }

  /**
   * Consulta a Stripe (desde el servidor) cómo quedó el intento y aplica el resultado. Es lo que hace el navegador después de
   * confirmar la tarjeta: la respuesta es la venta tal como la tiene la base, no lo que el navegador crea. El webhook hace lo
   * mismo y ambos son idempotentes, así que da igual cuál llegue primero.
   */
  async verificarStripe(idPago: number, actor: ActorPago): Promise<VerificacionPago> {
    const pago = await this.pagosRepo.findOne({ where: { idPago } });
    if (!pago) throw new NotFoundException(`No existe un pago con id ${idPago}.`);
    await this.cargarVenta(pago.idVenta, actor);
    if (pago.metodoPago !== 'stripe' || !pago.stripePaymentIntentId) {
      throw new BadRequestException(`El pago ${idPago} no es un pago con tarjeta en línea.`);
    }

    this.stripe.asegurarHabilitado();
    const intento = await this.stripe.obtenerIntento(pago.stripePaymentIntentId);
    await this.aplicarIntento(intento);

    const [actual, venta] = await Promise.all([
      this.pagosRepo.findOne({ where: { idPago } }),
      this.ventasRepo.findOne({ where: { idVenta: pago.idVenta } }),
    ]);
    const rechazo = (actual?.metadata as { rechazo?: { mensaje?: string } } | null)?.rechazo;
    return { estado: actual?.estado ?? pago.estado, venta: venta!, mensaje: actual?.estado === 'fallido' ? (rechazo?.mensaje ?? null) : null };
  }

  /**
   * Webhook de Stripe. La firma se verifica con el cuerpo EXACTO recibido (`rawBody`): un evento sin firma válida no toca nada.
   * Del evento solo se toma el id del intento; el estado se lee de Stripe en el momento (los eventos pueden llegar desordenados).
   */
  async procesarWebhookStripe(cuerpoCrudo: Buffer | undefined, firma: string | undefined): Promise<{ received: true }> {
    if (!firma || !cuerpoCrudo) {
      throw new BadRequestException('Falta la firma o el cuerpo del webhook de Stripe.');
    }
    let evento: EventoStripe;
    try {
      evento = this.stripe.construirEvento(cuerpoCrudo, firma);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.warn(`Webhook de Stripe rechazado: la firma no es válida (${error instanceof Error ? error.message : error}).`);
      throw new BadRequestException('La firma del webhook de Stripe no es válida.');
    }

    const tiposDeIntento = ['payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled', 'payment_intent.processing'];
    if (tiposDeIntento.includes(evento.type)) {
      const { id } = evento.data.object as { id: string };
      await this.aplicarIntento(await this.stripe.obtenerIntento(id));
    }
    return { received: true };
  }

  // ------------------------------------------------------------------------- cancelar y vencer ventas sin pagar

  /**
   * Cancela una venta que nadie pagó y libera sus asientos. Idempotente. Si Stripe ya había cobrado el intento (carrera entre
   * "cancelar" y "pagar") NO cancela: registra el cobro y avisa con 409.
   */
  async cancelarPendiente(idVenta: number, actor?: ActorPago, motivo = 'cancelada por el cliente'): Promise<Venta> {
    const venta = await this.cargarVenta(idVenta, actor);
    if (venta.estado === 'pagada') {
      throw new ConflictException(`La venta ${idVenta} ya está pagada: no se puede cancelar.`);
    }
    if (venta.estado !== 'pendiente_pago') return venta;

    await this.cerrarIntentosAbiertos(idVenta);

    await this.dataSource.transaction(async (manager) => {
      const bloqueada = await manager.findOne(Venta, { where: { idVenta }, lock: { mode: 'pessimistic_write' } });
      if (!bloqueada || bloqueada.estado !== 'pendiente_pago') return;
      const detalle = await manager.find(DetalleVentaEntrada, { where: { idVenta } });
      if (detalle.length > 0) {
        await manager.update(
          DisponibilidadAsiento,
          { idFuncion: bloqueada.idFuncion, idAsiento: In(detalle.map((d) => d.idAsiento)), estado: 'ocupado' },
          { estado: 'disponible' },
        );
      }
      await manager.update(Venta, { idVenta }, { estado: 'cancelada' });
    });
    this.logger.log(`Venta ${idVenta} cancelada (${motivo}): asientos liberados.`);

    return (await this.ventasRepo.findOne({ where: { idVenta } }))!;
  }

  /** Cancela las ventas `pendiente_pago` más viejas que `pagos.pendienteTtlMin`. Devuelve cuántas canceló. */
  async expirarPendientes(): Promise<number> {
    const ttlMin = this.configService.get<number>('pagos.pendienteTtlMin') ?? 10;
    // La comparación se hace con el reloj de la base (el mismo que puso `fecha_hora`), no con el del servidor de la app.
    const vencidas = await this.ventasRepo
      .createQueryBuilder('v')
      .where('v.estado = :estado', { estado: 'pendiente_pago' })
      .andWhere("v.fechaHora < NOW() - (:ttl * INTERVAL '1 minute')", { ttl: ttlMin })
      .orderBy('v.idVenta', 'ASC')
      .limit(50)
      .getMany();

    let canceladas = 0;
    for (const venta of vencidas) {
      try {
        const resultado = await this.cancelarPendiente(venta.idVenta, undefined, `expirada: más de ${ttlMin} min sin pagar`);
        if (resultado.estado === 'cancelada') canceladas += 1;
      } catch (error) {
        this.logger.warn(`No se pudo vencer la venta ${venta.idVenta}: ${error instanceof Error ? error.message : error}`);
      }
    }
    return canceladas;
  }

  // ---------------------------------------------------------------------------------------------- internos

  private async cargarVenta(idVenta: number, actor?: ActorPago): Promise<Venta> {
    const venta = await this.ventasRepo.findOne({ where: { idVenta } });
    if (!venta) {
      throw new NotFoundException(`No existe una venta con id ${idVenta}.`);
    }
    this.verificarDueno(venta, actor);
    return venta;
  }

  /** Un cliente solo opera sobre sus propias ventas; el administrador (caja) y el sistema (sin actor) sobre cualquiera. */
  private verificarDueno(venta: Venta, actor?: ActorPago): void {
    if (actor?.rol === 'cliente' && venta.idUsuarioCliente !== actor.idUsuario) {
      throw new ForbiddenException('No podés operar sobre una venta que no es tuya.');
    }
  }

  /** Las ventas están en bolivianos; el cobro sale en `STRIPE_MONEDA` (convertido con `STRIPE_TIPO_CAMBIO` si no es bob). */
  private montoDeCobro(totalBob: number): { monto: number; moneda: 'BOB' | 'USD' | 'EUR' } {
    const moneda = this.stripe.moneda;
    if (moneda === 'bob') return { monto: redondear2(totalBob), moneda: 'BOB' };
    return { monto: redondear2(totalBob / this.stripe.tipoCambio), moneda: moneda.toUpperCase() as 'USD' | 'EUR' };
  }

  private resultadoIniciar(pago: Pago, clientSecret: string): IniciarPagoStripeResultado {
    return { idPago: pago.idPago, idVenta: pago.idVenta, clientSecret, monto: pago.monto, moneda: pago.moneda };
  }

  private async buscarPagoDelIntento(intento: IntentoStripe): Promise<Pago | null> {
    const porIntento = await this.pagosRepo.findOne({ where: { stripePaymentIntentId: intento.id } });
    if (porIntento) return porIntento;
    // Respaldo: el webhook llegó antes de que se guardara el id del intento. Solo vale si el pago todavía no tiene intento propio.
    const idPago = Number(intento.metadata?.idPago);
    if (!Number.isInteger(idPago) || idPago <= 0) return null;
    const porMetadata = await this.pagosRepo.findOne({ where: { idPago } });
    return porMetadata && !porMetadata.stripePaymentIntentId && porMetadata.idVenta === Number(intento.metadata?.idVenta) ? porMetadata : null;
  }

  /** Lleva a la base lo que Stripe dice del intento. Idempotente: repetir el mismo estado no cambia nada. */
  private async aplicarIntento(intento: IntentoStripe): Promise<void> {
    const pago = await this.buscarPagoDelIntento(intento);
    if (!pago) {
      this.logger.warn(`El PaymentIntent ${intento.id} no corresponde a ningún pago de esta base: se ignora.`);
      return;
    }
    const ahora = new Date();
    switch (intento.status) {
      case 'succeeded':
        await this.registrarExito(pago, intento);
        break;
      case 'canceled':
        await this.pagosRepo.update({ idPago: pago.idPago, estado: In(ESTADOS_ABIERTOS) }, { estado: 'cancelado', fechaProcesamiento: ahora });
        break;
      case 'processing':
        await this.pagosRepo.update({ idPago: pago.idPago, estado: 'pendiente' }, { estado: 'procesando', fechaProcesamiento: ahora });
        break;
      case 'requires_payment_method':
        if (intento.last_payment_error) {
          const error = intento.last_payment_error;
          await this.pagosRepo.update(
            { idPago: pago.idPago, estado: In(['pendiente', 'procesando'] as EstadoPago[]) },
            {
              estado: 'fallido',
              fechaProcesamiento: ahora,
              metadata: { ...(pago.metadata ?? {}), rechazo: { codigo: error.code ?? null, codigoRechazo: error.decline_code ?? null, mensaje: error.message ?? null } },
            },
          );
        }
        break;
      default:
        break;
    }
  }

  private async registrarExito(pago: Pago, intento: IntentoStripe): Promise<void> {
    // El monto y la moneda del cobro tienen que ser EXACTAMENTE los que este servidor pidió al crear el intento.
    if (intento.amount_received !== aCentavos(pago.monto) || intento.currency !== pago.moneda.toLowerCase()) {
      this.logger.error(
        `Discrepancia en el PaymentIntent ${intento.id}: Stripe cobró ${intento.amount_received} ${intento.currency} y se esperaba ` +
          `${aCentavos(pago.monto)} ${pago.moneda.toLowerCase()}. La venta ${pago.idVenta} NO se marca como pagada.`,
      );
      await this.pagosRepo.update(
        { idPago: pago.idPago },
        { estado: 'fallido', metadata: { ...(pago.metadata ?? {}), discrepancia: { cobrado: intento.amount_received, moneda: intento.currency } } },
      );
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      const venta = await manager.findOne(Venta, { where: { idVenta: pago.idVenta }, lock: { mode: 'pessimistic_write' } });
      const actual = await manager.findOne(Pago, { where: { idPago: pago.idPago }, lock: { mode: 'pessimistic_write' } });
      if (!venta || !actual) return;
      if (actual.estado === 'exitoso') return; // webhook repetido o verificación repetida: ya está registrado

      const ahora = new Date();
      const cargo = typeof intento.latest_charge === 'string' ? intento.latest_charge : (intento.latest_charge?.id ?? null);
      await manager.update(Pago, { idPago: actual.idPago }, { estado: 'exitoso', fechaConfirmacion: ahora, fechaProcesamiento: ahora, stripeChargeId: cargo });
      if (venta.estado === 'pendiente_pago') {
        await manager.update(Venta, { idVenta: venta.idVenta }, {
          estado: 'pagada',
          metodoPagoElegido: 'stripe',
          fechaPago: ahora,
          idPagoActivo: actual.idPago,
        });
      } else if (venta.estado !== 'pagada') {
        // Se cobró pero la venta ya se había cancelado (los asientos pueden estar vendidos a otra persona): no se revive; hay que devolver el dinero.
        this.logger.error(`Stripe cobró el intento ${intento.id} pero la venta ${venta.idVenta} está "${venta.estado}": hay que reembolsarlo a mano.`);
      }
    });
  }

  /** Cancela en Stripe un intento abierto y marca el pago. Si resulta que Stripe ya lo había cobrado, lo devuelve para que el llamador lo registre. */
  private async cancelarIntentoAbierto(pago: Pago): Promise<IntentoStripe | null> {
    if (pago.stripePaymentIntentId && this.stripe.habilitado) {
      let intento: IntentoStripe;
      try {
        intento = await this.stripe.cancelarIntento(pago.stripePaymentIntentId);
      } catch {
        // Stripe no deja cancelar un intento ya cobrado (ni uno ya cancelado): se mira cómo quedó de verdad.
        intento = await this.stripe.obtenerIntento(pago.stripePaymentIntentId);
        if (intento.status !== 'succeeded' && intento.status !== 'canceled') {
          throw new ConflictException('El pago con tarjeta se está procesando en este momento. Probá de nuevo en unos segundos.');
        }
      }
      if (intento.status === 'succeeded') return intento;
    }
    await this.pagosRepo.update({ idPago: pago.idPago }, { estado: 'cancelado', fechaProcesamiento: new Date() });
    return null;
  }

  /** Cierra los intentos de tarjeta abiertos de una venta. Si uno ya estaba cobrado, registra ese cobro y corta con 409. */
  private async cerrarIntentosAbiertos(idVenta: number): Promise<void> {
    const abiertos = await this.pagosRepo.find({ where: { idVenta, metodoPago: 'stripe', estado: In(ESTADOS_ABIERTOS) } });
    for (const pago of abiertos) {
      const cobrado = await this.cancelarIntentoAbierto(pago);
      if (cobrado) {
        await this.aplicarIntento(cobrado);
        throw new ConflictException('El pago con tarjeta se acababa de aprobar: la venta ya está pagada.');
      }
    }
  }
}
