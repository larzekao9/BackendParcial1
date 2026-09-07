import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Usuario } from './usuario.entity.js';
import { Funcion } from './funcion.entity.js';

/**
 * Mapea la tabla `interacciones_ia` (CU08, RF18). Dominio de Roly —
 * la escribe el backend vía POST /interacciones cuando `ai-service`
 * reporta una interacción, para mantener una sola fuente de escritura.
 */
@Entity('interacciones_ia')
export class InteraccionIA {
  @PrimaryGeneratedColumn({ name: 'id_interaccion' })
  idInteraccion!: number;

  @Column({ name: 'id_usuario', type: 'int' })
  idUsuario!: number;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_usuario' })
  usuario?: Usuario;

  @Column({ name: 'id_funcion', type: 'int', nullable: true })
  idFuncion!: number | null;

  @ManyToOne(() => Funcion, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'id_funcion' })
  funcion?: Funcion;

  @Column({ name: 'intencion_detectada', type: 'varchar', length: 100 })
  intencionDetectada!: string;

  @Column({ name: 'widget_generado', type: 'varchar', length: 50, nullable: true })
  widgetGenerado!: string | null;

  @Column({ name: 'texto_transcrito', type: 'text', nullable: true })
  textoTranscrito!: string | null;

  @Column({ name: 'fecha_hora', type: 'timestamp', default: () => 'NOW()' })
  fechaHora!: Date;
}
