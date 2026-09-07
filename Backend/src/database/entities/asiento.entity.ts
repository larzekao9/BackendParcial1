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

/** Mapea la tabla `asientos`. Dominio de Luisa Ángel. */
@Entity('asientos')
@Index(['idSala', 'fila', 'numero'], { unique: true })
export class Asiento {
  @PrimaryGeneratedColumn({ name: 'id_asiento' })
  idAsiento!: number;

  @Column({ name: 'id_sala', type: 'int' })
  idSala!: number;

  @ManyToOne(() => Sala, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_sala' })
  sala?: Sala;

  @Column({ type: 'varchar', length: 5 })
  fila!: string;

  @Column({ type: 'int' })
  numero!: number;

  @Column({ type: 'varchar', length: 20, default: 'normal' })
  tipo!: TipoAsiento;
}
