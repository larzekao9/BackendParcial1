import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { UsuariosService } from '../usuarios/usuarios.service.js';
import type { JwtService } from '@nestjs/jwt';

describe('AuthService (login simplificado — decisión de Fase 0)', () => {
  it('firma un JWT cuando existe un usuario con ese nombre y ese rol', async () => {
    const usuariosService = {
      findByNombreYRol: vi.fn().mockResolvedValue({
        idUsuario: 1,
        nombre: 'admin_test',
        rol: 'administrador',
      }),
    } as unknown as UsuariosService;
    const jwtService = {
      signAsync: vi.fn().mockResolvedValue('token-firmado'),
    } as unknown as JwtService;

    const service = new AuthService(usuariosService, jwtService);
    const result = await service.login({ nombre: 'admin_test', rol: 'administrador' });

    expect(result).toEqual({ access_token: 'token-firmado' });
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 1,
      nombre: 'admin_test',
      rol: 'administrador',
    });
  });

  it('rechaza con 401 si no existe un usuario con ese nombre y ese rol', async () => {
    const usuariosService = {
      findByNombreYRol: vi.fn().mockResolvedValue(null),
    } as unknown as UsuariosService;
    const jwtService = { signAsync: vi.fn() } as unknown as JwtService;

    const service = new AuthService(usuariosService, jwtService);

    await expect(
      service.login({ nombre: 'no_existe', rol: 'cliente' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });
});
