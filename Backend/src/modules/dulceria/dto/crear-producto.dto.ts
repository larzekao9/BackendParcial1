import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * `precioBase` viaja como `number` en el DTO, igual que `valor` en
 * `precios`/`promociones`, aunque la entidad `ProductoDulceria` lo guarde
 * como `string` (Postgres `numeric`, ver comentario en
 * `producto-dulceria.entity.ts`). La conversión `.toString()` se hace en
 * `DulceriaService.crearProducto`, no acá.
 *
 * No incluye `disponible`: el producto nace `disponible=true` por default
 * en la entidad (columna `disponible boolean default true`). Para
 * desactivarlo se usa el PATCH (`ActualizarProductoDto`) o el DELETE
 * (soft-delete), que sí lo exponen/aplican.
 */
export class CrearProductoDto {
  @IsInt()
  idCategoria!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsNumber()
  @IsPositive()
  precioBase!: number;

  @IsOptional()
  @IsIn(['individual', 'combo'])
  tipo?: 'individual' | 'combo';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  etiqueta?: string;
}
