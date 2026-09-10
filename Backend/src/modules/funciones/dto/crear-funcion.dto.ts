import { IsDateString, IsInt, IsOptional, IsPositive, IsString, Matches } from 'class-validator';

/** `HH:mm`, 24 horas, minuto 00-59 — mismo formato que espera la columna `time` de Postgres. */
const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CrearFuncionDto {
  @IsInt()
  @IsPositive()
  idPelicula!: number;

  @IsInt()
  @IsPositive()
  idSala!: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  idPrecio?: number;

  @IsDateString()
  fecha!: string;

  @IsString()
  @Matches(HORA_REGEX, { message: 'horaInicio debe tener formato HH:mm.' })
  horaInicio!: string;

  @IsString()
  @Matches(HORA_REGEX, { message: 'horaFin debe tener formato HH:mm.' })
  horaFin!: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  tiempoLimpiezaMin?: number;
}
