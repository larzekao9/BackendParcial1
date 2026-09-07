import {
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Promocion } from './promocion.entity.js';
import { Funcion } from './funcion.entity.js';

/**
 * Mapea la tabla `promocion_funcion` (N:M). Dominio de Luis Ángel.
 *
 * `onDelete: 'NO ACTION'` en ambas relaciones: es el comportamiento REAL
 * verificado contra Postgres (`pg_constraint.confdeltype = 'a'`) —
 * `base_datos_cine_ia.sql` define estas FK con `REFERENCES` simple, sin
 * cláusula `ON DELETE`, así que Postgres usa su default (`NO ACTION`), NO
 * `CASCADE`. Ver la entrada "Discrepancia onDelete" en
 * `docs/db-schema-notes.md` (2026-09-07) para el detalle completo y por qué
 * importa: `PromocionesService.eliminar()` ya compensa esto borrando las
 * filas de `promocion_funcion` dentro de una transacción antes de borrar la
 * `Promocion`, en vez de confiar en que Postgres cascadee solo.
 */
@Entity('promocion_funcion')
export class PromocionFuncion {
  @PrimaryColumn({ name: 'id_promocion', type: 'int' })
  idPromocion!: number;

  @ManyToOne(() => Promocion, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_promocion' })
  promocion?: Promocion;

  @PrimaryColumn({ name: 'id_funcion', type: 'int' })
  idFuncion!: number;

  @ManyToOne(() => Funcion, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_funcion' })
  funcion?: Funcion;
}
