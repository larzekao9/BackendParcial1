import type { Rol } from '../../../database/entities/usuario.entity.js';

/** Forma del payload firmado en el JWT y de `request.user` en cada request autenticado. */
export interface JwtPayload {
  /** id_usuario */
  sub: number;
  nombre: string;
  rol: Rol;
}
