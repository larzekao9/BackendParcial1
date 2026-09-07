import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Pelicula } from './pelicula.entity.js';
import { Sala } from './sala.entity.js';
import { Precio } from './precio.entity.js';

export type EstadoFuncion = 'programada' | 'cancelada';

/**
 * Mapea la tabla `funciones` (CU04, RF07). Dominio de Luis Blanco.
 *
 * OJO: la columna `rango_ocupado` (tsrange) la calcula el trigger
 * `calcular_rango_ocupado()` y el anti-solapamiento lo hace el constraint
 * `EXCLUDE USING gist` — ambos definidos en base_datos_cine_ia.sql.
 * A propósito NO se mapea acá: nunca se escribe desde la aplicación, y
 * TypeORM no tiene un tipo nativo cómodo para `tsrange`. Si el servicio
 * necesita leerla, se hace con una query raw, no agregando la columna aquí.
 * El error de solapamiento (SQLSTATE 23P01) se captura en el filtro global
 * de excepciones y se traduce a 409 — ver funciones.service.ts (Fase 1).
 *
 * `onDelete: 'NO ACTION'` en las tres relaciones: es el default real de
 * Postgres, `base_datos_cine_ia.sql` no declara `ON DELETE` en ninguna FK
 * de esta tabla (ver docs/db-schema-notes.md, entrada "Discrepancia
 * onDelete", 2026-09-07). Para `pelicula`/`sala` no cambia nada (se
 * comporta igual que el `RESTRICT` que decía antes este comentario). Para
 * `precio` SÍ importa: **no es `SET NULL`** — si se borra un `Precio`
 * referenciado por `id_precio`, Postgres RECHAZA el borrado (23503), no lo
 * desvincula solo. `PreciosService.eliminar` ya fue corregido para chequear
 * esto antes de borrar (ver ese archivo).
 */
@Entity('funciones')
export class Funcion {
  @PrimaryGeneratedColumn({ name: 'id_funcion' })
  idFuncion!: number;

  @Column({ name: 'id_pelicula', type: 'int' })
  idPelicula!: number;

  @ManyToOne(() => Pelicula, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_pelicula' })
  pelicula?: Pelicula;

  @Column({ name: 'id_sala', type: 'int' })
  idSala!: number;

  @ManyToOne(() => Sala, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_sala' })
  sala?: Sala;

  @Column({ name: 'id_precio', type: 'int', nullable: true })
  idPrecio!: number | null;

  @ManyToOne(() => Precio, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_precio' })
  precio?: Precio;

  @Column({ type: 'date' })
  fecha!: string;

  @Column({ name: 'hora_inicio', type: 'time' })
  horaInicio!: string;

  @Column({ name: 'hora_fin', type: 'time' })
  horaFin!: string;

  @Column({ name: 'tiempo_limpieza_min', type: 'int', nullable: true })
  tiempoLimpiezaMin!: number | null;

  @Column({ type: 'varchar', length: 20, default: 'programada' })
  estado!: EstadoFuncion;
}
