import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class CrearInteraccionDto {
  @IsInt({ message: 'El idUsuario debe ser un número entero.' })
  @IsPositive({ message: 'El idUsuario debe ser positivo.' })
  idUsuario!: number;

  @IsOptional()
  @IsInt({ message: 'El idFuncion debe ser un número entero.' })
  @IsPositive({ message: 'El idFuncion debe ser positivo.' })
  idFuncion?: number;

  @IsString()
  @IsNotEmpty({ message: 'La intencionDetectada es obligatoria.' })
  @MaxLength(100, { message: 'La intencionDetectada no puede exceder 100 caracteres.' })
  intencionDetectada!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'El widgetGenerado no puede exceder 50 caracteres.' })
  widgetGenerado?: string;

  @IsOptional()
  @IsString()
  textoTranscrito?: string;
}
