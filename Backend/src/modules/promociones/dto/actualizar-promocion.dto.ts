import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * A diferencia de `precios` (donde `PartialType(CrearPrecioDto)` alcanza
 * solo), acá el PATCH necesita un campo extra que NO existe en
 * `CrearPromocionDto`: `activa`, para poder desactivar una promoción sin
 * borrarla (soft toggle, distinto del DELETE físico de `eliminar`). Como
 * `PartialType` solo puede volver opcionales los campos ya declarados en
 * la clase base, esta clase se arma a mano en vez de heredar con
 * `PartialType`, repitiendo los mismos validadores que
 * `CrearPromocionDto` pero todos opcionales, más `activa`.
 */
export class ActualizarPromocionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsIn(['porcentaje', 'monto_fijo'])
  tipoDescuento?: 'porcentaje' | 'monto_fijo';

  @IsOptional()
  @IsNumber()
  @IsPositive()
  valor?: number;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
