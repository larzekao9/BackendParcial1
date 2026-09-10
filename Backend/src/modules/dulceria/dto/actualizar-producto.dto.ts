import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Igual que `ActualizarPromocionDto`: acá el PATCH necesita un campo extra
 * que NO existe en `CrearProductoDto` — `disponible`, para poder desactivar
 * un producto sin borrarlo (soft toggle, mismo mecanismo que usa el DELETE
 * de `eliminarProducto`, que en el fondo es este mismo flag en `false`). Como
 * `PartialType` solo puede volver opcionales los campos ya declarados en la
 * clase base, esta clase se arma a mano en vez de heredar con `PartialType`,
 * repitiendo los mismos validadores que `CrearProductoDto` pero todos
 * opcionales, más `disponible`.
 */
export class ActualizarProductoDto {
  @IsOptional()
  @IsInt()
  idCategoria?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  precioBase?: number;

  @IsOptional()
  @IsIn(['individual', 'combo'])
  tipo?: 'individual' | 'combo';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  etiqueta?: string;

  @IsOptional()
  @IsBoolean()
  disponible?: boolean;
}
