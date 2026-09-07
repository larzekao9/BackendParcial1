import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class CrearPeliculaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  titulo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  genero?: string;

  @IsInt()
  @IsPositive()
  duracionMin!: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  clasificacion?: string;
}
