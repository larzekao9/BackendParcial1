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
 */
@Entity('disponibilidad_asiento')
export class DisponibilidadAsiento {
  @PrimaryColumn({ name: 'id_funcion', type: 'int' })
  idFuncion!: number;

  @ManyToOne(() => Funcion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_funcion' })
  funcion?: Funcion;

  @PrimaryColumn({ name: 'id_asiento', type: 'int' })
  idAsiento!: number;

  @ManyToOne(() => Asiento, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_asiento' })
  asiento?: Asiento;

  @Column({ type: 'varchar', length: 20, default: 'disponible' })
  estado!: EstadoDisponibilidad;
}
