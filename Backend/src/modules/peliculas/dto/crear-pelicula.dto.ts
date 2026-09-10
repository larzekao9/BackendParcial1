import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, IsUrl, MaxLength } from 'class-validator';

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

  /** URL de Cloudinary (subida sin firmar desde el frontend, ver src/api/cloudinary.api.ts del frontend). */
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  posterUrl?: string;
}
