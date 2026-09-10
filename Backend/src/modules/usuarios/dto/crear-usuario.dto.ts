import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Rol } from '../../../database/entities/usuario.entity.js';

export class CrearUsuarioDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(150, { message: 'El nombre no puede exceder 150 caracteres.' })
  nombre!: string;

  @IsIn(['cliente', 'administrador'], {
    message: "El rol debe ser 'cliente' o 'administrador'.",
  })
  rol!: Rol;

  @IsOptional()
  @IsEmail({}, { message: 'El formato del correo electrónico es inválido.' })
  @MaxLength(255, { message: 'El email no puede exceder 255 caracteres.' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  metodoAuth?: string;
}
