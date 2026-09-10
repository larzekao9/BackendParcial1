import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Sala } from './sala.entity.js';

/**
 * Mapea la tabla `asientos`. Dominio de Luis Ángel.
 *
 * CORRECCIÓN (2026-09-10): se retira `id_tipo_asiento` — dentro de una
 * misma sala todos los asientos son físicamente iguales (no se vende un
 * asiento VIP suelto en una sala normal); la diferenciación real de
 * precio/formato es por SALA (`salas.tipo`: 2D/3D/VIP), no por butaca. Ver
 * docs/db-schema-notes.md, entrada "Reversión: tipo de asiento por sala,
 * no por butaca".
 *
 * `onDelete: 'NO ACTION'` es el default real de Postgres para esta FK
 * (`base_datos_cine_ia_completa.sql` no declara `ON DELETE`) — ver
 * docs/db-schema-notes.md, entrada "Discrepancia onDelete" (2026-09-07).
 * Se comporta igual que `RESTRICT` para un DELETE simple (bloquea si hay
 * asientos asociados a la sala), así que no cambia ninguna lógica ya
 * escrita en `SalasService`.
 */
@Entity('asientos')
@Index(['idSala', 'fila', 'numero'], { unique: true })
export class Asiento {
  @PrimaryGeneratedColumn({ name: 'id_asiento' })
  idAsiento!: number;

  @Column({ name: 'id_sala', type: 'int' })
  idSala!: number;

  @ManyToOne(() => Sala, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_sala' })
  sala?: Sala;

  @Column({ type: 'varchar', length: 5 })
  fila!: string;

  @Column({ type: 'int' })
  numero!: number;
}
