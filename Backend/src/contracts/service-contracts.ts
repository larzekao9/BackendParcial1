import type { Pelicula } from '../database/entities/pelicula.entity.js';
import type { Precio } from '../database/entities/precio.entity.js';
import type { Promocion } from '../database/entities/promocion.entity.js';
import type { ProductoDulceria } from '../database/entities/producto-dulceria.entity.js';
import type { Funcion, EstadoFuncion } from '../database/entities/funcion.entity.js';
import type { Venta, TipoRegistroVenta, MetodoPago } from '../database/entities/venta.entity.js';

/**
 * Contrato de Fase 0 — acordado entre Luis Ángel, Luis Blanco y Roly antes
 * de separar el trabajo (ver docs/contratos-servicios.md). Cada interface
 * describe la firma mínima que el resto del equipo necesita para integrar
 * su módulo, SIN implementar el cuerpo: la implementación real es trabajo
 * de la Fase 1 de quien tiene asignado ese dominio.
 *
 * Regla del contrato: quien implemente el service correspondiente
 * (`PeliculasService`, `FuncionesService`, `PreciosService`,
 * `PromocionesService`, `VentasService`) lo hace `implements` esta
 * interface. Si necesita cambiar la firma, lo avisa al resto ANTES de
 * cambiarla — es lo que evita que `ia-gateway` (Roly, Fase 2) se rompa a
 * mitad de integración.
 */

// ---- Luis Ángel — catálogo y configuración -------------------------------

export interface CrearPeliculaInput {
  titulo: string;
  genero?: string | null;
  duracionMin: number;
  clasificacion?: string | null;
  /** URL de Cloudinary — ver "Poster real de películas" en docs/db-schema-notes.md (2026-09-10). */
  posterUrl?: string | null;
}

export interface PeliculasContract {
  crear(input: CrearPeliculaInput): Promise<Pelicula>;
  actualizar(idPelicula: number, input: Partial<CrearPeliculaInput>): Promise<Pelicula>;
  eliminar(idPelicula: number): Promise<void>;
  buscarPorId(idPelicula: number): Promise<Pelicula | null>;
  listar(): Promise<Pelicula[]>;
}

export interface PreciosContract {
  /**
   * Precio vigente para una fecha dada — ya no depende de un tipo de
   * asiento: el precio de una entrada cuelga de la función
   * (`funciones.id_precio`), no de la butaca individual (ver
   * docs/db-schema-notes.md, "Reversión: tipo de asiento por sala, no por
   * butaca"). Lo consume VentasService.
   */
  getVigente(fecha: Date): Promise<Precio>;
}

export interface PromocionesContract {
  /** Promoción activa aplicable a una función, o null si no hay ninguna. Lo consume VentasService. */
  getAplicable(idFuncion: number): Promise<Promocion | null>;
}

export interface ProductoDulceriaContract {
  /** Productos disponibles (activos) del menú, opcionalmente filtrados por categoría. Lo consume VentasService. */
  getDisponibles(idCategoria?: number): Promise<ProductoDulceria[]>;
}

// ---- Luis Blanco — funciones, ventas y reportes ---------------------------

export interface CrearFuncionInput {
  idPelicula: number;
  idSala: number;
  idPrecio?: number | null;
  fecha: string; // ISO date
  horaInicio: string; // HH:mm
  horaFin: string; // HH:mm
  tiempoLimpiezaMin?: number | null;
}

export interface FuncionesContract {
  /** Puede lanzar un conflicto de horario/sala (RF07) — mapeado a 409 por el filtro global. */
  crear(input: CrearFuncionInput): Promise<Funcion>;
  actualizar(idFuncion: number, input: Partial<CrearFuncionInput>): Promise<Funcion>;
  cancelar(idFuncion: number): Promise<Funcion>;
  buscarPorId(idFuncion: number): Promise<Funcion | null>;
}

export interface CrearVentaInput {
  idFuncion: number;
  idUsuarioCliente?: number | null;
  idAsientos: number[];
  tipoRegistro: TipoRegistroVenta;
  /** RF03 — obligatorio en true para que la venta pueda crearse. */
  confirmacionNoReembolso: boolean;
  /** RF19 — obligatorio en true cuando tipoRegistro === 'voz'. */
  confirmacionVerbalCheck: boolean;
}

export interface VentasContract {
  /**
   * Rechaza la creación (ver .claude/agents/backend-nestjs.md) si:
   *  - algún asiento no está 'disponible' para la función,
   *  - confirmacionNoReembolso no es true,
   *  - tipoRegistro === 'voz' y confirmacionVerbalCheck no es true.
   * Corre dentro de una transacción: valida disponibilidad, calcula precio
   * y descuento, marca asientos como 'ocupado', inserta venta + detalle.
   */
  crear(input: CrearVentaInput): Promise<Venta>;
}

export interface CrearPagoInput {
  idVenta: number;
  /** `stripe`/`qr` quedan rechazados por PagosService.crear hasta implementarlos (ver pagos.service.ts). */
  metodo: MetodoPago;
}

export interface PagosContract {
  /**
   * Pago controlado por el propio sistema (sin pasarela externa todavía) — RF04.
   * Rechaza con 404 si la venta no existe, 409 si `venta.estado !== 'pendiente_pago'`,
   * 400 si `metodo` no es `'efectivo'` ni `'tarjeta'`. Inserta un `Pago` en estado
   * `'exitoso'` y actualiza la venta a `estado='pagada'` dentro de una transacción.
   * Devuelve la Venta ya actualizada (no el Pago).
   */
  crear(input: CrearPagoInput): Promise<Venta>;
}

// ---- Roly — usado por ia-gateway para ejecutar acciones confirmadas ------

export type AccionGestion =
  | { tipo: 'crear_pelicula'; datos: CrearPeliculaInput }
  | { tipo: 'actualizar_pelicula'; idPelicula: number; datos: Partial<CrearPeliculaInput> }
  | { tipo: 'crear_funcion'; datos: CrearFuncionInput }
  | { tipo: 'cancelar_funcion'; idFuncion: number }
  | { tipo: 'crear_venta'; datos: CrearVentaInput };

export interface IaGatewayContract {
  /**
   * Único punto de entrada de `ai-service` para mutar datos (RF10).
   * Revalida server-side el rol y la evidencia de confirmación antes de
   * despachar a PeliculasService/FuncionesService/VentasService — nunca
   * confía en que la IA ya validó todo.
   */
  ejecutar(
    accion: AccionGestion,
    contexto: { idUsuario: number; rol: 'cliente' | 'administrador'; evidenciaConfirmacion: boolean; nivelDespliegue: string },
  ): Promise<{ ok: true; resultado: unknown } | { ok: false; motivo: string }>;
}

export type { EstadoFuncion };
