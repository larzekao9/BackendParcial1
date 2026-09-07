import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

/**
 * `asientosPorFila` no es una columna de `salas` — solo decide, en el
 * momento de crear la sala, cómo repartir `capacidad` en filas al generar
 * los `Asiento` (ver SalasService.crear). Default 10 si no viene.
 */
export class CrearSalaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nombre!: string;

  @IsInt()
  @IsPositive()
  capacidad!: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  tipo?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  tiempoLimpiezaMin?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  asientosPorFila?: number;
}
