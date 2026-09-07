import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { Rol } from '../../database/entities/usuario.entity.js';
import type { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface.js';

/**
 * RF11 — habilita el endpoint solo si el rol del JWT está en la lista de
 * `@Roles(...)`. Se usa siempre DESPUÉS de JwtAuthGuard (necesita `request.user`
 * ya resuelto). Si el endpoint no tiene `@Roles`, no restringe por rol.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Rol[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;

    if (!user || !requiredRoles.includes(user.rol)) {
      throw new ForbiddenException(
        `El rol '${user?.rol ?? 'desconocido'}' no tiene acceso a esta acción.`,
      );
    }

    return true;
  }
}
