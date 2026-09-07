import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Usuario } from './usuario.entity.js';
import { Funcion } from './funcion.entity.js';
import { Promocion } from './promocion.entity.js';

export type TipoRegistroVenta = 'voz' | 'manual';

/**
 * Mapea la tabla `ventas` (CU02). Dominio de Luis Blanco.
 *
 * `confirmacionNoReembolso` (RF03) y `confirmacionVerbalCheck` (RF19) son
 * NOT NULL DEFAULT false en la base — la regla de negocio de que una venta
 * no puede crearse sin ambos flags en `true` (y el segundo obligatorio
 * cuando `tipoRegistro === 'voz'`) se aplica en VentasService, nunca se
 * relaja acá ni en la base.
 */
@Entity('ventas')
export class Venta {
  @PrimaryGeneratedColumn({ name: 'id_venta' })
  idVenta!: number;

  @Column({ name: 'id_usuario_cliente', type: 'int', nullable: true })
  idUsuarioCliente!: number | null;

  @ManyToOne(() => Usuario, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'id_usuario_cliente' })
  usuarioCliente?: Usuario;

  @Column({ name: 'id_funcion', type: 'int' })
  idFuncion!: number;

  @ManyToOne(() => Funcion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_funcion' })
  funcion?: Funcion;

  @Column({ name: 'id_promocion', type: 'int', nullable: true })
  idPromocion!: number | null;

  @ManyToOne(() => Promocion, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'id_promocion' })
  promocion?: Promocion;

  @Column({ name: 'fecha_hora', type: 'timestamp', default: () => 'NOW()' })
  fechaHora!: Date;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  subtotal!: string;

  @Column({
    name: 'descuento_aplicado',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
  })
  descuentoAplicado!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  total!: string;

  @Column({ name: 'confirmacion_no_reembolso', type: 'boolean', default: false })
  confirmacionNoReembolso!: boolean;

  @Column({ name: 'confirmacion_verbal_check', type: 'boolean', default: false })
  confirmacionVerbalCheck!: boolean;

  @Column({
    name: 'tipo_registro',
    type: 'varchar',
    length: 30,
    default: 'voz',
  })
  tipoRegistro!: TipoRegistroVenta;
}
