import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Venta } from './venta.entity.js';
import { Asiento } from './asiento.entity.js';

/** Mapea la tabla `detalle_venta_entradas`. Dominio de Luis Blanco. */
@Entity('detalle_venta_entradas')
export class DetalleVentaEntrada {
  @PrimaryGeneratedColumn({ name: 'id_detalle' })
  idDetalle!: number;

  @Column({ name: 'id_venta', type: 'int' })
  idVenta!: number;

  @ManyToOne(() => Venta, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_venta' })
  venta?: Venta;

  @Column({ name: 'id_asiento', type: 'int' })
  idAsiento!: number;

  @ManyToOne(() => Asiento, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_asiento' })
  asiento?: Asiento;

  @Column({ name: 'precio_unitario', type: 'numeric', precision: 10, scale: 2 })
  precioUnitario!: string;
}
