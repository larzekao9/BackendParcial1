import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type Rol = 'cliente' | 'administrador';

/**
 * Mapea 1:1 la tabla `usuarios` de base_datos_cine_ia_completa.sql.
 * Login simplificado (nombre+rol) — ver docs/contratos-servicios.md — y
 * login con Google — ver docs/db-schema-notes.md, "Login con Google"
 * (2026-09-08) — coexisten; ninguno usa contraseña.
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

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ name: 'google_id', type: 'varchar', length: 255, nullable: true })
  googleId!: string | null;

  @Column({
    name: 'fecha_registro',
    type: 'timestamp',
    default: () => 'NOW()',
  })
  fechaRegistro!: Date;
}
