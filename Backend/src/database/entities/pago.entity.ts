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
 * Solo se mapean acá las columnas que usa el alcance actual (pago controlado
 * efectivo/tarjeta, ver pagos.service.ts) — `stripe_*`, `qr_*`, `metadata` y las de
 * auditoría (`ip_origen`, `user_agent`, `nivel_despliegue`) ya existen en
 * `base_datos_cine_ia_completa.sql` pero quedan sin mapear hasta que se implemente
 * Stripe/QR real.
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

  @Column({ name: 'fecha_confirmacion', type: 'timestamp', nullable: true })
  fechaConfirmacion!: Date | null;
}
