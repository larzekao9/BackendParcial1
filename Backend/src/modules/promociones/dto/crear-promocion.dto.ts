import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * `valor` viaja como `number` en el DTO (igual que en `precios`), aunque la
 * entidad `Promocion` lo guarde como `string` — Postgres es `numeric` y
 * TypeORM lo tipa así para no perder precisión (ver comentario en
 * `promocion.entity.ts`). La conversión `.toString()` se hace en
 * `PromocionesService.crear`, no acá.
 *
 * No incluye `activa`: la promoción nace `activa=true` por default en la
 * entidad (columna `activa boolean default true`), no hace falta que el
 * cliente la mande al crear. Para desactivarla se usa el PATCH
 * (`ActualizarPromocionDto`), que sí expone `activa`.
 */
export class CrearPromocionDto {
  @IsString()
  @MaxLength(100)
  nombre!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsIn(['porcentaje', 'monto_fijo'])
  tipoDescuento!: 'porcentaje' | 'monto_fijo';

  @IsNumber()
  @IsPositive()
  valor!: number;

  @IsDateString()
  fechaInicio!: string;

  @IsDateString()
  fechaFin!: string;
}
