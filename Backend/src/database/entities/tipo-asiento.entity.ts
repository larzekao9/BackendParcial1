import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type NombreTipoAsiento = 'normal' | 'preferencial' | 'VIP';

/**
 * Mapea la tabla `tipos_asiento` — catálogo compartido por `asientos` y
 * `precios` desde la migración que normalizó ambas tablas a una FK
 * `id_tipo_asiento` (ver docs/db-schema-notes.md, entrada "Normalización
 * tipos_asiento"). Sembrada una sola vez por
 * base_datos_cine_ia_completa.sql con 'normal', 'preferencial', 'VIP' — en
 * la práctica es de solo lectura para el resto del equipo.
 */
@Entity('tipos_asiento')
export class TipoAsiento {
  @PrimaryGeneratedColumn({ name: 'id_tipo_asiento' })
  idTipoAsiento!: number;

  @Column({ type: 'varchar', length: 20, unique: true })
  nombre!: NombreTipoAsiento;
}
