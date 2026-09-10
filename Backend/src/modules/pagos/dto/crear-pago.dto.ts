import { IsIn, IsInt, IsPositive } from 'class-validator';
import type { MetodoPago } from '../../../database/entities/venta.entity.js';

export class CrearPagoDto {
  @IsInt()
  @IsPositive()
  idVenta!: number;

  /** `stripe`/`qr` se aceptan acá para el CHECK de la base, pero PagosService.crear los rechaza (400) hasta implementarlos. */
  @IsIn(['stripe', 'qr', 'efectivo', 'tarjeta'])
  metodo!: MetodoPago;
}
