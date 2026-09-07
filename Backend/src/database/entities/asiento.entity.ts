import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Sala } from './sala.entity.js';

export type TipoAsiento = 'normal' | 'preferencial';

/**
 * Mapea la tabla `asientos`. Dominio de Luis Ángel.
 *
 * `onDelete: 'NO ACTION'` es el default real de Postgres para esta FK
 * (`base_datos_cine_ia.sql` no declara `ON DELETE`) — ver
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

  @Column({ type: 'varchar', length: 20, default: 'normal' })
  tipo!: TipoAsiento;
}
