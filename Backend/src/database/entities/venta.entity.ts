import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Usuario } from './usuario.entity.js';
import { Funcion } from './funcion.entity.js';
import { Promocion } from './promocion.entity.js';

export type TipoRegistroVenta = 'voz' | 'manual';

export type EstadoVenta =
  | 'pendiente'
  | 'confirmada'
  | 'pendiente_pago'
  | 'pagada'
  | 'anulada'
  | 'cancelada';

/** Mismo dominio que `pagos.metodo_pago` — `stripe`/`qr` reservados para más adelante. */
export type MetodoPago = 'stripe' | 'qr' | 'efectivo' | 'tarjeta';

/**
 * Mapea la tabla `ventas` (CU02). Dominio de Luis Blanco.
 *
 * `estado`: se agrega esta columna (2026-09-10) — ya existía en
 * `base_datos_cine_ia_completa.sql` (CHECK con los 6 valores de arriba, default
 * 'pendiente') pero no estaba mapeada. `VentasService.crear` la fija en
 * `'pendiente_pago'` al insertar (ver plan-backend.md: "la venta ya queda modelada con
 * `estado='pendiente_pago'` independientemente de qué tan completo esté el módulo de
 * pagos"). `metodo_pago_elegido`, `fecha_pago`, `id_pago_activo` se agregan acá
 * (2026-09-10) junto con el módulo `pagos`: `PagosService.crear` las fija al confirmar
 * el cobro, pasando `estado` a `'pagada'` — ver pagos.service.ts.
 *
 * `confirmacionNoReembolso` (RF03) y `confirmacionVerbalCheck` (RF19) son
 * NOT NULL DEFAULT false en la base — la regla de negocio de que una venta
 * no puede crearse sin ambos flags en `true` (y el segundo obligatorio
 * cuando `tipoRegistro === 'voz'`) se aplica en VentasService, nunca se
 * relaja acá ni en la base.
 *
 * `onDelete: 'NO ACTION'` en las tres relaciones: default real de
 * Postgres, `base_datos_cine_ia.sql` no declara `ON DELETE` en ninguna FK
 * de esta tabla (ver docs/db-schema-notes.md, entrada "Discrepancia
 * onDelete", 2026-09-07). OJO especialmente con `usuarioCliente` y
 * `promocion`: **no son `SET NULL`** — borrar un `Usuario` o una
 * `Promocion` referenciada por una venta existente hace que Postgres
 * rechace el borrado (23503), no desvincula solo.
 * `PromocionesService.eliminar` ya chequea esto (rechaza con 409 si hay
 * ventas asociadas, ver ese archivo). `UsuariosService` (Roly, todavía sin
 * construir) va a necesitar el mismo chequeo cuando exista.
 */
@Entity('ventas')
export class Venta {
  @PrimaryGeneratedColumn({ name: 'id_venta' })
  idVenta!: number;

  @Column({ name: 'id_usuario_cliente', type: 'int', nullable: true })
  idUsuarioCliente!: number | null;

  @ManyToOne(() => Usuario, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_usuario_cliente' })
  usuarioCliente?: Usuario;

  @Column({ name: 'id_funcion', type: 'int' })
  idFuncion!: number;

  @ManyToOne(() => Funcion, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_funcion' })
  funcion?: Funcion;

  @Column({ name: 'id_promocion', type: 'int', nullable: true })
  idPromocion!: number | null;

  @ManyToOne(() => Promocion, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'id_promocion' })
  promocion?: Promocion;

  @Column({ name: 'fecha_hora', type: 'timestamp', default: () => 'NOW()' })
  fechaHora!: Date;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  subtotal!: string;

  @Column({
    name: 'descuento_aplicado',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
  })
  descuentoAplicado!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  total!: string;

  @Column({ name: 'confirmacion_no_reembolso', type: 'boolean', default: false })
  confirmacionNoReembolso!: boolean;

  @Column({ name: 'confirmacion_verbal_check', type: 'boolean', default: false })
  confirmacionVerbalCheck!: boolean;

  @Column({
    name: 'tipo_registro',
    type: 'varchar',
    length: 30,
    default: 'voz',
  })
  tipoRegistro!: TipoRegistroVenta;

  @Column({
    type: 'varchar',
    length: 30,
    default: 'pendiente',
  })
  estado!: EstadoVenta;

  @Column({ name: 'metodo_pago_elegido', type: 'varchar', length: 30, nullable: true })
  metodoPagoElegido!: MetodoPago | null;

  @Column({ name: 'fecha_pago', type: 'timestamp', nullable: true })
  fechaPago!: Date | null;

  @Column({ name: 'id_pago_activo', type: 'int', nullable: true })
  idPagoActivo!: number | null;
}
