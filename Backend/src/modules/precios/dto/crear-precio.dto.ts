import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive } from 'class-validator';

/**
 * `valor` viaja como `number` en el DTO (más natural para el body JSON y
 * para `class-validator`), aunque la entidad `Precio` lo guarde como
 * `string` — Postgres es `numeric` y TypeORM lo tipa así para no perder
 * precisión (ver comentario en `precio.entity.ts`). La conversión
 * `.toString()` se hace en `PreciosService.crear`, no acá.
 */
export class CrearPrecioDto {
  @IsIn(['normal', 'preferencial', 'VIP'])
  tipoAsiento!: 'normal' | 'preferencial' | 'VIP';

  @IsNumber()
  @IsPositive()
  valor!: number;

  @IsDateString()
  vigenteDesde!: string;

  @IsOptional()
  @IsDateString()
  vigenteHasta?: string;
}
