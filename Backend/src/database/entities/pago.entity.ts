import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Venta } from './venta.entity.js';
import type { MetodoPago } from './venta.entity.js';

export type EstadoPago =
  | 'pendiente'
  | 'procesando'
  | 'exitoso'
  | 'fallido'
  | 'reembolsado'
  | 'cancelado';

/**
 * Mapea la tabla `pagos` (RF04). Dominio de Luis Blanco.
 *
 * Se mapean las columnas que usa el alcance actual: pago controlado efectivo/tarjeta física y
 * Stripe (`stripe_payment_intent_id`, `stripe_charge_id`, `fecha_procesamiento`, `metadata`;
 * `stripe_client_secret` NO se guarda: Stripe lo devuelve cuando se lo pide y no conviene tenerlo
 * en la base). `qr_*` y las de auditoría (`ip_origen`, `user_agent`, `nivel_despliegue`) siguen sin
 * mapear: el QR quedó fuera de alcance.
 */
@Entity('pagos')
export class Pago {
  @PrimaryGeneratedColumn({ name: 'id_pago' })
  idPago!: number;

  @Column({ name: 'id_venta', type: 'int' })
  idVenta!: number;

  @ManyToOne(() => Venta, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_venta' })
  venta?: Venta;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  monto!: string;

  @Column({ type: 'varchar', length: 3, default: 'BOB' })
  moneda!: string;

  @Column({ name: 'metodo_pago', type: 'varchar', length: 30 })
  metodoPago!: MetodoPago;

  @Column({ type: 'varchar', length: 30, default: 'pendiente' })
  estado!: EstadoPago;

  @Column({ name: 'fecha_creacion', type: 'timestamp', default: () => 'NOW()' })
  fechaCreacion!: Date;

  @Column({ name: 'fecha_procesamiento', type: 'timestamp', nullable: true })
  fechaProcesamiento!: Date | null;

  @Column({ name: 'fecha_confirmacion', type: 'timestamp', nullable: true })
  fechaConfirmacion!: Date | null;

  /** PaymentIntent de Stripe de este intento (único en la base). Solo para `metodoPago = 'stripe'`. */
  @Column({ name: 'stripe_payment_intent_id', type: 'varchar', length: 100, nullable: true })
  stripePaymentIntentId!: string | null;

  @Column({ name: 'stripe_charge_id', type: 'varchar', length: 100, nullable: true })
  stripeChargeId!: string | null;

  /** Datos del intento que conviene conservar (motivo del rechazo, conversión de moneda, etc.). */
  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;
}
