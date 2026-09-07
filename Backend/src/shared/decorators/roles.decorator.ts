import { SetMetadata } from '@nestjs/common';
import type { Rol } from '../../database/entities/usuario.entity.js';

export const ROLES_KEY = 'roles';

/**
 * `@Roles('administrador')` en un endpoint de gestión,
 * `@Roles('cliente', 'administrador')` en uno de consulta/compra.
 * El rol siempre sale del JWT (ver RolesGuard) — nunca de un campo del body.
 */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);
