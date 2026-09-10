import {
  ArrayNotEmpty,
  ArrayUnique,
  IsBoolean,
  IsIn,
  IsInt,
  IsPositive,
  ArrayMinSize,
} from 'class-validator';
import type { TipoRegistroVenta } from '../../../database/entities/venta.entity.js';

export class CrearVentaDto {
  @IsInt()
  @IsPositive()
  idFuncion!: number;

  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  idAsientos!: number[];

  @IsIn(['voz', 'manual'])
  tipoRegistro!: TipoRegistroVenta;

  /** RF03 — obligatorio en true para que la venta pueda crearse. */
  @IsBoolean()
  confirmacionNoReembolso!: boolean;

  /** RF19 — obligatorio en true cuando tipoRegistro === 'voz'. */
  @IsBoolean()
  confirmacionVerbalCheck!: boolean;
}
