import { PartialType } from '@nestjs/mapped-types';
import { CrearFuncionDto } from './crear-funcion.dto.js';

export class ActualizarFuncionDto extends PartialType(CrearFuncionDto) {}
