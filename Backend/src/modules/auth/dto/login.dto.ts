import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { Rol } from '../../../database/entities/usuario.entity.js';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre!: string;

  @IsIn(['cliente', 'administrador'])
  rol!: Rol;
}
