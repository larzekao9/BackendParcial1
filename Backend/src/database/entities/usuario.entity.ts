import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type Rol = 'cliente' | 'administrador';

/**
 * Mapea 1:1 la tabla `usuarios` de base_datos_cine_ia.sql.
 * No tiene columna de contraseña — ver docs/contratos-servicios.md
 * para la decisión de autenticación simplificada tomada en la Fase 0.
 */
@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn({ name: 'id_usuario' })
  idUsuario!: number;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'varchar', length: 20 })
  rol!: Rol;

  @Column({ name: 'metodo_auth', type: 'varchar', length: 50, nullable: true })
  metodoAuth!: string | null;

  @Column({
    name: 'fecha_registro',
    type: 'timestamp',
    default: () => 'NOW()',
  })
  fechaRegistro!: Date;
}
