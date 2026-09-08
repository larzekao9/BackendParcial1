import { IsDateString, IsInt, IsNumber, IsOptional, IsPositive } from 'class-validator';

/**
 * `valor` viaja como `number` en el DTO (más natural para el body JSON y
 * para `class-validator`), aunque la entidad `Precio` lo guarde como
 * `string` — Postgres es `numeric` y TypeORM lo tipa así para no perder
 * precisión (ver comentario en `precio.entity.ts`). La conversión
 * `.toString()` se hace en `PreciosService.crear`, no acá.
 *
 * `idTipoAsiento` es el id de `tipos_asiento` (normal/preferencial/VIP) —
 * antes era un string libre (`tipoAsiento`), corregido junto con la
 * entidad `Precio` (ver docs/db-schema-notes.md, "Normalización
 * tipos_asiento"). No se valida contra la lista fija de nombres acá: es
 * una FK real, Postgres rechaza un id inexistente con 23503.
 */
export class CrearPrecioDto {
  @IsInt()
  @IsPositive()
  idTipoAsiento!: number;

  @IsNumber()
  @IsPositive()
  valor!: number;

  @IsDateString()
  vigenteDesde!: string;

  @IsOptional()
  @IsDateString()
  vigenteHasta?: string;
}
