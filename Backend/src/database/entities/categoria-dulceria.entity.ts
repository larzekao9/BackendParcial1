import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Mapea la tabla `categorias_dulceria` (CU09/RF20). Dominio de Luis Ángel. */
@Entity('categorias_dulceria')
export class CategoriaDulceria {
  @PrimaryGeneratedColumn({ name: 'id_categoria' })
  idCategoria!: number;

  @Column({ type: 'varchar', length: 60 })
  nombre!: string;

  @Column({ name: 'orden_visualizacion', type: 'int', default: 0 })
  ordenVisualizacion!: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  icono!: string | null;
}
