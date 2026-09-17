import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  ArrayMinSize,
  Min,
  ValidateNested,
} from 'class-validator';
import type { TipoRegistroVenta } from '../../../database/entities/venta.entity.js';

/**
 * Item de dulcería dentro del carrito de una venta (CU09/RF20). Mismo carrito que las
 * entradas — no hay endpoint de venta de dulcería separado, ver plan-backend.md.
 */
export class ItemDulceriaDto {
  @IsInt()
  @IsPositive()
  idProducto!: number;

  @IsInt()
  @Min(1)
  cantidad!: number;
}

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

  /** Opcional — venta sin dulcería si se omite o viene vacío. */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ItemDulceriaDto)
  dulceria?: ItemDulceriaDto[];
}
