import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { AccionGestion } from '../../../contracts/service-contracts.js';

export class ContextoIaDto {
  @IsInt({ message: 'El idUsuario debe ser un número entero.' })
  @IsPositive({ message: 'El idUsuario debe ser positivo.' })
  idUsuario!: number;

  @IsIn(['cliente', 'administrador'], {
    message: "El rol debe ser 'cliente' o 'administrador'.",
  })
  rol!: 'cliente' | 'administrador';

  @IsBoolean({ message: 'evidenciaConfirmacion debe ser un valor booleano (true o false).' })
  evidenciaConfirmacion!: boolean;

  @IsOptional()
  @IsString()
  nivelDespliegue?: string;
}

export class EjecutarAccionIaDto {
  @IsObject({ message: 'La accion debe ser un objeto válido.' })
  @IsNotEmptyObject({}, { message: 'La accion no puede estar vacía.' })
  accion!: AccionGestion;

  @IsObject({ message: 'El contexto debe ser un objeto válido.' })
  @ValidateNested()
  @Type(() => ContextoIaDto)
  contexto!: ContextoIaDto;
}
