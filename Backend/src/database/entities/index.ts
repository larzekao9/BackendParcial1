import { Usuario } from './usuario.entity.js';
import { Pelicula } from './pelicula.entity.js';
import { Sala } from './sala.entity.js';
import { Asiento } from './asiento.entity.js';
import { Precio } from './precio.entity.js';
import { Funcion } from './funcion.entity.js';
import { DisponibilidadAsiento } from './disponibilidad-asiento.entity.js';
import { Promocion } from './promocion.entity.js';
import { PromocionFuncion } from './promocion-funcion.entity.js';
import { Venta } from './venta.entity.js';
import { DetalleVentaEntrada } from './detalle-venta-entrada.entity.js';
import { Pago } from './pago.entity.js';
import { LogAccion } from './log-accion.entity.js';
import { InteraccionIA } from './interaccion-ia.entity.js';
import { CategoriaDulceria } from './categoria-dulceria.entity.js';
import { ProductoDulceria } from './producto-dulceria.entity.js';
import { DetalleVentaDulceria } from './detalle-venta-dulceria.entity.js';

export {
  Usuario,
  Pelicula,
  Sala,
  Asiento,
  Precio,
  Funcion,
  DisponibilidadAsiento,
  Promocion,
  PromocionFuncion,
  Venta,
  DetalleVentaEntrada,
  Pago,
  LogAccion,
  InteraccionIA,
  CategoriaDulceria,
  ProductoDulceria,
  DetalleVentaDulceria,
};

/** Lista completa de entidades — usada por TypeOrmModule.forRootAsync. */
export const ENTITIES = [
  Usuario,
  Pelicula,
  Sala,
  Asiento,
  Precio,
  Funcion,
  DisponibilidadAsiento,
  Promocion,
  PromocionFuncion,
  Venta,
  DetalleVentaEntrada,
  Pago,
  LogAccion,
  InteraccionIA,
  CategoriaDulceria,
  ProductoDulceria,
  DetalleVentaDulceria,
];
