import {
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Promocion } from './promocion.entity.js';
import { Funcion } from './funcion.entity.js';

/** Mapea la tabla `promocion_funcion` (N:M). Dominio de Luisa Ángel. */
@Entity('promocion_funcion')
export class PromocionFuncion {
  @PrimaryColumn({ name: 'id_promocion', type: 'int' })
  idPromocion!: number;

  @ManyToOne(() => Promocion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_promocion' })
  promocion?: Promocion;

  @PrimaryColumn({ name: 'id_funcion', type: 'int' })
  idFuncion!: number;

  @ManyToOne(() => Funcion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_funcion' })
  funcion?: Funcion;
}
