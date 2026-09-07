import { PartialType } from '@nestjs/mapped-types';
import { CrearPeliculaDto } from './crear-pelicula.dto.js';

export class ActualizarPeliculaDto extends PartialType(CrearPeliculaDto) {}
