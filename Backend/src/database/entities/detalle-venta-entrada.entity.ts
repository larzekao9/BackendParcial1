import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Venta } from './venta.entity.js';
import { Asiento } from './asiento.entity.js';

/**
 * Mapea la tabla `detalle_venta_entradas`. Dominio de Luis Blanco.
 *
 * OJO para quien construya `VentasService`: `base_datos_cine_ia.sql` NO
 * declara `ON DELETE` en ninguna FK de esta tabla, así que Postgres usa
 * `NO ACTION` en las dos — NO `CASCADE` hacia `venta` como sugería una
 * versión anterior de este comentario (ver docs/db-schema-notes.md,
 * entrada "Discrepancia onDelete", 2026-09-07). Si en algún momento hace
 * falta borrar una `Venta` que ya tiene `detalle_venta_entradas`, Postgres
 * va a RECHAZAR el borrado (23503), no va a limpiar las filas de detalle
 * solo. Si ese caso de uso existe, hay que borrar el detalle primero en una
 * transacción (mismo patrón que `PromocionesService.eliminar`), no confiar
 * en cascada automática.
 */
@Entity('detalle_venta_entradas')
export class DetalleVentaEntrada {
  @PrimaryGeneratedColumn({ name: 'id_detalle' })
  idDetalle!: number;

  @Column({ name: 'id_venta', type: 'int' })
  idVenta!: number;

  @ManyToOne(() => Venta, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_venta' })
  venta?: Venta;

  @Column({ name: 'id_asiento', type: 'int' })
  idAsiento!: number;

  @ManyToOne(() => Asiento, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_asiento' })
  asiento?: Asiento;

  @Column({ name: 'precio_unitario', type: 'numeric', precision: 10, scale: 2 })
  precioUnitario!: string;
}
