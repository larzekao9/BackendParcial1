import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CategoriaDulceria } from './categoria-dulceria.entity.js';

export type TipoProductoDulceria = 'individual' | 'combo';

/**
 * Mapea la tabla `productos_dulceria` (CU09/RF20). Dominio de Luis Ángel.
 *
 * `onDelete: 'NO ACTION'`: mismo default real de Postgres que el resto del
 * esquema — `base_datos_cine_ia_completa.sql` no declara `ON DELETE` en
 * ninguna FK (ver docs/db-schema-notes.md, entrada "Discrepancia onDelete",
 * 2026-09-07). Borrar una `CategoriaDulceria` referenciada por un producto
 * existente hace que Postgres RECHACE el borrado (23503), no lo
 * desvincula solo — `DulceriaService.eliminarCategoria` ya chequea esto
 * antes de intentar el DELETE (ver dulceria.service.ts).
 *
 * `disponible`: por eso existe la columna — `DulceriaService.eliminarProducto`
 * es un soft delete que la pone en `false` en vez de un DELETE físico (ver
 * comentario de ese método).
 */
@Entity('productos_dulceria')
export class ProductoDulceria {
  @PrimaryGeneratedColumn({ name: 'id_producto' })
  idProducto!: number;

  @Column({ name: 'id_categoria', type: 'int' })
  idCategoria!: number;

  @ManyToOne(() => CategoriaDulceria, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_categoria' })
  categoria?: CategoriaDulceria;

  @Column({ type: 'varchar', length: 120 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Column({ name: 'precio_base', type: 'numeric', precision: 10, scale: 2 })
  precioBase!: string;

  @Column({ type: 'varchar', length: 20, default: 'individual' })
  tipo!: TipoProductoDulceria;

  @Column({ type: 'varchar', length: 40, nullable: true })
  etiqueta!: string | null;

  @Column({ type: 'boolean', default: true })
  disponible!: boolean;
}
