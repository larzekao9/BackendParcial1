import { IsDateString, IsNumber, IsOptional, IsPositive } from 'class-validator';

/**
 * `valor` viaja como `number` en el DTO (más natural para el body JSON y
 * para `class-validator`), aunque la entidad `Precio` lo guarde como
 * `string` — Postgres es `numeric` y TypeORM lo tipa así para no perder
 * precisión (ver comentario en `precio.entity.ts`). La conversión
 * `.toString()` se hace en `PreciosService.crear`, no acá.
 *
 * Ya no lleva `idTipoAsiento` (2026-09-10): el precio cuelga de la función
 * (`funciones.id_precio`), no de un tipo de asiento — ver
 * docs/db-schema-notes.md, "Reversión: tipo de asiento por sala, no por
 * butaca".
 */
export class CrearPrecioDto {
  @IsNumber()
  @IsPositive()
  valor!: number;

  @IsDateString()
  vigenteDesde!: string;

  @IsOptional()
  @IsDateString()
  vigenteHasta?: string;
}
