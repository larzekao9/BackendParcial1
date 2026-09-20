import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { AppConfig } from '../../config/env.js';

export type IntentoStripe = Stripe.PaymentIntent;
export type EventoStripe = Stripe.Event;

export interface CrearIntentoInput {
  /** En la unidad menor de la moneda (centavos). */
  monto: number;
  moneda: string;
  descripcion: string;
  metadata: Record<string, string>;
  /** Stripe devuelve el mismo intento si se repite la llamada con la misma clave (reintentos de red). */
  claveIdempotencia: string;
}

/**
 * Único punto donde el backend toca la API de Stripe (RF04). Envuelve el SDK para que `PagosService` no dependa de la red
 * (en las pruebas se reemplaza por un doble) y para que la app arranque igual sin claves: sin `STRIPE_SECRET_KEY` el pago con
 * tarjeta en línea queda deshabilitado (`habilitado === false`) y solo se puede pagar en efectivo.
 *
 * Nada de acá decide si un pago está hecho: eso lo decide `PagosService` mirando el estado que Stripe informa por el webhook
 * firmado o por una consulta directa del servidor (regla 8: nunca lo que diga el navegador ni el agente de voz).
 */
@Injectable()
export class StripeService {
  private readonly cliente: Stripe | null;
  private readonly config: AppConfig['stripe'];

  constructor(configService: ConfigService) {
    this.config = configService.get<AppConfig['stripe']>('stripe') ?? {
      secretKey: '',
      publishableKey: '',
      webhookSecret: '',
      moneda: 'bob',
      tipoCambio: 1,
    };
    this.cliente = this.config.secretKey ? new Stripe(this.config.secretKey) : null;
  }

  get habilitado(): boolean {
    return this.cliente !== null && this.config.publishableKey !== '';
  }

  get clavePublicable(): string {
    return this.config.publishableKey;
  }

  get moneda(): AppConfig['stripe']['moneda'] {
    return this.config.moneda;
  }

  get tipoCambio(): number {
    return this.config.tipoCambio;
  }

  /** Corta con 503 si no hay claves de Stripe: así el cliente recibe un mensaje claro en vez de un error interno. */
  asegurarHabilitado(): void {
    if (!this.habilitado) {
      throw new ServiceUnavailableException(
        'El pago con tarjeta no está disponible en este momento (Stripe no está configurado). Podés pagar en efectivo.',
      );
    }
  }

  private exigir(): Stripe {
    if (!this.cliente) {
      throw new ServiceUnavailableException(
        'El pago con tarjeta no está disponible en este momento (Stripe no está configurado). Podés pagar en efectivo.',
      );
    }
    return this.cliente;
  }

  crearIntento(input: CrearIntentoInput): Promise<IntentoStripe> {
    return this.exigir().paymentIntents.create(
      {
        amount: input.monto,
        currency: input.moneda,
        description: input.descripcion,
        metadata: input.metadata,
        // Solo tarjeta: el formulario de la app son los tres campos de tarjeta de Stripe (sin redirecciones ni billeteras).
        payment_method_types: ['card'],
      },
      { idempotencyKey: input.claveIdempotencia },
    );
  }

  obtenerIntento(idIntento: string): Promise<IntentoStripe> {
    return this.exigir().paymentIntents.retrieve(idIntento);
  }

  cancelarIntento(idIntento: string): Promise<IntentoStripe> {
    return this.exigir().paymentIntents.cancel(idIntento);
  }

  /** Verifica la firma del webhook con el cuerpo original y devuelve el evento; lanza si la firma no coincide. */
  construirEvento(cuerpoCrudo: Buffer, firma: string): EventoStripe {
    if (!this.config.webhookSecret) {
      throw new ServiceUnavailableException('Falta STRIPE_WEBHOOK_SECRET: no se puede verificar el webhook.');
    }
    return this.exigir().webhooks.constructEvent(cuerpoCrudo, firma, this.config.webhookSecret);
  }
}
