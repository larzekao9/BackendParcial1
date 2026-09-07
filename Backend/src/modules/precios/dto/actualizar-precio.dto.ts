import { PartialType } from '@nestjs/mapped-types';
import { CrearPrecioDto } from './crear-precio.dto.js';

// A diferencia de `salas` (donde `capacidad` debe quedar inmutable en el
// PATCH), acá no hay ningún campo de `precios` que deba excluirse del
// update parcial — PartialType simple alcanza.
export class ActualizarPrecioDto extends PartialType(CrearPrecioDto) {}
