import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

/**
 * A propósito NO extiende `PartialType(CrearSalaDto)`: cambiar `capacidad`
 * implicaría regenerar los asientos de la sala (fuera de alcance de esta
 * fase), así que ni `capacidad` ni `asientosPorFila` existen acá. Con el
 * `ValidationPipe` global (`forbidNonWhitelisted: true`), si igual llegan
 * esos campos en el body, la request se rechaza con 400 antes de llegar al
 * service.
 */
export class ActualizarSalaDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  tipo?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  tiempoLimpiezaMin?: number;
}
