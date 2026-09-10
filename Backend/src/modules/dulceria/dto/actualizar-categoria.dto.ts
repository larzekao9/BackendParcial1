import { PartialType } from '@nestjs/mapped-types';
import { CrearCategoriaDto } from './crear-categoria.dto.js';

/**
 * A diferencia de `promociones` (donde el PATCH necesita `activa`, un campo
 * ausente en el DTO de creación), acá `categorias_dulceria` no tiene ningún
 * campo que deba quedar inmutable ni ningún flag propio de PATCH — los
 * mismos tres campos de `CrearCategoriaDto`, todos opcionales, alcanzan.
 * `PartialType` es suficiente, no hace falta armar la clase a mano.
 */
export class ActualizarCategoriaDto extends PartialType(CrearCategoriaDto) {}
