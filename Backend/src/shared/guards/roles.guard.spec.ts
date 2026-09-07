import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import type { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface.js';

function makeContext(user?: JwtPayload) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

describe('RolesGuard (RF11)', () => {
  it('permite el acceso si el endpoint no declara @Roles(...)', () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(makeContext({ sub: 1, nombre: 'x', rol: 'cliente' }))).toBe(
      true,
    );
  });

  it('permite el acceso si el rol del JWT está en la lista de @Roles(...)', () => {
    const reflector = {
      getAllAndOverride: () => ['administrador'],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(
      guard.canActivate(makeContext({ sub: 1, nombre: 'admin', rol: 'administrador' })),
    ).toBe(true);
  });

  it('rechaza con 403 si el rol del JWT no está en la lista de @Roles(...)', () => {
    const reflector = {
      getAllAndOverride: () => ['administrador'],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() =>
      guard.canActivate(makeContext({ sub: 2, nombre: 'cliente_test', rol: 'cliente' })),
    ).toThrow(ForbiddenException);
  });

  it('rechaza si no hay usuario en el request aunque el endpoint requiera un rol', () => {
    const reflector = {
      getAllAndOverride: () => ['administrador'],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
