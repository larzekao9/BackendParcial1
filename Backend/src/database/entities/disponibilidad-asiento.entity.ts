import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Funcion } from './funcion.entity.js';
import { Asiento } from './asiento.entity.js';

export type EstadoDisponibilidad = 'disponible' | 'ocupado';

/**
 * Mapea la tabla `disponibilidad_asiento` (N:M funciones↔asientos).
 * Dominio de Luis Blanco: se genera automáticamente al crear una función
 * (una fila 'disponible' por cada asiento de la sala) y se actualiza a
 * 'ocupado' dentro de la transacción de compra en `ventas`.
 *
 * OJO para `FuncionesService.cancelar`/`eliminar`: `base_datos_cine_ia.sql`
 * NO declara `ON DELETE` en la FK hacia `funciones`, así que Postgres usa
 * `NO ACTION` — NO `CASCADE` como sugería una versión anterior de este
 * comentario (ver docs/db-schema-notes.md, entrada "Discrepancia
 * onDelete", 2026-09-07). Cancelar una función normalmente alcanza con
 * `estado='cancelada'` (no un DELETE físico), pero si en algún momento se
 * necesita borrar una `Funcion` de verdad, hay que borrar primero sus filas
 * de `disponibilidad_asiento` en una transacción — Postgres no lo hace solo.
 */
@Entity('disponibilidad_asiento')
export class DisponibilidadAsiento {
  @PrimaryColumn({ name: 'id_funcion', type: 'int' })
  idFuncion!: number;

  @ManyToOne(() => Funcion, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_funcion' })
  funcion?: Funcion;

  @PrimaryColumn({ name: 'id_asiento', type: 'int' })
  idAsiento!: number;

  @ManyToOne(() => Asiento, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_asiento' })
  asiento?: Asiento;

  @Column({ type: 'varchar', length: 20, default: 'disponible' })
  estado!: EstadoDisponibilidad;
}
