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
 */
@Entity('log_acciones')
export class LogAccion {
  @PrimaryGeneratedColumn({ name: 'id_log' })
  idLog!: number;

  @Column({ name: 'id_usuario', type: 'int' })
  idUsuario!: number;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_usuario' })
  usuario?: Usuario;

  @Column({ type: 'text' })
  accion!: string;

  @Column({ name: 'fecha_hora', type: 'timestamp', default: () => 'NOW()' })
  fechaHora!: Date;

  @Column({ name: 'nivel_despliegue', type: 'varchar', length: 30, nullable: true })
  nivelDespliegue!: string | null;
}
