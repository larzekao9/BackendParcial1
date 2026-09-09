import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Sala } from './sala.entity.js';
import { TipoAsiento } from './tipo-asiento.entity.js';

/**
 * Mapea la tabla `asientos`. Dominio de Luis Ángel.
 *
 * CORRECCIÓN (2026-09-07): esta entidad tenía una columna `tipo` (varchar)
 * que mapeaba el esquema previo a la normalización de `tipos_asiento` — esa
 * columna ya no existe en la base real (`base_datos_cine_ia_completa.sql`),
 * se reemplaza por la FK `id_tipo_asiento`. Ver docs/db-schema-notes.md,
 * entrada "Normalización tipos_asiento".
 *
 * `onDelete: 'NO ACTION'` es el default real de Postgres para ambas FK
 * (`base_datos_cine_ia_completa.sql` no declara `ON DELETE`) — ver
 * docs/db-schema-notes.md, entrada "Discrepancia onDelete" (2026-09-07).
 * Se comporta igual que `RESTRICT` para un DELETE simple (bloquea si hay
 * asientos asociados a la sala/al tipo de asiento), así que no cambia
 * ninguna lógica ya escrita en `SalasService`.
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

  @Column({ name: 'id_tipo_asiento', type: 'int' })
  idTipoAsiento!: number;

  @ManyToOne(() => TipoAsiento, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_tipo_asiento' })
  tipoAsiento?: TipoAsiento;

  @Column({ type: 'varchar', length: 5 })
  fila!: string;

  @Column({ type: 'int' })
  numero!: number;
}
