import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Mapea la tabla `precios` (CU07). Dominio de Luis Ángel.
 *
 * CORRECCIÓN (2026-09-10): se retira `id_tipo_asiento` — el precio de una
 * entrada depende de la FUNCIÓN (`funciones.id_precio`, que ya trae
 * implícita la sala/formato), no de un tipo de asiento individual dentro
 * de la sala. Ver docs/db-schema-notes.md, entrada "Reversión: tipo de
 * asiento por sala, no por butaca".
 */
@Entity('precios')
export class Precio {
  @PrimaryGeneratedColumn({ name: 'id_precio' })
  idPrecio!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  valor!: string;

  @Column({ name: 'vigente_desde', type: 'date' })
  vigenteDesde!: string;

  @Column({ name: 'vigente_hasta', type: 'date', nullable: true })
  vigenteHasta!: string | null;
}
