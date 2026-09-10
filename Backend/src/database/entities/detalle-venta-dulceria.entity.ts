import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Venta } from './venta.entity.js';
import { ProductoDulceria } from './producto-dulceria.entity.js';

/**
 * Mapea la tabla `detalle_venta_dulceria` (CU09/RF20). Dominio de Luis
 * Blanco: `VentasService` la usa para agregar dulcería al carrito de una
 * venta dentro de la MISMA transacción de `VentasService.crear` — no hay
 * endpoint de venta de dulcería separado (ver plan-backend.md, sección
 * "Luis Ángel — Catálogo y configuración" y el flujo de `ventas`). Esta
 * clase es SOLO la entidad: Luis Ángel no construye módulo/service/
 * controller propio para ella, solo el catálogo (`categorias_dulceria` +
 * `productos_dulceria`, ver dulceria.service.ts).
 *
 * `onDelete: 'NO ACTION'` en las dos relaciones: mismo default real de
 * Postgres que el resto del esquema — `base_datos_cine_ia_completa.sql` no
 * declara `ON DELETE` en ninguna FK (ver docs/db-schema-notes.md, entrada
 * "Discrepancia onDelete", 2026-09-07). Si `VentasService` necesita borrar
 * una `Venta` que ya tiene detalle de dulcería, Postgres rechaza el borrado
 * (23503) — hay que limpiar el detalle primero en una transacción, mismo
 * patrón que `detalle_venta_entradas` (ver ese archivo).
 */
@Entity('detalle_venta_dulceria')
export class DetalleVentaDulceria {
  @PrimaryGeneratedColumn({ name: 'id_detalle' })
  idDetalle!: number;

  @Column({ name: 'id_venta', type: 'int' })
  idVenta!: number;

  @ManyToOne(() => Venta, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_venta' })
  venta?: Venta;

  @Column({ name: 'id_producto', type: 'int' })
  idProducto!: number;

  @ManyToOne(() => ProductoDulceria, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_producto' })
  producto?: ProductoDulceria;

  @Column({ type: 'int', default: 1 })
  cantidad!: number;

  @Column({ name: 'precio_unitario', type: 'numeric', precision: 10, scale: 2 })
  precioUnitario!: string;
}
