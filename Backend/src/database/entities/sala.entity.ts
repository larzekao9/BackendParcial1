import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Mapea la tabla `salas`. Dominio de Luis Ángel. */
@Entity('salas')
export class Sala {
  @PrimaryGeneratedColumn({ name: 'id_sala' })
  idSala!: number;

  @Column({ type: 'varchar', length: 50 })
  nombre!: string;

  @Column({ type: 'int' })
  capacidad!: number;

  @Column({ type: 'varchar', length: 30, nullable: true })
  tipo!: string | null;

  @Column({ name: 'tiempo_limpieza_min', type: 'int', default: 20 })
  tiempoLimpiezaMin!: number;
}
