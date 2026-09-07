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
 *
 * `onDelete: 'NO ACTION'` en ambas relaciones: default real de Postgres,
 * `base_datos_cine_ia.sql` no declara `ON DELETE` (ver
 * docs/db-schema-notes.md, entrada "Discrepancia onDelete", 2026-09-07).
 * OJO especialmente con `funcion`: **no es `SET NULL`** — borrar una
 * `Funcion` referenciada acá haría que Postgres rechace el borrado (23503)
 * en vez de desvincular solo. Si `ia-gateway` alguna vez necesita borrar
 * físicamente una función con interacciones asociadas, hay que limpiar (o
 * desvincular) estas filas primero en una transacción.
 */
@Entity('interacciones_ia')
export class InteraccionIA {
  @PrimaryGeneratedColumn({ name: 'id_interaccion' })
  idInteraccion!: number;

  @Column({ name: 'id_usuario', type: 'int' })
  idUsuario!: number;

  @ManyToOne(() => Usuario, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_usuario' })
  usuario?: Usuario;

  @Column({ name: 'id_funcion', type: 'int', nullable: true })
  idFuncion!: number | null;

  @ManyToOne(() => Funcion, { onDelete: 'NO ACTION' })
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
