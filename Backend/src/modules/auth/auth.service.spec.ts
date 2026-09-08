import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { UsuariosService } from '../usuarios/usuarios.service.js';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';

/** `AuthService` construye un `OAuth2Client` real en el constructor (no hace red, solo guarda config) — necesita un `ConfigService` mínimo aunque el test no toque Google. */
function buildConfigService(): ConfigService {
  return { get: vi.fn().mockReturnValue('fake-google-client-id') } as unknown as ConfigService;
}

interface AuthServiceInternals {
  googleClient: { verifyIdToken: ReturnType<typeof vi.fn> };
}

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

    const service = new AuthService(usuariosService, jwtService, buildConfigService());
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

    const service = new AuthService(usuariosService, jwtService, buildConfigService());

    await expect(
      service.login({ nombre: 'no_existe', rol: 'cliente' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });
});

describe('AuthService.loginConGoogle (2026-09-08 — ver docs/db-schema-notes.md, "Login con Google")', () => {
  function buildService(overrides?: { usuariosService?: Partial<UsuariosService> }) {
    const usuariosService = {
      findByEmail: vi.fn(),
      crearDesdeGoogle: vi.fn(),
      ...overrides?.usuariosService,
    } as unknown as UsuariosService;
    const jwtService = {
      signAsync: vi.fn().mockResolvedValue('token-google'),
    } as unknown as JwtService;

    const service = new AuthService(usuariosService, jwtService, buildConfigService());
    // El `OAuth2Client` real verificaría la firma contra los servidores de
    // Google — se reemplaza por un mock para no pegarle a una API externa
    // desde un test unitario (mismo criterio que el resto del proyecto:
    // ver precios.service.integration.spec.ts para el caso donde SÍ vale
    // la pena una prueba real, contra Postgres).
    (service as unknown as AuthServiceInternals).googleClient = { verifyIdToken: vi.fn() };
    return { service, usuariosService, jwtService };
  }

  function mockGooglePayload(
    service: AuthService,
    payload: { email?: string; sub?: string; name?: string } | null,
  ) {
    (service as unknown as AuthServiceInternals).googleClient.verifyIdToken.mockResolvedValue({
      getPayload: () => payload,
    });
  }

  it('reutiliza el usuario existente por email, sin crear uno nuevo', async () => {
    const { service, usuariosService, jwtService } = buildService({
      usuariosService: {
        findByEmail: vi.fn().mockResolvedValue({ idUsuario: 5, nombre: 'Ana', rol: 'cliente' }),
      },
    });
    mockGooglePayload(service, { email: 'ana@gmail.com', sub: 'google-sub-1', name: 'Ana' });

    const result = await service.loginConGoogle({ idToken: 'token-valido' });

    expect(result).toEqual({ access_token: 'token-google' });
    expect(usuariosService.crearDesdeGoogle).not.toHaveBeenCalled();
    expect(jwtService.signAsync).toHaveBeenCalledWith({ sub: 5, nombre: 'Ana', rol: 'cliente' });
  });

  it('crea un usuario nuevo con rol cliente cuando el email no existe todavía', async () => {
    const { service, usuariosService } = buildService({
      usuariosService: {
        findByEmail: vi.fn().mockResolvedValue(null),
        crearDesdeGoogle: vi
          .fn()
          .mockResolvedValue({ idUsuario: 9, nombre: 'Beto', rol: 'cliente' }),
      },
    });
    mockGooglePayload(service, { email: 'beto@gmail.com', sub: 'google-sub-2', name: 'Beto' });

    await service.loginConGoogle({ idToken: 'token-valido' });

    expect(usuariosService.crearDesdeGoogle).toHaveBeenCalledWith({
      nombre: 'Beto',
      email: 'beto@gmail.com',
      googleId: 'google-sub-2',
    });
  });

  it('rechaza con 401 si el token de Google es inválido', async () => {
    const { service } = buildService();
    (service as unknown as AuthServiceInternals).googleClient.verifyIdToken.mockRejectedValue(
      new Error('invalid_token'),
    );

    await expect(
      service.loginConGoogle({ idToken: 'token-malo' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza con 401 si el payload verificado no trae email', async () => {
    const { service } = buildService();
    mockGooglePayload(service, { sub: 'google-sub-3' });

    await expect(
      service.loginConGoogle({ idToken: 'token-sin-email' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
