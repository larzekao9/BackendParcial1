import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TipoAsiento } from './tipo-asiento.entity.js';

/**
 * Mapea la tabla `precios` (CU07). Dominio de Luis Ángel.
 *
 * CORRECCIÓN (2026-09-07): tenía una columna `tipoAsiento` (varchar,
 * `tipo_asiento`) que mapeaba el esquema previo a la normalización de
 * `tipos_asiento` — esa columna ya no existe en la base real
 * (`base_datos_cine_ia_completa.sql`), se reemplaza por la FK
 * `id_tipo_asiento`. Ver docs/db-schema-notes.md, entrada "Normalización
 * tipos_asiento".
 */
@Entity('precios')
export class Precio {
  @PrimaryGeneratedColumn({ name: 'id_precio' })
  idPrecio!: number;

  @Column({ name: 'id_tipo_asiento', type: 'int' })
  idTipoAsiento!: number;

  @ManyToOne(() => TipoAsiento, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_tipo_asiento' })
  tipoAsiento?: TipoAsiento;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  valor!: string;

  @Column({ name: 'vigente_desde', type: 'date' })
  vigenteDesde!: string;

  @Column({ name: 'vigente_hasta', type: 'date', nullable: true })
  vigenteHasta!: string | null;
}
