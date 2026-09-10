import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CrearCategoriaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nombre!: string;

  @IsOptional()
  @IsInt()
  ordenVisualizacion?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icono?: string;
}
