import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type TipoDescuento = 'porcentaje' | 'monto_fijo';

/** Mapea la tabla `promociones` (CU06). Dominio de Luis Ángel. */
@Entity('promociones')
export class Promocion {
  @PrimaryGeneratedColumn({ name: 'id_promocion' })
  idPromocion!: number;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Column({ name: 'tipo_descuento', type: 'varchar', length: 20 })
  tipoDescuento!: TipoDescuento;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  valor!: string;

  @Column({ name: 'fecha_inicio', type: 'date' })
  fechaInicio!: string;

  @Column({ name: 'fecha_fin', type: 'date' })
  fechaFin!: string;

  @Column({ type: 'boolean', default: true })
  activa!: boolean;
}
