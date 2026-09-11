import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Usuario } from './usuario.entity.js';

/**
 * Mapea la tabla `log_acciones` (RF12). Dominio de Roly.
 * Es de solo inserción — nunca se actualiza ni se borra una fila.
 *
 * `onDelete: 'NO ACTION'` es el default real de Postgres para esta FK
 * (sin cambio de comportamiento respecto al `RESTRICT` que decía antes
 * este comentario — ver docs/db-schema-notes.md, entrada "Discrepancia
 * onDelete", 2026-09-07).
 */
@Entity('log_acciones')
export class LogAccion {
  @PrimaryGeneratedColumn({ name: 'id_log' })
  idLog!: number;

  @Column({ name: 'id_usuario', type: 'int' })
  idUsuario!: number;

  @ManyToOne(() => Usuario, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_usuario' })
  usuario?: Usuario;

  @Column({ type: 'text' })
  accion!: string;

  @Column({ name: 'fecha_hora', type: 'timestamp', default: () => 'NOW()' })
  fechaHora!: Date;

  @Column({ name: 'nivel_despliegue', type: 'varchar', length: 30, nullable: true })
  nivelDespliegue!: string | null;

  @Column({ name: 'ip_origen', type: 'varchar', length: 45, nullable: true })
  ipOrigen!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;
}

