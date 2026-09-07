import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type EstadoPelicula = 'activa' | 'inactiva';

/** Mapea la tabla `peliculas`. Dominio de Luis Ángel (CU03). */
@Entity('peliculas')
export class Pelicula {
  @PrimaryGeneratedColumn({ name: 'id_pelicula' })
  idPelicula!: number;

  @Column({ type: 'varchar', length: 200 })
  titulo!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  genero!: string | null;

  @Column({ name: 'duracion_min', type: 'int' })
  duracionMin!: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  clasificacion!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'activa' })
  estado!: EstadoPelicula;
}
