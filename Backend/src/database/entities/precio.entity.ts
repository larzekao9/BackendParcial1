import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TipoAsiento } from './asiento.entity.js';

/** Mapea la tabla `precios` (CU07). Dominio de Luisa Ángel. */
@Entity('precios')
export class Precio {
  @PrimaryGeneratedColumn({ name: 'id_precio' })
  idPrecio!: number;

  @Column({ name: 'tipo_asiento', type: 'varchar', length: 20 })
  tipoAsiento!: TipoAsiento | 'VIP';

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  valor!: string;

  @Column({ name: 'vigente_desde', type: 'date' })
  vigenteDesde!: string;

  @Column({ name: 'vigente_hasta', type: 'date', nullable: true })
  vigenteHasta!: string | null;
}
